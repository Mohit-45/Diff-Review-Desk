import { describe, expect, it } from 'vitest';
import { hasNulInPrefix, hasUtf16Signature } from './byteSignatures';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('hasUtf16Signature', () => {
  it('recognises both byte order marks', () => {
    expect(hasUtf16Signature(bytes(0xff, 0xfe))).toBe(true);
    expect(hasUtf16Signature(bytes(0xfe, 0xff))).toBe(true);
    expect(hasUtf16Signature(bytes(0xff, 0xff))).toBe(false);
    expect(hasUtf16Signature(bytes(0xff))).toBe(false);
    expect(hasUtf16Signature(bytes())).toBe(false);
  });

  it('recognises ASCII interleaved with NUL in either order', () => {
    expect(hasUtf16Signature(bytes(0x64, 0x00, 0x69, 0x00))).toBe(true);
    expect(hasUtf16Signature(bytes(0x00, 0x64, 0x00, 0x69))).toBe(true);
    expect(hasUtf16Signature(bytes(0x64, 0x00))).toBe(true);
    expect(hasUtf16Signature(bytes(0x00, 0x64))).toBe(true);
  });

  it('rejects text without the full alternating pattern', () => {
    expect(hasUtf16Signature(bytes(0x64))).toBe(false);
    expect(hasUtf16Signature(bytes(0x64, 0x69))).toBe(false);
    expect(hasUtf16Signature(bytes(0x00, 0x00))).toBe(false);
    expect(hasUtf16Signature(bytes(0x64, 0x00, 0x69, 0x01))).toBe(false);
    expect(hasUtf16Signature(bytes(0x64, 0x00, 0x08, 0x00))).toBe(false);
    expect(hasUtf16Signature(bytes(0x64, 0x00, 0x7f, 0x00))).toBe(false);
  });

  it('only looks at the first 64 bytes', () => {
    const pattern = Array.from({ length: 32 }, () => [0x64, 0x00]).flat();
    expect(hasUtf16Signature(bytes(...pattern, 0xff))).toBe(true);
    expect(hasUtf16Signature(bytes(...pattern.slice(0, 62), 0xff, 0x00))).toBe(false);
  });
});

describe('hasNulInPrefix', () => {
  it('finds a NUL inside the prefix and ignores one beyond it', () => {
    expect(hasNulInPrefix(bytes(1, 2, 0), 3)).toBe(true);
    expect(hasNulInPrefix(bytes(1, 2, 0), 2)).toBe(false);
    expect(hasNulInPrefix(bytes(0), 1)).toBe(true);
    expect(hasNulInPrefix(bytes(1, 2, 3), 8_000)).toBe(false);
    expect(hasNulInPrefix(bytes(), 8_000)).toBe(false);
    expect(hasNulInPrefix(bytes(0), 0)).toBe(false);
  });
});
