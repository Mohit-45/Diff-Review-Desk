import { LIMITS } from '../limits';
import { SECRET_LENGTH_BUCKET } from './config';
import { type HiddenScanOptions, type HiddenSpan, codePointText, findHiddenSpans } from './hidden';
import { findSecretSpans, type SecretSpan } from './secrets';

export type MaskOptions = {
  readonly ruleId?: string;
  readonly sensitive?: boolean;
  /** Show secrets as typed. Hidden characters are still turned into chips. */
  readonly reveal?: boolean;
  readonly maxChars?: number;
  readonly secretSpans?: readonly SecretSpan[];
  readonly hiddenOptions?: HiddenScanOptions;
};

export type VisualTextSegment =
  | {
      readonly kind: 'text';
      readonly text: string;
    }
  | {
      readonly kind: 'hidden';
      readonly codePoint: string;
      readonly label: string;
      readonly ariaLabel: string;
    }
  | {
      readonly kind: 'masked';
      readonly text: string;
      readonly length: number;
      readonly ariaLabel: string;
    };

function roundSecretLength(length: number): number {
  return Math.ceil(length / SECRET_LENGTH_BUCKET) * SECRET_LENGTH_BUCKET;
}

function replacementForSecret(span: SecretSpan): string {
  if (span.publicPrefix !== null) {
    return `${span.publicPrefix}****[${String(roundSecretLength(span.end - span.start))}]`;
  }
  return `[REDACTED:${span.ruleId}]`;
}

function secretAriaLabel(span: SecretSpan): string {
  return `Masked secret, ${String(span.end - span.start)} characters`;
}

function compareSpans(left: { readonly start: number }, right: { readonly start: number }): number {
  return left.start - right.start;
}

type MergeState = {
  readonly text: string;
  readonly segments: VisualTextSegment[];
  cursor: number;
};

function pushGap(state: MergeState, until: number): void {
  if (until > state.cursor) {
    state.segments.push({ kind: 'text', text: state.text.slice(state.cursor, until) });
  }
}

function pushSecret(state: MergeState, secret: SecretSpan): void {
  pushGap(state, secret.start);
  state.segments.push({
    kind: 'masked',
    text: replacementForSecret(secret),
    length: secret.end - secret.start,
    ariaLabel: secretAriaLabel(secret),
  });
  state.cursor = Math.max(state.cursor, secret.end);
}

function pushHidden(state: MergeState, hidden: HiddenSpan): void {
  pushGap(state, hidden.start);
  const point = codePointText(hidden.codePoint);
  state.segments.push({
    kind: 'hidden',
    codePoint: point,
    label: hidden.label,
    ariaLabel: `${point} ${hidden.label}`,
  });
  state.cursor = Math.max(state.cursor, hidden.end);
}

function isSortedByStart(spans: readonly { readonly start: number }[]): boolean {
  let previous = -1;
  for (let index = 0; index < spans.length; index += 1) {
    const start = spans[index]?.start ?? 0;
    if (start < previous) {
      return false;
    }
    previous = start;
  }
  return true;
}

/** The scanners already return spans in text order, so the sort is only a safety net. */
function inTextOrder<T extends { readonly start: number }>(spans: readonly T[]): readonly T[] {
  return isSortedByStart(spans) ? spans : [...spans].sort(compareSpans);
}

/**
 * Merge both span lists in text order; a hidden span inside a masked secret is absorbed.
 * One pass over each list, so a 5 MB line costs time proportional to its length.
 */
export function mergeVisualSegments(
  text: string,
  secrets: readonly SecretSpan[],
  hidden: readonly HiddenSpan[],
): readonly VisualTextSegment[] {
  const state: MergeState = { text, segments: [], cursor: 0 };
  const orderedSecrets = inTextOrder(secrets);
  const orderedHidden = inTextOrder(hidden);
  let secretIndex = 0;
  let hiddenIndex = 0;

  while (secretIndex < orderedSecrets.length || hiddenIndex < orderedHidden.length) {
    const secret = orderedSecrets[secretIndex];
    const hiddenSpan = orderedHidden[hiddenIndex];
    if (secret !== undefined && (hiddenSpan === undefined || secret.start <= hiddenSpan.start)) {
      pushSecret(state, secret);
      secretIndex += 1;
      while (
        hiddenIndex < orderedHidden.length &&
        (orderedHidden[hiddenIndex]?.start ?? 0) < state.cursor
      ) {
        hiddenIndex += 1;
      }
    } else if (hiddenSpan !== undefined) {
      pushHidden(state, hiddenSpan);
      hiddenIndex += 1;
    }
  }
  if (state.cursor < text.length) {
    state.segments.push({ kind: 'text', text: text.slice(state.cursor) });
  }
  return state.segments;
}

function maskedWhole(text: string, ruleId: string): VisualTextSegment {
  return {
    kind: 'masked',
    text: `[REDACTED:${ruleId}]`,
    length: text.length,
    ariaLabel: `Masked secret, ${String(text.length)} characters`,
  };
}

export function visualizeText(
  text: string,
  options: MaskOptions = {},
): readonly VisualTextSegment[] {
  if (options.sensitive && options.reveal !== true) {
    return [maskedWhole(text, options.ruleId ?? 'sensitive-file-added')];
  }
  const secrets = options.reveal === true ? [] : (options.secretSpans ?? findSecretSpans(text));
  const hidden = findHiddenSpans(text, options.hiddenOptions);
  return mergeVisualSegments(text, secrets, hidden);
}

const PEM_END_MARKER = '-----END ';
const PEM_RULE_ID = 'secret-known-token';

/** Offset just after the END line of a private key inside `line`, or -1 while it stays open. */
function pemCloseOffset(line: string): number {
  const endStart = line.indexOf(PEM_END_MARKER);
  const markerEnd = endStart < 0 ? -1 : line.indexOf('-----', endStart + PEM_END_MARKER.length);
  if (markerEnd < 0 || !line.slice(endStart, markerEnd).includes('PRIVATE KEY')) {
    return -1;
  }
  return markerEnd + '-----'.length;
}

/** True when the last secret in the line is a private key that never closes on that line. */
function leavesPemOpen(line: string, secrets: readonly SecretSpan[]): boolean {
  const last = secrets[secrets.length - 1];
  return (
    last !== undefined &&
    last.kind === 'pem' &&
    last.end === line.length &&
    !line.slice(last.start).includes(PEM_END_MARKER)
  );
}

function closePem(line: string, close: number, options: MaskOptions): VisualTextSegment[] {
  const head = maskedWhole(line.slice(0, close), PEM_RULE_ID);
  return [head, ...visualizeText(line.slice(close), options)];
}

/**
 * Segments for every line of a hunk. Masking carries across lines, so a private key is
 * masked from its BEGIN line to its END line, or to the last line when it never closes,
 * and every line of a sensitive file is masked whole. Empty lines stay empty.
 */
export function visualizeLines(
  texts: readonly string[],
  options: MaskOptions = {},
): readonly (readonly VisualTextSegment[])[] {
  if (options.reveal === true || options.sensitive === true) {
    return texts.map((text) => (text.length === 0 ? [] : visualizeText(text, options)));
  }
  let pemOpen = false;
  return texts.map((text) => {
    if (pemOpen) {
      const close = pemCloseOffset(text);
      if (close < 0) {
        return text.length === 0 ? [] : [maskedWhole(text, PEM_RULE_ID)];
      }
      pemOpen = false;
      return closePem(text, close, options);
    }
    const secrets = findSecretSpans(text);
    pemOpen = leavesPemOpen(text, secrets);
    return mergeVisualSegments(text, secrets, findHiddenSpans(text, options.hiddenOptions));
  });
}

function hiddenSourceUnits(segment: { readonly codePoint: string }): number {
  return Number.parseInt(segment.codePoint.slice(2), 16) > 0xffff ? 2 : 1;
}

function sourceUnits(segment: VisualTextSegment): number {
  if (segment.kind === 'text') {
    return segment.text.length;
  }
  return segment.kind === 'hidden' ? hiddenSourceUnits(segment) : segment.length;
}

/** Index to cut `text` at, never between the two halves of a surrogate pair. */
function safeCut(text: string, limit: number): number {
  const previous = text.charCodeAt(limit - 1);
  return previous >= 0xd800 && previous <= 0xdbff ? limit - 1 : limit;
}

export type CutSegments = {
  readonly segments: readonly VisualTextSegment[];
  /** How many characters of the source line the kept segments stand for. */
  readonly shownUnits: number;
};

/**
 * Keep the first `maxUnits` source characters of a line. A masked value or a hidden
 * character that starts before the cut stays whole, so no secret is ever shown half-cut.
 */
export function cutSegments(segments: readonly VisualTextSegment[], maxUnits: number): CutSegments {
  const kept: VisualTextSegment[] = [];
  let used = 0;
  for (const segment of segments) {
    if (used >= maxUnits) {
      break;
    }
    const units = sourceUnits(segment);
    const room = maxUnits - used;
    if (segment.kind !== 'text' || units <= room) {
      kept.push(segment);
      used += units;
      continue;
    }
    const cut = safeCut(segment.text, room);
    if (cut > 0) {
      kept.push({ kind: 'text', text: segment.text.slice(0, cut) });
    }
    used += cut;
    break;
  }
  return { segments: kept, shownUnits: used };
}

function appendCapped(segments: readonly VisualTextSegment[], maxChars: number): string {
  let output = '';
  for (const segment of segments) {
    const value =
      segment.kind === 'text'
        ? segment.text
        : segment.kind === 'hidden'
          ? `[${segment.codePoint}]`
          : segment.text;
    if (segment.kind !== 'text') {
      if (output.length + value.length > maxChars) {
        break;
      }
      output += value;
      continue;
    }
    const remaining = maxChars - output.length;
    if (remaining <= 0) {
      break;
    }
    const characters = Array.from(value.slice(0, remaining * 2));
    output += characters.slice(0, remaining).join('');
    if (characters.length > remaining || value.length > remaining * 2) {
      break;
    }
  }
  return output;
}

export function maskEvidence(text: string, options: MaskOptions = {}): string {
  const segments = visualizeText(text, options);
  return appendCapped(segments, options.maxChars ?? LIMITS.maxExcerptChars);
}

export const maskText = maskEvidence;
export const maskLine = maskEvidence;
export const redactEvidence = maskEvidence;

export { HIDDEN_SET, findHiddenSpans, hiddenLabel } from './hidden';
export { findSecretSpans } from './secrets';
