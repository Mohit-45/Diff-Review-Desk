import { describe, expect, it } from 'vitest';
import { decode, decodeBytesInput, decodeFile } from './decode';

describe('decode', () => {
  it('IN-OVERLIMIT-FILE rejects bytes before parsing', () => {
    const result = decodeBytesInput(new Uint8Array(10 * 1024 * 1024 + 1));
    expect(result).toMatchObject({ ok: false, error: { code: 'too-large' } });
  });

  it('IN-IMAGE-PASTE and binary prefixes reject NUL input while a later NUL is visualised', () => {
    expect(decode('diff --git a/a b/a\n\u0000')).toMatchObject({
      ok: false,
      error: { code: 'binary-input' },
    });
    const later = `${'x'.repeat(8_001)}\u0000`;
    const result = decode(later);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text.endsWith('\u2400')).toBe(true);
      expect(result.value.warnings.some((warning) => warning.code === 'nul-replaced')).toBe(true);
    }
  });

  it('decodes UTF-16 signatures, invalid UTF-8 and exact fence/line-ending transforms', () => {
    expect(decode(new Uint8Array([0xff, 0xfe, 0x64, 0x00]))).toMatchObject({
      ok: false,
      error: { hint: 'utf16' },
    });
    const invalid = decode(new Uint8Array([0x64, 0x69, 0xff, 0x66]));
    expect(invalid.ok).toBe(true);
    if (invalid.ok) {
      expect(invalid.value.warnings.some((warning) => warning.code === 'invalid-utf8')).toBe(true);
    }
    const normalized = decode('```diff\r\ndiff --git a/a b/a\r\n--- a/a\r\n```');
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.value.text).toBe('diff --git a/a b/a\n--- a/a\r');
      expect(normalized.value.warnings.map((warning) => warning.code)).toEqual([
        'fence-unwrapped',
        'crlf-normalised',
      ]);
    }
  });

  it('reports empty whitespace and rejects NUL-bearing pasted text as binary input', () => {
    expect(decode('\uFEFF \n\t')).toMatchObject({ ok: false, error: { code: 'empty' } });
    expect(decode('d\u0000i\u0000f\u0000f')).toMatchObject({
      ok: false,
      error: { code: 'binary-input' },
    });
  });

  it('IN-ZERO-BYTE and IN-READ-FAIL return plain errors without reading twice', async () => {
    let reads = 0;
    const empty = await decodeFile({
      name: 'empty.diff',
      size: 0,
      arrayBuffer: async () => {
        reads += 1;
        return new ArrayBuffer(0);
      },
    });
    expect(empty).toMatchObject({ ok: false, error: { code: 'empty' } });
    expect(reads).toBe(0);
    const failed = await decodeFile({
      name: 'broken.diff',
      size: 4,
      arrayBuffer: async () => {
        throw new Error('read');
      },
    });
    expect(failed).toMatchObject({ ok: false, error: { title: 'Could not read broken.diff' } });
  });
});
