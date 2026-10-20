/** Inclusive code point ranges that render as nothing or change text direction. */
const HIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x7f, 0x9f],
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x0600, 0x0605],
  [0x061c, 0x061c],
  [0x06dd, 0x06dd],
  [0x070f, 0x070f],
  [0x0890, 0x0891],
  [0x08e2, 0x08e2],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180e, 0x180f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0x2800, 0x2800],
  [0x3164, 0x3164],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff9, 0xfffb],
  [0xe0000, 0xe007f],
  [0xe0100, 0xe01ef],
];

function isHiddenOrControl(codePoint: number): boolean {
  if (codePoint < 0x7f) {
    return codePoint <= 0x1f && codePoint !== 0x09;
  }
  for (const [low, high] of HIDDEN_RANGES) {
    if (codePoint >= low && codePoint <= high) {
      return true;
    }
  }
  return false;
}

export function suspiciousLine(text: string): boolean {
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }
    if (isHiddenOrControl(codePoint)) {
      return true;
    }
    index += codePoint > 0xffff ? 2 : 1;
  }
  return false;
}
