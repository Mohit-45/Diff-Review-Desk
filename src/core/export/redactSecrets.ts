import { findSecretSpans } from '../risk/secrets';

export type RedactionResult = {
  readonly text: string;
  readonly count: number;
};

/**
 * Replace every span `findSecretSpans` reports with `[REDACTED:<rule-id>]`.
 * The scan runs over the whole text, so a PEM block crosses lines. A span that
 * crosses lines gets one marker per line, which keeps the line structure that
 * excerpts index into.
 */
export function redactSecrets(text: string): RedactionResult {
  const spans = findSecretSpans(text);
  if (spans.length === 0) {
    return { text, count: 0 };
  }
  const parts: string[] = [];
  let cursor = 0;
  let count = 0;
  for (const span of spans) {
    parts.push(text.slice(cursor, span.start));
    const marker = `[REDACTED:${span.ruleId}]`;
    const lineCount = text.slice(span.start, span.end).split('\n').length;
    parts.push(Array.from({ length: lineCount }, () => marker).join('\n'));
    count += lineCount;
    cursor = span.end;
  }
  parts.push(text.slice(cursor));
  return { text: parts.join(''), count };
}
