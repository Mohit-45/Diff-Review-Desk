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

function utf8FromBytes(bytes: readonly number[]): string | null {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index];
    if (first === undefined) {
      return null;
    }
    if (first < 0x80) {
      result += String.fromCharCode(first);
      continue;
    }
    const width = first < 0xe0 ? 2 : first < 0xf0 ? 3 : first < 0xf8 ? 4 : 0;
    if (width === 0 || index + width > bytes.length) {
      return null;
    }
    let codePoint = width === 2 ? first & 0x1f : width === 3 ? first & 0x0f : first & 0x07;
    for (let offset = 1; offset < width; offset += 1) {
      const part = bytes[index + offset];
      if (part === undefined || (part & 0xc0) !== 0x80) {
        return null;
      }
      codePoint = (codePoint << 6) | (part & 0x3f);
    }
    const minimum = width === 2 ? 0x80 : width === 3 ? 0x800 : 0x10000;
    if (
      codePoint < minimum ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return null;
    }
    result += String.fromCodePoint(codePoint);
    index += width - 1;
  }
  return result;
}

function decodeQuoted(source: string, start: number): Token {
  const bytes: number[] = [];
  let index = start + 1;
  while (index < source.length) {
    const value = source[index];
    if (value === undefined) {
      break;
    }
    if (value === '"') {
      const decoded = utf8FromBytes(bytes);
      return {
        value: decoded ?? '\ufffd',
        end: index + 1,
        quoted: true,
        encodingFailed: decoded === null,
      };
    }
    if (value !== '\\') {
      const codePoint = source.codePointAt(index);
      if (codePoint === undefined) {
        break;
      }
      if (codePoint <= 0xff) {
        bytes.push(codePoint);
      } else {
        const encoded = encodeCodePoint(codePoint);
        for (const byte of encoded) {
          bytes.push(byte);
        }
      }
      index += codePoint > 0xffff ? 2 : 1;
      continue;
    }
    index += 1;
    const escaped = source[index];
    if (escaped === undefined) {
      return { value: '\ufffd', end: source.length, quoted: true, encodingFailed: true };
    }
    if (escaped === 't' || escaped === 'n' || escaped === '"' || escaped === '\\') {
      bytes.push(escaped === 't' ? 0x09 : escaped === 'n' ? 0x0a : escaped.charCodeAt(0));
      index += 1;
      continue;
    }
    if (escaped >= '0' && escaped <= '7') {
      let octal = escaped;
      index += 1;
      for (let count = 1; count < 3; count += 1) {
        const digit = source[index];
        if (digit === undefined || digit < '0' || digit > '7') {
          break;
        }
        octal += digit;
        index += 1;
      }
      bytes.push(Number.parseInt(octal, 8));
      continue;
    }
    bytes.push(escaped.charCodeAt(0));
    index += 1;
  }
  return { value: '\ufffd', end: source.length, quoted: true, encodingFailed: true };
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

export function parseGitHeaderPath(raw: string): ParsedPath {
  const first = readToken(raw, 0);
  let second: Token | null = null;
  if (first !== null) {
    second = readToken(raw, first.end);
  }
  if (first?.quoted && second !== null) {
    if (first.value === second.value) {
      return {
        oldPath: first.value === '/dev/null' ? null : first.value,
        newPath: second.value === '/dev/null' ? null : second.value,
        ambiguous: false,
        encodingFailed: first.encodingFailed || second.encodingFailed,
      };
    }
    return {
      oldPath: pathValue(first.value, 'a/'),
      newPath: pathValue(second.value, 'b/'),
      ambiguous: false,
      encodingFailed: first.encodingFailed || second.encodingFailed,
    };
  }
  const prefixedBoundary = raw.indexOf(' b/');
  if (prefixedBoundary > 0) {
    const oldRaw = raw.slice(0, prefixedBoundary);
    const newRaw = raw.slice(prefixedBoundary + 1);
    const oldValue = pathFromHeaderValue(oldRaw, 'a/');
    const newValue = pathFromHeaderValue(newRaw, 'b/');
    return {
      oldPath: oldValue.path,
      newPath: newValue.path,
      ambiguous: !raw.startsWith('a/'),
      encodingFailed: oldValue.failed || newValue.failed,
    };
  }
  if (first !== null && second !== null) {
    if (first.value === second.value) {
      return {
        oldPath: first.value === '/dev/null' ? null : first.value,
        newPath: second.value === '/dev/null' ? null : second.value,
        ambiguous: false,
        encodingFailed: first.encodingFailed || second.encodingFailed,
      };
    }
    return {
      oldPath: pathValue(first.value, 'a/'),
      newPath: pathValue(second.value, 'b/'),
      ambiguous: false,
      encodingFailed: first.encodingFailed || second.encodingFailed,
    };
  }
  const midpoint = raw.lastIndexOf(' ');
  if (midpoint > 0) {
    const oldRaw = raw.slice(0, midpoint);
    const newRaw = raw.slice(midpoint + 1);
    const oldValue = pathFromHeaderValue(oldRaw, null);
    const newValue = pathFromHeaderValue(newRaw, null);
    return {
      oldPath: oldValue.path,
      newPath: newValue.path,
      ambiguous: true,
      encodingFailed: oldValue.failed || newValue.failed,
    };
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
