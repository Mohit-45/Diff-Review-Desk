const WHITESPACE_CODE_POINTS: ReadonlySet<number> = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  0xfeff,
]);

function isWhitespace(codePoint: number): boolean {
  return WHITESPACE_CODE_POINTS.has(codePoint) || (codePoint >= 0x2000 && codePoint <= 0x200a);
}

export function isBlankText(text: string): boolean {
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined || !isWhitespace(codePoint)) {
      return false;
    }
    index += codePoint > 0xffff ? 2 : 1;
  }
  return true;
}

export function utf8ByteLength(text: string): number {
  let total = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) {
      total += 1;
    } else if (code <= 0x7ff) {
      total += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        total += 4;
        index += 1;
      } else {
        total += 3;
      }
    } else {
      total += 3;
    }
  }
  return total;
}

export function nulInFirstBytes(text: string, limit = 8_000): boolean {
  let bytes = 0;
  for (let index = 0; index < text.length && bytes < limit; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) {
      return true;
    }
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return false;
}
