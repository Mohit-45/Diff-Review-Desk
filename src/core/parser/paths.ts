import { decodeUtf8Strict } from './utf8';

export type ParsedPath = {
  readonly oldPath: string | null;
  readonly newPath: string | null;
  readonly ambiguous: boolean;
  readonly encodingFailed: boolean;
};

type Token = {
  readonly value: string;
  readonly end: number;
  readonly quoted: boolean;
  readonly encodingFailed: boolean;
};

function isSpace(value: string): boolean {
  return value === ' ' || value === '\t';
}

function failedToken(source: string): Token {
  return { value: '\ufffd', end: source.length, quoted: true, encodingFailed: true };
}

function closeQuoted(bytes: readonly number[], closeIndex: number): Token {
  const decoded = decodeUtf8Strict(bytes);
  return {
    value: decoded ?? '\ufffd',
    end: closeIndex + 1,
    quoted: true,
    encodingFailed: decoded === null,
  };
}

/** Append the bytes of the literal character at `index`; return the next index or null. */
function readLiteral(source: string, index: number, bytes: number[]): number | null {
  const codePoint = source.codePointAt(index);
  if (codePoint === undefined) {
    return null;
  }
  if (codePoint <= 0xff) {
    bytes.push(codePoint);
  } else {
    for (const byte of encodeCodePoint(codePoint)) {
      bytes.push(byte);
    }
  }
  return index + (codePoint > 0xffff ? 2 : 1);
}

function readOctal(source: string, first: string, start: number, bytes: number[]): number {
  let octal = first;
  let index = start;
  for (let count = 1; count < 3; count += 1) {
    const digit = source[index];
    if (digit === undefined || digit < '0' || digit > '7') {
      break;
    }
    octal += digit;
    index += 1;
  }
  bytes.push(Number.parseInt(octal, 8));
  return index;
}

/** Append the byte for the escape whose backslash precedes `index`; return the next index or null. */
function readEscape(source: string, index: number, bytes: number[]): number | null {
  const escaped = source[index];
  if (escaped === undefined) {
    return null;
  }
  if (escaped === 't' || escaped === 'n' || escaped === '"' || escaped === '\\') {
    bytes.push(escaped === 't' ? 0x09 : escaped === 'n' ? 0x0a : escaped.charCodeAt(0));
    return index + 1;
  }
  if (escaped >= '0' && escaped <= '7') {
    return readOctal(source, escaped, index + 1, bytes);
  }
  bytes.push(escaped.charCodeAt(0));
  return index + 1;
}

function decodeQuoted(source: string, start: number): Token {
  const bytes: number[] = [];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '"') {
      return closeQuoted(bytes, index);
    }
    const next =
      source[index] === '\\'
        ? readEscape(source, index + 1, bytes)
        : readLiteral(source, index, bytes);
    if (next === null) {
      break;
    }
    index = next;
  }
  return failedToken(source);
}

function encodeCodePoint(codePoint: number): readonly number[] {
  if (codePoint < 0x80) {
    return [codePoint];
  }
  if (codePoint < 0x800) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  }
  if (codePoint < 0x10000) {
    return [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

function readToken(source: string, start: number): Token | null {
  let index = start;
  while (index < source.length && isSpace(source[index] ?? '')) {
    index += 1;
  }
  if (index >= source.length) {
    return null;
  }
  if (source[index] === '"') {
    return decodeQuoted(source, index);
  }
  const begin = index;
  while (index < source.length && !isSpace(source[index] ?? '')) {
    index += 1;
  }
  return { value: source.slice(begin, index), end: index, quoted: false, encodingFailed: false };
}

function stripPrefix(path: string, prefix: 'a/' | 'b/'): string {
  return path.startsWith(prefix) ? path.slice(2) : path;
}

function pathValue(token: string, prefix: 'a/' | 'b/'): string | null {
  return token === '/dev/null' ? null : stripPrefix(token, prefix);
}

function pathFromHeaderValue(
  raw: string,
  prefix: 'a/' | 'b/' | null,
): { path: string | null; failed: boolean } {
  const withoutTimestamp = raw.indexOf('\t');
  const source = withoutTimestamp >= 0 ? raw.slice(0, withoutTimestamp) : raw;
  if (!source.startsWith('"')) {
    if (source === '/dev/null') {
      return { path: null, failed: false };
    }
    return { path: prefix === null ? source : stripPrefix(source, prefix), failed: false };
  }
  const token = readToken(source, 0);
  if (token === null) {
    return { path: null, failed: false };
  }
  if (token.encodingFailed) {
    return { path: '\ufffd', failed: true };
  }
  if (token.value === '/dev/null') {
    return { path: null, failed: false };
  }
  return { path: prefix === null ? token.value : stripPrefix(token.value, prefix), failed: false };
}

export function parseUnifiedHeaderPath(
  raw: string,
  prefix: 'a/' | 'b/' | null,
): { path: string | null; failed: boolean } {
  return pathFromHeaderValue(raw, prefix);
}

function nullIfDevNull(value: string): string | null {
  return value === '/dev/null' ? null : value;
}

function pathsFromTokens(first: Token, second: Token): ParsedPath {
  const encodingFailed = first.encodingFailed || second.encodingFailed;
  if (first.value === second.value) {
    return {
      oldPath: nullIfDevNull(first.value),
      newPath: nullIfDevNull(second.value),
      ambiguous: false,
      encodingFailed,
    };
  }
  return {
    oldPath: pathValue(first.value, 'a/'),
    newPath: pathValue(second.value, 'b/'),
    ambiguous: false,
    encodingFailed,
  };
}

function pathsFromPrefixedBoundary(raw: string, boundary: number): ParsedPath {
  const oldValue = pathFromHeaderValue(raw.slice(0, boundary), 'a/');
  const newValue = pathFromHeaderValue(raw.slice(boundary + 1), 'b/');
  return {
    oldPath: oldValue.path,
    newPath: newValue.path,
    ambiguous: !raw.startsWith('a/'),
    encodingFailed: oldValue.failed || newValue.failed,
  };
}

function pathsFromMidpoint(raw: string, midpoint: number): ParsedPath {
  const oldValue = pathFromHeaderValue(raw.slice(0, midpoint), null);
  const newValue = pathFromHeaderValue(raw.slice(midpoint + 1), null);
  return {
    oldPath: oldValue.path,
    newPath: newValue.path,
    ambiguous: true,
    encodingFailed: oldValue.failed || newValue.failed,
  };
}

export function parseGitHeaderPath(raw: string): ParsedPath {
  const first = readToken(raw, 0);
  const second = first === null ? null : readToken(raw, first.end);
  if (first?.quoted === true && second !== null) {
    return pathsFromTokens(first, second);
  }
  const prefixedBoundary = raw.indexOf(' b/');
  if (prefixedBoundary > 0) {
    return pathsFromPrefixedBoundary(raw, prefixedBoundary);
  }
  if (first !== null && second !== null) {
    return pathsFromTokens(first, second);
  }
  const midpoint = raw.lastIndexOf(' ');
  if (midpoint > 0) {
    return pathsFromMidpoint(raw, midpoint);
  }
  const value = pathFromHeaderValue(raw, null);
  return {
    oldPath: value.path,
    newPath: value.path,
    ambiguous: true,
    encodingFailed: value.failed,
  };
}

export function generatedPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('package-lock.json') ||
    lower.endsWith('yarn.lock') ||
    lower.endsWith('pnpm-lock.yaml') ||
    lower.endsWith('cargo.lock') ||
    lower.endsWith('gemfile.lock') ||
    lower.endsWith('go.sum') ||
    lower.endsWith('composer.lock') ||
    lower.endsWith('.lock') ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('.map')
  );
}
