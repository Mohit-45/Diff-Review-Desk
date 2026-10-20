import { LIMITS } from '../limits';
import type { DiffFile, Hunk } from '../types';
import { escapeOutgoing } from './escape';
import { redactSecrets, type RedactionResult } from './redactSecrets';

export type { RedactionResult };

export type SanitizeOptions = {
  readonly sensitiveFile?: boolean;
  readonly singleLine?: boolean;
  /** Cut every line to this many characters. Only diff excerpt lines pass it. */
  readonly maxChars?: number;
};

const SENSITIVE_FILE_MARKER = '[REDACTED:sensitive-file-added]';

function isSensitivePath(path: string): boolean {
  const normalised = path.replaceAll('\\', '/').toLowerCase();
  const basename = normalised.slice(normalised.lastIndexOf('/') + 1);
  const isExample = /\.env\.(?:example|sample|template)$/.test(basename);
  return (
    (!isExample && (basename === '.env' || basename.startsWith('.env.'))) ||
    /\.(?:pem|key|p12|tfstate)$/.test(basename) ||
    basename === 'id_rsa' ||
    basename === 'id_ed25519' ||
    basename === '.netrc' ||
    (/^serviceaccount[^/]*\.json$/.test(basename) && !isExample)
  );
}

export { isSensitivePath };

/** Secrets only: sensitive-file hunks are redacted line by line, everything else by span. */
function redactRaw(value: string, sensitiveFile = false): RedactionResult {
  if (!sensitiveFile) {
    return redactSecrets(value);
  }
  const lineCount = value.split('\n').length;
  return {
    text: Array.from({ length: lineCount }, () => SENSITIVE_FILE_MARKER).join('\n'),
    count: lineCount,
  };
}

/** Redact secrets, without performing Unicode escaping. */
export function redactText(
  value: string,
  options: { readonly sensitiveFile?: boolean } = {},
): string {
  return redactRaw(value, options.sensitiveFile === true).text;
}

export function redactTextWithCount(
  value: string,
  options: { readonly sensitiveFile?: boolean } = {},
): RedactionResult {
  return redactRaw(value, options.sensitiveFile === true);
}

export const redact = redactText;
export const redactWithCount = redactTextWithCount;
export const redactForExport = sanitizeText;

const ESCAPE_TOKEN = /^(?:\[REDACTED:[a-z0-9-]+\]|\\u\{[0-9A-F]+\})/u;

/** The next unit that must stay whole: an escape token, else one code point. */
function nextPiece(value: string, index: number): string | undefined {
  const token = ESCAPE_TOKEN.exec(value.slice(index))?.[0];
  if (token !== undefined) {
    return token;
  }
  const codePoint = value.codePointAt(index);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

/**
 * Clip an escaped line without splitting a surrogate pair or either of the
 * two token forms emitted by this module.
 */
export function clipEscaped(value: string, maxChars: number = LIMITS.maxExcerptChars): string {
  if (maxChars <= 0) {
    return '';
  }
  let output = '';
  let used = 0;
  let index = 0;
  while (index < value.length) {
    const piece = nextPiece(value, index);
    if (piece === undefined) {
      break;
    }
    const length = Array.from(piece).length;
    if (used + length > maxChars) {
      break;
    }
    output += piece;
    used += length;
    index += piece.length;
  }
  return output;
}

/**
 * Apply the required redaction, hidden-Unicode escaping, cut order. Without
 * `maxChars` nothing is cut: comments, notes, labels and paths keep their text.
 */
export function sanitizeText(value: string, options: SanitizeOptions = {}): RedactionResult {
  const redacted = redactRaw(value, options.sensitiveFile === true);
  const escaped = escapeOutgoing(redacted.text, { singleLine: options.singleLine === true });
  const { maxChars } = options;
  if (maxChars === undefined) {
    return { text: escaped, count: redacted.count };
  }
  if (options.singleLine === true) {
    return { text: clipEscaped(escaped, maxChars), count: redacted.count };
  }
  const lines = escaped.split('\n').map((line) => clipEscaped(line, maxChars));
  return { text: lines.join('\n'), count: redacted.count };
}

export function sanitizeSingleLine(value: string, maxChars?: number): RedactionResult {
  return sanitizeText(value, { singleLine: true, maxChars });
}

export type RedactedHunkLines = {
  readonly lines: readonly string[];
  readonly count: number;
};

/** Sanitize every line of a hunk before an excerpt selects its visible range. */
export function redactHunkLines(
  file: DiffFile | null,
  hunk: Hunk,
  maxChars: number = LIMITS.maxExcerptChars,
): RedactedHunkLines {
  const sensitiveFile = file !== null && isSensitivePath(file.displayPath);
  const source = hunk.lines.map((line) => line.text).join('\n');
  const redacted = redactRaw(source, sensitiveFile);
  // `singleLine: true` turns the line separators into tokens.  Escape each
  // source line separately so the excerpt can retain its line structure.
  const lineTexts = redacted.text
    .split('\n')
    .map((line) => clipEscaped(escapeOutgoing(line, { singleLine: true }), maxChars));
  return { lines: lineTexts, count: redacted.count };
}
