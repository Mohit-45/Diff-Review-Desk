import { LIMITS } from '../limits';
import type { RuleId } from '../types';
import { SECRET_LENGTH_BUCKET } from './config';
import {
  type HiddenScanOptions,
  type HiddenSpan,
  codePointText,
  findHiddenSpans,
  hiddenLabel,
} from './hidden';
import { findSecretSpans, type SecretSpan } from './secrets';

export type MaskOptions = {
  readonly ruleId?: RuleId | string;
  readonly sensitive?: boolean;
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
    return `${span.publicPrefix}****[${roundSecretLength(span.end - span.start)}]`;
  }
  return `[REDACTED:${span.ruleId}]`;
}

function secretAriaLabel(span: SecretSpan): string {
  return `Masked secret, ${span.end - span.start} characters`;
}

function compareSpans(left: { readonly start: number }, right: { readonly start: number }): number {
  return left.start - right.start;
}

function visualSegments(
  text: string,
  secrets: readonly SecretSpan[],
  hidden: readonly HiddenSpan[],
): readonly VisualTextSegment[] {
  const segments: VisualTextSegment[] = [];
  const orderedSecrets = [...secrets].sort(compareSpans);
  const orderedHidden = [...hidden].sort(compareSpans);
  let secretIndex = 0;
  let hiddenIndex = 0;
  let cursor = 0;

  while (secretIndex < orderedSecrets.length || hiddenIndex < orderedHidden.length) {
    const secret = orderedSecrets[secretIndex];
    const hidden = orderedHidden[hiddenIndex];
    const useSecret =
      hidden === undefined || (secret !== undefined && secret.start <= hidden.start);
    if (useSecret && secret !== undefined) {
      if (secret.start > cursor) {
        segments.push({ kind: 'text', text: text.slice(cursor, secret.start) });
      }
      segments.push({
        kind: 'masked',
        text: replacementForSecret(secret),
        length: secret.end - secret.start,
        ariaLabel: secretAriaLabel(secret),
      });
      cursor = Math.max(cursor, secret.end);
      secretIndex += 1;
      while (
        hiddenIndex < orderedHidden.length &&
        (orderedHidden[hiddenIndex]?.start ?? 0) < cursor
      ) {
        hiddenIndex += 1;
      }
      continue;
    }
    if (hidden !== undefined) {
      if (hidden.start > cursor) {
        segments.push({ kind: 'text', text: text.slice(cursor, hidden.start) });
      }
      const point = codePointText(hidden.codePoint);
      segments.push({
        kind: 'hidden',
        codePoint: point,
        label: hidden.label,
        ariaLabel: `${point} ${hidden.label}`,
      });
      cursor = Math.max(cursor, hidden.end);
      hiddenIndex += 1;
    }
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }
  return segments;
}

export function visualizeText(
  text: string,
  options: MaskOptions = {},
): readonly VisualTextSegment[] {
  if (options.sensitive) {
    return [
      {
        kind: 'masked',
        text: `[REDACTED:${options.ruleId ?? 'sensitive-file-added'}]`,
        length: text.length,
        ariaLabel: `Masked secret, ${text.length} characters`,
      },
    ];
  }
  const secrets = options.secretSpans ?? findSecretSpans(text);
  const hidden = findHiddenSpans(text, options.hiddenOptions);
  return visualSegments(text, secrets, hidden);
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
    const characters = Array.from(value);
    output += characters.slice(0, remaining).join('');
    if (characters.length > remaining) {
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
