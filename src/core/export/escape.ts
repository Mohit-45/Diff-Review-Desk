/**
 * The export format is an outbound boundary.  Keep the escaping here small and
 * deterministic: it is deliberately independent of the DOM and of Markdown
 * renderers.
 */

import { HIDDEN_SET } from '../risk/hidden';

export type EscapeOptions = {
  /** Keep line feeds and tabs as layout whitespace when true. */
  readonly multiline?: boolean;
  /** Escape line feeds and tabs as well as the other control characters. */
  readonly singleLine?: boolean;
};

// Spec section 9 also names these general categories for outgoing text; the
// hidden-character definition itself is the shared HIDDEN_SET.
const CONTROL_OR_SEPARATOR = /^[\p{Cc}\p{Zl}\p{Zp}]$/u;

/** TAB and LF are layout whitespace in multi-line fields and escaped in single-line ones. */
function shouldEscape(character: string, codePoint: number, singleLine: boolean): boolean {
  if (codePoint === 0x09 || codePoint === 0x0a) {
    return singleLine;
  }
  return HIDDEN_SET.has(codePoint) || CONTROL_OR_SEPARATOR.test(character);
}

export function escapedCodePoint(codePoint: number): string {
  return `\\u{${codePoint.toString(16).toUpperCase().padStart(4, '0')}}`;
}

/**
 * Escape hidden Unicode and control characters for text leaving the app.
 * Newlines/tabs remain layout whitespace by default; callers that place a
 * value in a single-line Markdown field can pass `{ singleLine: true }`.
 */
export function escapeOutgoing(value: string, options: EscapeOptions | boolean = {}): string {
  const singleLine =
    typeof options === 'boolean'
      ? options
      : options.singleLine === true || options.multiline === false;

  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    // A lone UTF-16 surrogate is not a printable Unicode scalar.  Escaping it
    // also guarantees that clipping never leaves an invalid surrogate behind.
    if (
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      shouldEscape(character, codePoint, singleLine)
    ) {
      result += escapedCodePoint(codePoint);
    } else {
      result += character;
    }
  }
  return result;
}

export function longestBacktickRun(value: string): number {
  let longest = 0;
  let current = 0;
  for (const character of value) {
    if (character === '`') {
      current += 1;
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 0;
    }
  }
  return longest;
}

export type MarkdownInlineOptions = {
  readonly tableCell?: boolean;
};

/** Safely place a single-line value in a Markdown code span. */
export function mdInline(value: string, options: MarkdownInlineOptions | boolean = {}): string {
  const tableCell = typeof options === 'boolean' ? options : options.tableCell === true;
  let escaped = escapeOutgoing(value, { singleLine: true });
  if (tableCell) {
    escaped = escaped.replaceAll('|', '\\|');
  }

  const delimiterLength = Math.min(200, Math.max(1, longestBacktickRun(escaped) + 1));
  const delimiter = '`'.repeat(delimiterLength);
  return `${delimiter}${escaped}${delimiter}`;
}

export const escapeMarkdownInline = mdInline;

/** Prefix every line of an already-sanitised comment with a Markdown quote. */
export function quoteComment(value: string): string {
  return value
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
