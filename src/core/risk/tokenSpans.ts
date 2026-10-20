import { countWork } from './scanWork';
import {
  isBoundary,
  isPlaceholderRange,
  isRepeatedRange,
  lowerKeepingOffsets,
  makeFinder,
  makeRunEnd,
  opaqueTokenEnd,
  skipBlanks,
  tokenEnd,
  type RunEnd,
  type SecretSpan,
} from './secretSpan';

type TokenPrefix = {
  readonly value: string;
  readonly minimumBodyLength: number;
  readonly exactBodyLength?: number;
};

const TOKEN_PREFIXES: readonly TokenPrefix[] = [
  { value: 'AKIA', minimumBodyLength: 16, exactBodyLength: 16 },
  { value: 'ghp_', minimumBodyLength: 20 },
  { value: 'gho_', minimumBodyLength: 20 },
  { value: 'ghu_', minimumBodyLength: 20 },
  { value: 'ghs_', minimumBodyLength: 20 },
  { value: 'ghr_', minimumBodyLength: 20 },
  { value: 'github_pat_', minimumBodyLength: 10 },
  { value: 'xoxb-', minimumBodyLength: 10 },
  { value: 'xoxa-', minimumBodyLength: 10 },
  { value: 'xoxp-', minimumBodyLength: 10 },
  { value: 'xoxr-', minimumBodyLength: 10 },
  { value: 'xoxs-', minimumBodyLength: 10 },
  { value: 'sk_live_', minimumBodyLength: 16 },
  { value: 'rk_live_', minimumBodyLength: 16 },
  { value: 'AIza', minimumBodyLength: 20 },
  { value: 'sk-ant-', minimumBodyLength: 10 },
  { value: 'sk-proj-', minimumBodyLength: 10 },
  { value: 'npm_', minimumBodyLength: 10 },
  { value: 'glpat-', minimumBodyLength: 10 },
] as const;

function hasValidBodyLength(prefix: TokenPrefix, bodyLength: number): boolean {
  return prefix.exactBodyLength === undefined
    ? bodyLength >= prefix.minimumBodyLength
    : bodyLength === prefix.exactBodyLength;
}

/** Checks cheapest first and never copies the body, so a long token run costs one pass. */
function isKnownTokenAt(text: string, prefix: TokenPrefix, index: number, end: number): boolean {
  const bodyStart = index + prefix.value.length;
  return (
    hasValidBodyLength(prefix, end - bodyStart) &&
    isBoundary(index === 0 ? undefined : text[index - 1]) &&
    !isPlaceholderRange(text, bodyStart, end) &&
    !isRepeatedRange(text, bodyStart, end)
  );
}

export function addKnownTokenSpans(text: string, spans: SecretSpan[]): void {
  for (const prefix of TOKEN_PREFIXES) {
    const find = makeFinder(text, prefix.value);
    const runEnd = makeRunEnd(text, tokenEnd);
    let index = find(0);
    while (index >= 0) {
      const end = runEnd(index + prefix.value.length);
      if (isKnownTokenAt(text, prefix, index, end)) {
        spans.push({
          start: index,
          end,
          kind: 'known-token',
          ruleId: 'secret-known-token',
          publicPrefix: prefix.value,
        });
      }
      index = find(index + 1);
    }
  }
}

type JwtRuns = {
  readonly first: RunEnd;
  readonly second: RunEnd;
  readonly third: RunEnd;
};

const JWT_SEGMENT_MIN = 4;

/** End of a three-part token starting at `index`, or -1 when it is not one. */
function jwtEnd(text: string, index: number, runs: JwtRuns): number {
  const firstDot = runs.first(index);
  if (text[firstDot] !== '.') {
    return -1;
  }
  const secondDot = runs.second(firstDot + 1);
  if (text[secondDot] !== '.') {
    return -1;
  }
  const thirdEnd = runs.third(secondDot + 1);
  const sizes = [firstDot - index, secondDot - firstDot - 1, thirdEnd - secondDot - 1];
  if (sizes.some((size) => size < JWT_SEGMENT_MIN) || !isBoundary(text[thirdEnd])) {
    return -1;
  }
  return thirdEnd;
}

export function addJwtSpans(text: string, spans: SecretSpan[]): void {
  const find = makeFinder(text, 'eyJ');
  // One memoised run lookup per segment: occurrences arrive in order, so each
  // segment position is non-decreasing and every run is scanned once.
  const runs: JwtRuns = {
    first: makeRunEnd(text, tokenEnd),
    second: makeRunEnd(text, tokenEnd),
    third: makeRunEnd(text, tokenEnd),
  };
  let index = find(0);
  while (index >= 0) {
    const end = jwtEnd(text, index, runs);
    if (end >= 0) {
      spans.push({
        start: index,
        end,
        kind: 'known-token',
        ruleId: 'secret-known-token',
        publicPrefix: null,
      });
    }
    index = find(index + 1);
  }
}

function isAuthorityEnd(character: string | undefined): boolean {
  return (
    character === '/' ||
    character === '?' ||
    character === '#' ||
    character === '"' ||
    character === "'" ||
    character === ' ' ||
    character === '\t' ||
    character === ')'
  );
}

/**
 * `user:pass@` inside the authority that starts at `authorityStart`: returns the
 * end of the credential, or -1. An authority never contains `/`, so it ends no
 * later than the next `://`, and the scans of different schemes never overlap.
 */
function credentialEnd(text: string, authorityStart: number): number {
  let cursor = authorityStart;
  let colon = -1;
  let at = -1;
  while (cursor < text.length && !isAuthorityEnd(text[cursor])) {
    if (colon < 0 && text[cursor] === ':') {
      colon = cursor;
    }
    if (text[cursor] === '@') {
      at = cursor;
      break;
    }
    cursor += 1;
  }
  countWork(cursor - authorityStart + 1);
  // `colon` is only recorded before the first `@`, so `colon < at` already holds.
  return at > authorityStart && colon > authorityStart && at - colon > 1 ? at : -1;
}

export function addCredentialSpans(text: string, spans: SecretSpan[]): void {
  const find = makeFinder(text, '://');
  let scheme = find(0);
  while (scheme >= 0) {
    const authorityStart = scheme + 3;
    const end = credentialEnd(text, authorityStart);
    if (end >= 0 && !isPlaceholderRange(text, authorityStart, end)) {
      spans.push({
        start: authorityStart,
        end,
        kind: 'url-credentials',
        ruleId: 'secret-known-token',
        publicPrefix: null,
      });
    }
    scheme = find(scheme + 3);
  }
}

export function addBearerSpans(text: string, spans: SecretSpan[]): void {
  const lower = lowerKeepingOffsets(text);
  const find = makeFinder(lower, 'authorization');
  let index = find(0);
  while (index >= 0) {
    let cursor = skipBlanks(text, index + 'authorization'.length);
    if (text[cursor] === ':') {
      cursor = skipBlanks(text, cursor + 1);
      if (lower.startsWith('bearer', cursor)) {
        cursor = skipBlanks(text, cursor + 'bearer'.length);
        const end = opaqueTokenEnd(text, cursor);
        if (end > cursor && !isPlaceholderRange(text, cursor, end)) {
          spans.push({
            start: cursor,
            end,
            kind: 'bearer-token',
            ruleId: 'secret-known-token',
            publicPrefix: null,
          });
        }
      }
    }
    index = find(index + 1);
  }
}
