const BOM_HIGH = 0xff;
const BOM_LOW = 0xfe;
const SIGNATURE_WINDOW_BYTES = 64;
const FIRST_TEXT_BYTE = 0x09;
const LAST_TEXT_BYTE = 0x7e;

function hasUtf16ByteOrderMark(bytes: Uint8Array): boolean {
  const [first, second] = bytes;
  return (first === BOM_HIGH && second === BOM_LOW) || (first === BOM_LOW && second === BOM_HIGH);
}

function isAsciiOrNul(byte: number): boolean {
  return byte === 0 || (byte >= FIRST_TEXT_BYTE && byte <= LAST_TEXT_BYTE);
}

/** True when text bytes sit at `textParity` positions and NUL bytes at the others. */
function alternatesTextWithNul(sample: Uint8Array, textParity: 0 | 1): boolean {
  return sample.every((byte, index) => {
    if (!isAsciiOrNul(byte)) {
      return false;
    }
    return index % 2 === textParity ? byte !== 0 : byte === 0;
  });
}

/** Detects UTF-16 by byte order mark, or by ASCII text interleaved with NUL bytes. */
export function hasUtf16Signature(bytes: Uint8Array): boolean {
  if (hasUtf16ByteOrderMark(bytes)) {
    return true;
  }
  const sample = bytes.subarray(0, SIGNATURE_WINDOW_BYTES);
  if (sample.length < 2) {
    return false;
  }
  return alternatesTextWithNul(sample, 0) || alternatesTextWithNul(sample, 1);
}

export function hasNulInPrefix(bytes: Uint8Array, count: number): boolean {
  return bytes.subarray(0, count).includes(0);
}
