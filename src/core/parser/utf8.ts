export type ByteDecode = {
  readonly text: string;
  readonly invalid: number;
};

type InvalidPolicy = 'replace' | 'fail';

const CHUNK_UNITS = 4096;
const REPLACEMENT_UNIT = 0xfffd;

function sequenceWidth(first: number): number {
  if (first < 0xe0) {
    return 2;
  }
  if (first < 0xf0) {
    return 3;
  }
  return first < 0xf8 ? 4 : 0;
}

function leadBits(first: number, width: number): number {
  if (width === 2) {
    return first & 0x1f;
  }
  return width === 3 ? first & 0x0f : first & 0x07;
}

function minimumFor(width: number): number {
  if (width === 2) {
    return 0x80;
  }
  return width === 3 ? 0x800 : 0x10000;
}

function isScalarValue(codePoint: number, width: number): boolean {
  return (
    codePoint >= minimumFor(width) &&
    codePoint <= 0x10ffff &&
    (codePoint < 0xd800 || codePoint > 0xdfff)
  );
}

function scalarWidth(codePoint: number): number {
  if (codePoint < 0x80) {
    return 1;
  }
  if (codePoint < 0x800) {
    return 2;
  }
  return codePoint < 0x10000 ? 3 : 4;
}

/**
 * Read the scalar value starting at `index`, or return -1 when the bytes there are
 * not a valid sequence. Values above 0xff are masked rather than rejected so that
 * quoted-path escapes (which can push such values) decode exactly as before.
 */
function scalarAt(bytes: ArrayLike<number>, index: number): number {
  const first = bytes[index] ?? 0;
  if (first < 0x80) {
    return first;
  }
  const width = sequenceWidth(first);
  if (width === 0 || index + width > bytes.length) {
    return -1;
  }
  let codePoint = leadBits(first, width);
  for (let offset = 1; offset < width; offset += 1) {
    const part = bytes[index + offset] ?? 0;
    if ((part & 0xc0) !== 0x80) {
      return -1;
    }
    codePoint = (codePoint << 6) | (part & 0x3f);
  }
  return isScalarValue(codePoint, width) ? codePoint : -1;
}

function writeCodePoint(units: Uint16Array, length: number, codePoint: number): number {
  if (codePoint <= 0xffff) {
    units[length] = codePoint;
    return length + 1;
  }
  const offset = codePoint - 0x10000;
  units[length] = 0xd800 + (offset >> 10);
  units[length + 1] = 0xdc00 + (offset & 0x3ff);
  return length + 2;
}

function unitsToString(units: Uint16Array, length: number): string {
  const parts: string[] = [];
  for (let start = 0; start < length; start += CHUNK_UNITS) {
    parts.push(
      String.fromCharCode(...units.subarray(start, Math.min(start + CHUNK_UNITS, length))),
    );
  }
  return parts.join('');
}

type Decoded = ByteDecode & { readonly failed: boolean };

/**
 * Every input byte yields at most one UTF-16 unit, except a four-byte sequence which
 * yields two, so a buffer as long as the input always suffices.
 */
function decodeUtf8(bytes: ArrayLike<number>, policy: InvalidPolicy): Decoded {
  const units = new Uint16Array(bytes.length);
  let length = 0;
  let invalid = 0;
  let index = 0;
  while (index < bytes.length) {
    const codePoint = scalarAt(bytes, index);
    if (codePoint >= 0) {
      length = writeCodePoint(units, length, codePoint);
      index += scalarWidth(codePoint);
      continue;
    }
    if (policy === 'fail') {
      return { text: '', invalid: 1, failed: true };
    }
    units[length] = REPLACEMENT_UNIT;
    length += 1;
    invalid += 1;
    index += 1;
  }
  return { text: unitsToString(units, length), invalid, failed: false };
}

/** Decode with U+FFFD for every invalid lead byte and count the replacements. */
export function decodeUtf8Lossy(bytes: Uint8Array): ByteDecode {
  const { text, invalid } = decodeUtf8(bytes, 'replace');
  return { text, invalid };
}

/** Decode only when every byte belongs to a valid sequence, otherwise return null. */
export function decodeUtf8Strict(bytes: readonly number[]): string | null {
  const decoded = decodeUtf8(bytes, 'fail');
  return decoded.failed ? null : decoded.text;
}
