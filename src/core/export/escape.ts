/**
 * The export format is an outbound boundary.  Keep the escaping here small and
 * deterministic: it is deliberately independent of the DOM and of Markdown
 * renderers.
 */

export type EscapeOptions = {
  /** Keep line feeds and tabs as layout whitespace when true. */
  readonly multiline?: boolean;
  /** Escape line feeds and tabs as well as the other control characters. */
  readonly singleLine?: boolean;
};

const CONTROL_MIN = 0x00;
const CONTROL_MAX = 0x1f;
const C1_MIN = 0x7f;
const C1_MAX = 0x9f;

function isFormatCharacter(codePoint: number): boolean {
  return /\p{Cf}/u.test(String.fromCodePoint(codePoint));
}

/** The export definition of HIDDEN_SET (no visual/emoji exemptions apply). */
export function isHiddenCodePoint(codePoint: number): boolean {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return false;
  }
  return (
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    (codePoint >= 0x200b && codePoint <= 0x200d) ||
    (codePoint >= 0x2060 && codePoint <= 0x2064) ||
    codePoint === 0xfeff ||
    codePoint === 0x00ad ||
    codePoint === 0x034f ||
    codePoint === 0x115f ||
    codePoint === 0x1160 ||
    codePoint === 0x17b4 ||
    codePoint === 0x17b5 ||
    codePoint === 0x180e ||
    codePoint === 0x2800 ||
    codePoint === 0x3164 ||
    codePoint === 0xffa0 ||
    (codePoint >= 0xfff9 && codePoint <= 0xfffb) ||
    (codePoint >= 0xe0000 && codePoint <= 0xe007f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x0085 ||
    isFormatCharacter(codePoint) ||
    (codePoint >= CONTROL_MIN && codePoint <= CONTROL_MAX) ||
    (codePoint >= C1_MIN && codePoint <= C1_MAX)
  );
}

function shouldEscape(codePoint: number, singleLine: boolean): boolean {
  if (isHiddenCodePoint(codePoint)) {
    return !(codePoint === 0x09 || codePoint === 0x0a) || singleLine;
  }

  // U+2028/U+2029 are included above, but this explicit branch documents the
  // line-separator requirement and protects the behavior if the set changes.
  return codePoint === 0x2028 || codePoint === 0x2029;
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
    if ((codePoint >= 0xd800 && codePoint <= 0xdfff) || shouldEscape(codePoint, singleLine)) {
      result += escapedCodePoint(codePoint);
    } else {
      result += character;
    }
  }
  return result;
}

function longestBacktickRun(value: string): number {
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
