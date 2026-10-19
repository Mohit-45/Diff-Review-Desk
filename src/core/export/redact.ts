import { LIMITS } from '../limits';
import type { DiffFile, Hunk } from '../types';
import { escapeOutgoing } from './escape';

export type RedactionResult = {
  readonly text: string;
  readonly count: number;
};

export type SanitizeOptions = {
  readonly sensitiveFile?: boolean;
  readonly singleLine?: boolean;
  readonly maxChars?: number;
};

const REDACTED_PATH = '[REDACTED:path]';
const REDACTED_METADATA = '[REDACTED:metadata]';

type Span = {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
  readonly priority: number;
};

type SecretRule = {
  readonly id: string;
  readonly pattern: RegExp;
};

// Keep the patterns deliberately specific.  A broad "token" matcher would
// hide ordinary source text and, worse, would make the export less useful.
const SECRET_RULES: readonly SecretRule[] = [
  { id: 'secret-known-token', pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g },
  { id: 'secret-known-token', pattern: /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}/g },
  { id: 'secret-known-token', pattern: /xox[abprs]-[A-Za-z0-9-]{8,}/g },
  { id: 'secret-known-token', pattern: /(?:sk_live_|rk_live_|sk-ant-|sk-proj-)[A-Za-z0-9_-]{8,}/g },
  { id: 'secret-known-token', pattern: /(?:npm_|glpat-)[A-Za-z0-9_-]{8,}/g },
  { id: 'secret-known-token', pattern: /AIza[A-Za-z0-9_-]{20,}/g },
  {
    id: 'secret-known-token',
    pattern: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    id: 'secret-known-token',
    pattern: /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@[^\s]+/gi,
  },
  {
    id: 'secret-known-token',
    pattern: /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  },
  {
    id: 'secret-known-token',
    pattern: /https?:\/\/(?:hooks\.)?(?:slack|discord)\.[^\s"'<>]+/gi,
  },
];

const ASSIGNMENT_KEY = /(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*/gi;
const MACHINE_PATH =
  /(?:file:\/\/|[A-Za-z]:[\\/]|\\\\(?:[^\\/\s]+[\\/])|\/(?:Users|home|private|tmp|var|opt|Applications|root|mnt|workspace|workspaces|etc|usr|bin|sbin|lib|Volumes|System)\/)[^\s"'`<>)]*/gi;
const PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g;
const PRIVATE_KEY_END = /-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

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

function isRepeated(value: string): boolean {
  if (value.length < 8) {
    return false;
  }
  const first = value[0];
  return first !== undefined && [...value].every((character) => character === first);
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower === 'changeme' ||
    lower === 'change-me' ||
    lower.startsWith('your-') ||
    lower.startsWith('your_') ||
    lower.includes('${') ||
    lower.startsWith('<') ||
    lower.endsWith('>')
  );
}

function repeatedKnownTokenBody(value: string): boolean {
  const prefix =
    /^(?:AKIA|ASIA|gh[pousr]_|github_pat_|xox[abprs]-|sk_live_|rk_live_|sk-ant-|sk-proj-|npm_|glpat-|AIza)/i.exec(
      value,
    )?.[0];
  return prefix !== undefined && isRepeated(value.slice(prefix.length).replaceAll('-', ''));
}

function assignmentSpans(line: string): Span[] {
  const spans: Span[] = [];
  ASSIGNMENT_KEY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ASSIGNMENT_KEY.exec(line)) !== null) {
    let valueStart = match.index + match[0].length;
    while (valueStart < line.length && /\s/u.test(line[valueStart] ?? '')) {
      valueStart += 1;
    }
    const quote = line[valueStart];
    if (quote !== '"' && quote !== "'") {
      continue;
    }
    const end = line.indexOf(quote, valueStart + 1);
    if (end < 0) {
      continue;
    }
    const value = line.slice(valueStart + 1, end);
    if (value.length < 8 || value.length > 120 || isRepeated(value) || isPlaceholder(value)) {
      continue;
    }
    spans.push({
      start: valueStart + 1,
      end,
      replacement: '[REDACTED:secret-assignment]',
      priority: 20,
    });
  }
  return spans;
}

function regexSpans(line: string): Span[] {
  const spans: Span[] = [];
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(line)) !== null) {
      if (rule.id === 'secret-known-token' && repeatedKnownTokenBody(match[0])) {
        continue;
      }
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        replacement: `[REDACTED:${rule.id}]`,
        priority: 10,
      });
      if (match[0].length === 0) {
        rule.pattern.lastIndex += 1;
      }
    }
  }
  spans.push(...assignmentSpans(line));
  MACHINE_PATH.lastIndex = 0;
  let pathMatch: RegExpExecArray | null;
  while ((pathMatch = MACHINE_PATH.exec(line)) !== null) {
    spans.push({
      start: pathMatch.index,
      end: pathMatch.index + pathMatch[0].length,
      replacement: REDACTED_PATH,
      priority: 30,
    });
  }
  return spans;
}

function applySpans(line: string, spans: readonly Span[]): RedactionResult {
  const ordered = [...spans].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return right.end - left.end;
  });

  let cursor = 0;
  let count = 0;
  let result = '';
  for (const span of ordered) {
    if (span.start < cursor || span.end <= span.start) {
      continue;
    }
    result += line.slice(cursor, span.start);
    result += span.replacement;
    cursor = span.end;
    count += 1;
  }
  result += line.slice(cursor);
  return { text: result, count };
}

type PemState = { active: boolean };

function redactPrivateKey(line: string, state: PemState): RedactionResult {
  let rest = line;
  let result = '';
  let count = 0;

  while (rest.length > 0) {
    if (state.active) {
      PRIVATE_KEY_END.lastIndex = 0;
      const end = PRIVATE_KEY_END.exec(rest);
      if (end === null) {
        return { text: `${result}[REDACTED:secret-known-token]`, count: count + 1 };
      }
      result += '[REDACTED:secret-known-token]';
      count += 1;
      rest = rest.slice(end.index + end[0].length);
      state.active = false;
      continue;
    }

    PRIVATE_KEY_BEGIN.lastIndex = 0;
    const begin = PRIVATE_KEY_BEGIN.exec(rest);
    if (begin === null) {
      result += rest;
      break;
    }
    result += rest.slice(0, begin.index);
    state.active = true;
    rest = rest.slice(begin.index);
  }

  return { text: result, count };
}

function redactLine(line: string, state: PemState, sensitiveFile: boolean): RedactionResult {
  if (/^\s*(?:author|from|signed-off-by|co-authored-by):/iu.test(line)) {
    return { text: REDACTED_METADATA, count: 1 };
  }
  if (sensitiveFile) {
    return { text: '[REDACTED:sensitive-file-added]', count: 1 };
  }

  const privateKey = redactPrivateKey(line, state);
  const spans = regexSpans(privateKey.text);
  const rest = applySpans(privateKey.text, spans);
  return { text: rest.text, count: privateKey.count + rest.count };
}

function redactRaw(value: string, sensitiveFile = false): RedactionResult {
  const state: PemState = { active: false };
  const sourceLines = value.split('\n');
  const redacted: string[] = [];
  let count = 0;
  for (const line of sourceLines) {
    const result = redactLine(line, state, sensitiveFile);
    redacted.push(result.text);
    count += result.count;
  }
  return { text: redacted.join('\n'), count };
}

/** Redact secrets and machine metadata, without performing Unicode escaping. */
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

function codePointLength(value: string): number {
  return [...value].length;
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
    const remainder = value.slice(index);
    const token = /^(?:\[REDACTED:[a-z0-9-]+\]|\\u\{[0-9A-F]+\})/u.exec(remainder)?.[0];
    const piece = token ?? [...remainder][0];
    if (piece === undefined) {
      break;
    }
    const length = codePointLength(piece);
    if (used + length > maxChars) {
      break;
    }
    output += piece;
    used += length;
    index += piece.length;
  }
  return output;
}

/** Apply the required redaction → hidden-Unicode escaping → clipping order. */
export function sanitizeText(value: string, options: SanitizeOptions = {}): RedactionResult {
  const redacted = redactRaw(value, options.sensitiveFile === true);
  const escaped = escapeOutgoing(redacted.text, { singleLine: options.singleLine === true });
  const maxChars = options.maxChars ?? LIMITS.maxExcerptChars;
  if (options.singleLine === true) {
    return { text: clipEscaped(escaped, maxChars), count: redacted.count };
  }
  const lines = escaped.split('\n').map((line) => clipEscaped(line, maxChars));
  return { text: lines.join('\n'), count: redacted.count };
}

export function sanitizeSingleLine(
  value: string,
  maxChars: number = LIMITS.maxExcerptChars,
): RedactionResult {
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
