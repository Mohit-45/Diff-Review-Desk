export type SecretKind =
  'known-token' | 'url-credentials' | 'bearer-token' | 'webhook' | 'pem' | 'assignment';

export type SecretSpan = {
  readonly start: number;
  readonly end: number;
  readonly kind: SecretKind;
  readonly ruleId: 'secret-known-token' | 'secret-assignment';
  readonly publicPrefix: string | null;
};

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

const ASSIGNMENT_NAMES = [
  'api_key',
  'apikey',
  'secret',
  'token',
  'password',
  'passwd',
  'private_key',
  'privatekey',
] as const;

const SAFE_ASSIGNMENT_SUFFIXES = ['_type', '_url', '_name', '_id'] as const;

function isTokenCharacter(character: string | undefined): boolean {
  if (character === undefined) {
    return false;
  }
  const code = character.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    character === '_' ||
    character === '-'
  );
}

function isBoundary(character: string | undefined): boolean {
  return !isTokenCharacter(character);
}

function tokenEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && isTokenCharacter(text[end])) {
    end += 1;
  }
  return end;
}

function opaqueTokenEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length) {
    const character = text[end];
    if (
      !isTokenCharacter(character) &&
      character !== '.' &&
      character !== '~' &&
      character !== '+' &&
      character !== '/' &&
      character !== '='
    ) {
      break;
    }
    end += 1;
  }
  return end;
}

function isRepeatedBody(body: string): boolean {
  if (body.length < 4) {
    return false;
  }
  const first = body[0];
  if (first === undefined) {
    return false;
  }
  for (const character of body) {
    if (character !== first) {
      return false;
    }
  }
  return true;
}

function isPlaceholderBody(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.startsWith('${') ||
    lower.startsWith('<') ||
    lower === 'changeme' ||
    lower.startsWith('your-') ||
    lower.startsWith('your_')
  );
}

function addKnownTokenSpans(text: string, spans: SecretSpan[]): void {
  for (const prefix of TOKEN_PREFIXES) {
    let index = text.indexOf(prefix.value);
    while (index >= 0) {
      const bodyStart = index + prefix.value.length;
      const end = tokenEnd(text, bodyStart);
      const body = text.slice(bodyStart, end);
      const validLength =
        prefix.exactBodyLength === undefined
          ? body.length >= prefix.minimumBodyLength
          : body.length === prefix.exactBodyLength;
      const before = index === 0 ? undefined : text[index - 1];
      if (validLength && isBoundary(before) && !isPlaceholderBody(body) && !isRepeatedBody(body)) {
        spans.push({
          start: index,
          end,
          kind: 'known-token',
          ruleId: 'secret-known-token',
          publicPrefix: prefix.value,
        });
      }
      index = text.indexOf(prefix.value, index + 1);
    }
  }
}

function addJwtSpans(text: string, spans: SecretSpan[]): void {
  let index = text.indexOf('eyJ');
  while (index >= 0) {
    const firstEnd = tokenEnd(text, index);
    const firstDot = text.indexOf('.', index);
    if (firstDot > index && firstDot === firstEnd) {
      const secondEnd = tokenEnd(text, firstDot + 1);
      const secondDot = text.indexOf('.', firstDot + 1);
      if (secondDot > firstDot && secondDot === secondEnd) {
        const thirdEnd = tokenEnd(text, secondDot + 1);
        const firstSize = firstDot - index;
        const secondSize = secondDot - firstDot - 1;
        const thirdSize = thirdEnd - secondDot - 1;
        if (firstSize >= 4 && secondSize >= 4 && thirdSize >= 4 && isBoundary(text[thirdEnd])) {
          spans.push({
            start: index,
            end: thirdEnd,
            kind: 'known-token',
            ruleId: 'secret-known-token',
            publicPrefix: null,
          });
        }
      }
    }
    index = text.indexOf('eyJ', index + 1);
  }
}

function addCredentialSpans(text: string, spans: SecretSpan[]): void {
  let scheme = text.indexOf('://');
  while (scheme >= 0) {
    const authorityStart = scheme + 3;
    let authorityEnd = authorityStart;
    while (authorityEnd < text.length && !isAuthorityEnd(text[authorityEnd])) {
      authorityEnd += 1;
    }
    const authority = text.slice(authorityStart, authorityEnd);
    const at = authority.indexOf('@');
    const colon = authority.indexOf(':');
    if (at > 0 && colon > 0 && colon < at && at - colon > 1 && at < authority.length) {
      const credential = authority.slice(0, at);
      if (!isPlaceholderBody(credential)) {
        spans.push({
          start: authorityStart,
          end: authorityStart + at,
          kind: 'url-credentials',
          ruleId: 'secret-known-token',
          publicPrefix: null,
        });
      }
    }
    scheme = text.indexOf('://', scheme + 3);
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

function addBearerSpans(text: string, spans: SecretSpan[]): void {
  const lower = text.toLowerCase();
  let index = lower.indexOf('authorization');
  while (index >= 0) {
    let cursor = index + 'authorization'.length;
    while (text[cursor] === ' ' || text[cursor] === '\t') {
      cursor += 1;
    }
    if (text[cursor] === ':') {
      cursor += 1;
      while (text[cursor] === ' ' || text[cursor] === '\t') {
        cursor += 1;
      }
      if (lower.startsWith('bearer', cursor)) {
        cursor += 'bearer'.length;
        while (text[cursor] === ' ' || text[cursor] === '\t') {
          cursor += 1;
        }
        const end = opaqueTokenEnd(text, cursor);
        const body = text.slice(cursor, end);
        if (body.length > 0 && !isPlaceholderBody(body)) {
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
    index = lower.indexOf('authorization', index + 1);
  }
}

function addWebhookSpans(text: string, spans: SecretSpan[]): void {
  const lower = text.toLowerCase();
  const markers = [
    'https://hooks.slack.com/services/',
    'https://discord.com/api/webhooks/',
  ] as const;
  for (const marker of markers) {
    let index = lower.indexOf(marker);
    while (index >= 0) {
      let end = index + marker.length;
      while (end < text.length && !isWebhookEnd(text[end])) {
        end += 1;
      }
      if (end > index + marker.length) {
        spans.push({
          start: index,
          end,
          kind: 'webhook',
          ruleId: 'secret-known-token',
          publicPrefix: null,
        });
      }
      index = lower.indexOf(marker, index + marker.length);
    }
  }
}

function isWebhookEnd(character: string | undefined): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '"' ||
    character === "'" ||
    character === ')' ||
    character === ']' ||
    character === '}' ||
    character === ','
  );
}

function addPemSpans(text: string, spans: SecretSpan[]): void {
  let index = text.indexOf('-----BEGIN ');
  while (index >= 0) {
    const headerEnd = text.indexOf('-----', index + '-----BEGIN '.length);
    const header = headerEnd < 0 ? '' : text.slice(index, headerEnd);
    if (
      header.includes('PRIVATE KEY') &&
      !header.includes('CERTIFICATE') &&
      !header.includes('PUBLIC KEY')
    ) {
      const endStart = text.indexOf('-----END ', index + header.length);
      const endMarkerEnd = endStart < 0 ? -1 : text.indexOf('-----', endStart + '-----END '.length);
      const end =
        endStart < 0 || endMarkerEnd < 0
          ? -1
          : text.slice(endStart, endMarkerEnd).includes('PRIVATE KEY')
            ? endMarkerEnd + '-----'.length
            : -1;
      spans.push({
        start: index,
        end: end < 0 ? text.length : end,
        kind: 'pem',
        ruleId: 'secret-known-token',
        publicPrefix: null,
      });
    }
    index = text.indexOf('-----BEGIN ', index + 1);
  }
}

function isAssignmentStart(text: string, index: number): boolean {
  const character = text[index - 1];
  if (character === undefined || character === '_' || character === '-' || character === '.') {
    return true;
  }
  const code = character.charCodeAt(0);
  return !(
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function isAssignmentEnd(text: string, end: number): boolean {
  const character = text[end];
  if (character === undefined || character === '_' || character === '-' || character === '.') {
    return true;
  }
  const code = character.charCodeAt(0);
  return !(
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function hasSafeSuffix(text: string, end: number): boolean {
  for (const suffix of SAFE_ASSIGNMENT_SUFFIXES) {
    if (text.startsWith(suffix, end)) {
      return true;
    }
  }
  return false;
}

function addAssignmentSpans(text: string, spans: SecretSpan[]): void {
  const lower = text.toLowerCase();
  for (const name of ASSIGNMENT_NAMES) {
    let index = lower.indexOf(name);
    while (index >= 0) {
      const endName = index + name.length;
      if (
        isAssignmentStart(text, index) &&
        isAssignmentEnd(text, endName) &&
        !hasSafeSuffix(lower, endName)
      ) {
        let cursor = endName;
        while (text[cursor] === ' ' || text[cursor] === '\t') {
          cursor += 1;
        }
        if (text[cursor] === '=' || text[cursor] === ':') {
          cursor += 1;
          while (text[cursor] === ' ' || text[cursor] === '\t') {
            cursor += 1;
          }
          const quote = text[cursor];
          if (quote === '"' || quote === "'") {
            const valueStart = cursor + 1;
            const valueEnd = text.indexOf(quote, valueStart);
            if (valueEnd >= valueStart) {
              const value = text.slice(valueStart, valueEnd);
              if (value.length >= 8 && value.length <= 120 && !isPlaceholderBody(value)) {
                spans.push({
                  start: valueStart,
                  end: valueEnd,
                  kind: 'assignment',
                  ruleId: 'secret-assignment',
                  publicPrefix: null,
                });
              }
            }
          }
        }
      }
      index = lower.indexOf(name, index + 1);
    }
  }
}

function spanPriority(kind: SecretKind): number {
  if (kind === 'pem' || kind === 'assignment') {
    return 7;
  }
  if (kind === 'webhook' || kind === 'url-credentials') {
    return 5;
  }
  if (kind === 'known-token' || kind === 'bearer-token') {
    return 4;
  }
  return 3;
}

function mergeSpans(spans: readonly SecretSpan[]): readonly SecretSpan[] {
  const sorted = [...spans].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    const priority = spanPriority(right.kind) - spanPriority(left.kind);
    return priority === 0 ? right.end - left.end : priority;
  });
  const merged: SecretSpan[] = [];
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && span.start < previous.end) {
      continue;
    }
    merged.push(span);
  }
  return merged;
}

export function findSecretSpans(text: string): readonly SecretSpan[] {
  const spans: SecretSpan[] = [];
  addKnownTokenSpans(text, spans);
  addJwtSpans(text, spans);
  addCredentialSpans(text, spans);
  addBearerSpans(text, spans);
  addWebhookSpans(text, spans);
  addPemSpans(text, spans);
  addAssignmentSpans(text, spans);
  return mergeSpans(spans);
}

export { HIDDEN_SET, findHiddenSpans, hiddenLabel, isHiddenCodePoint } from './hidden';
