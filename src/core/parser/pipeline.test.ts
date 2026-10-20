import { describe, expect, it } from 'vitest';
import { hasStructuralEscape, stripAnsi } from './ansi';
import { suspiciousLine } from './hidden-chars';
import { prepareBytes, prepareText } from './pipeline';
import { isBlankText, nulInFirstBytes, utf8ByteLength } from './text-chars';
import { decodeUtf8Lossy, decodeUtf8Strict } from './utf8';

const ESC = '\u001b';

describe('text character helpers', () => {
  it('treats Unicode spaces, NBSP and a lone BOM as blank but not zero-width space', () => {
    expect(isBlankText('')).toBe(true);
    expect(isBlankText(' \t\r\n\u{00A0}\u{FEFF}\u{2003}\u{3000}\u{2028}')).toBe(true);
    expect(isBlankText('\u{200B}')).toBe(false);
    expect(isBlankText(' \u{1F600}')).toBe(false);
    expect(isBlankText('a')).toBe(false);
  });

  it('counts UTF-8 bytes per scalar and treats a lone surrogate as three bytes', () => {
    expect(utf8ByteLength('a')).toBe(1);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('中')).toBe(3);
    expect(utf8ByteLength('\u{1F600}')).toBe(4);
    expect(utf8ByteLength('\ud800')).toBe(3);
    expect(utf8ByteLength('\ud800a')).toBe(4);
  });

  it('finds NUL only inside the leading byte window', () => {
    expect(nulInFirstBytes('\0')).toBe(true);
    expect(nulInFirstBytes(`${'a'.repeat(8_000)}\0`)).toBe(false);
    expect(nulInFirstBytes(`${'a'.repeat(7_999)}\0`)).toBe(true);
    expect(nulInFirstBytes('éé\0', 4)).toBe(false);
    expect(nulInFirstBytes('é\0', 4)).toBe(true);
  });
});

describe('hidden character detection', () => {
  it.each([
    ['C0 control', '\u0001'],
    ['DEL', '\u007f'],
    ['C1 control', '\u0085'],
    ['soft hyphen', '\u{00AD}'],
    ['arabic number sign', '\u{0601}'],
    ['zero width space', '\u{200B}'],
    ['right-to-left override', '\u{202E}'],
    ['line separator', '\u{2028}'],
    ['word joiner', '\u{2060}'],
    ['isolate', '\u{2066}'],
    ['inhibit swapping', '\u{206A}'],
    ['braille blank', '⠀'],
    ['BOM', '\u{FEFF}'],
    ['halfwidth hangul filler', 'ﾠ'],
    ['tag character', '\u{E0041}'],
    ['variation selector supplement', '\u{E0100}'],
  ])('flags %s', (_name, value) => {
    expect(suspiciousLine(`a${value}b`)).toBe(true);
  });

  it.each([
    ['tab', '\t'],
    ['plain text', 'plain ascii'],
    ['accented letter', 'é'],
    ['astral emoji', '\u{1F600}'],
    ['unassigned code point between the invisible ranges', '⁥'],
    ['no-break space', '\u{00A0}'],
  ])('does not flag %s', (_name, value) => {
    expect(suspiciousLine(`a${value}b`)).toBe(false);
  });
});

describe('ANSI handling', () => {
  it('recognises an escape only when a structural line follows the sequence', () => {
    expect(hasStructuralEscape(`${ESC}[1mdiff --git a/x b/x`)).toBe(true);
    expect(hasStructuralEscape(`${ESC}]0;title\u0007--- a/x`)).toBe(true);
    expect(hasStructuralEscape(`${ESC}]0;title${ESC}\\+++ b/x`)).toBe(true);
    expect(hasStructuralEscape(`${ESC}[31m-removed${ESC}[m`)).toBe(false);
    expect(hasStructuralEscape('diff --git a/x b/x')).toBe(false);
    expect(hasStructuralEscape('')).toBe(false);
  });

  it('strips CSI and OSC sequences and nothing else', () => {
    expect(stripAnsi(`${ESC}[1;31mred${ESC}[m text`)).toBe('red text');
    expect(stripAnsi(`${ESC}]8;;link\u0007label${ESC}]8;;\u0007`)).toBe('label');
    expect(stripAnsi(`${ESC}]0;t${ESC}\\after`)).toBe('after');
    expect(stripAnsi('no escapes')).toBe('no escapes');
  });
});

describe('prepareText', () => {
  it('normalises CRLF only when every LF is preceded by CR', () => {
    const crlf = prepareText('a\r\nb\r\n');
    expect(crlf.lines).toEqual(['a', 'b']);
    expect(crlf.warnings.map((warning) => warning.code)).toEqual(['crlf-normalised']);
    const mixed = prepareText('a\r\nb\n');
    expect(mixed.lines).toEqual(['a\r', 'b']);
    expect(mixed.warnings.map((warning) => warning.code)).toEqual(['mixed-eol']);
  });

  it('splits on LF only and drops no phantom final line', () => {
    expect(prepareText('a\nb\n').lines).toEqual(['a', 'b']);
    expect(prepareText('a\nb').lines).toEqual(['a', 'b']);
    expect(prepareText('a\n\n').lines).toEqual(['a', '']);
  });

  it('unwraps exactly one fence with a plain info string', () => {
    const fenced = prepareText('```diff\n--- a/x\n```\n');
    expect(fenced.lines).toEqual(['--- a/x']);
    expect(fenced.warnings.map((warning) => warning.code)).toEqual(['fence-unwrapped']);
    expect(prepareText('```js title\nx\n```').lines).toEqual(['```js title', 'x', '```']);
  });

  it('strips ANSI only when a structural line starts with ESC', () => {
    const structural = prepareText(`${ESC}[1mdiff --git a/x b/x${ESC}[m\n+${ESC}[32madd${ESC}[m\n`);
    expect(structural.lines).toEqual(['diff --git a/x b/x', '+add']);
    expect(structural.warnings.map((warning) => warning.code)).toEqual(['ansi-stripped']);
    const content = prepareText(`+${ESC}[32madd${ESC}[m\n`);
    expect(content.lines).toEqual([`+${ESC}[32madd${ESC}[m`]);
    expect(content.warnings).toEqual([]);
  });

  it('replaces NUL with U+2400, records the lines and counts the occurrences', () => {
    const prepared = prepareText('a\0b\nclean\n\0\0\n');
    expect(prepared.lines).toEqual(['a␀b', 'clean', '␀␀']);
    expect([...prepared.nulLines]).toEqual([0, 2]);
    expect(prepared.warnings).toEqual([
      {
        code: 'nul-replaced',
        count: 3,
        sample: 'NUL characters were replaced with visible symbols.',
      },
    ]);
  });

  it('orders warnings as eol, utf8, fence, ansi, nul and records suspicious lines', () => {
    const prepared = prepareText(
      `\`\`\`\r\n${ESC}[1mdiff --git a/x b/x\r\n+a\0\u{202E}\r\n\`\`\`\r\n`,
      2,
    );
    expect(prepared.warnings.map((warning) => warning.code)).toEqual([
      'crlf-normalised',
      'invalid-utf8',
      'fence-unwrapped',
      'ansi-stripped',
      'nul-replaced',
    ]);
    expect(prepared.invalidUtf8).toBe(2);
    expect([...prepared.suspiciousLines]).toEqual([1]);
  });
});

describe('byte decoding', () => {
  it('detects UTF-16 by BOM or by alternating NUL bytes', () => {
    expect(prepareBytes(new Uint8Array([0xff, 0xfe, 0x41, 0x00])).utf16).toBe(true);
    expect(prepareBytes(new Uint8Array([0xfe, 0xff, 0x00, 0x41])).utf16).toBe(true);
    const alternating = Uint8Array.from({ length: 16 }, (_, index) => (index % 2 === 0 ? 0x41 : 0));
    expect(prepareBytes(alternating).utf16).toBe(true);
    expect(prepareBytes(new TextEncoder().encode('plain text diff')).utf16).toBe(false);
    expect(prepareBytes(new Uint8Array([0x41, 0x00])).utf16).toBe(false);
  });

  it('replaces each invalid lead byte with U+FFFD and counts them', () => {
    const decoded = decodeUtf8Lossy(new Uint8Array([0x61, 0xff, 0x62, 0xc3, 0x28, 0xe2, 0x82]));
    expect(decoded.text).toBe('a�b�(��');
    expect(decoded.invalid).toBe(4);
  });

  it('decodes two, three and four byte sequences including astral scalars', () => {
    const bytes = new TextEncoder().encode('é中\u{1F600}z');
    expect(decodeUtf8Lossy(bytes)).toEqual({ text: 'é中\u{1F600}z', invalid: 0 });
  });

  it('keeps a large decode intact across internal chunk boundaries', () => {
    const text = '\u{1F600}'.repeat(5_000);
    expect(decodeUtf8Lossy(new TextEncoder().encode(text)).text).toBe(text);
  });

  it('strict decoding rejects truncated, overlong and surrogate sequences', () => {
    expect(decodeUtf8Strict([0x61, 0xc3, 0xa9])).toBe('aé');
    expect(decodeUtf8Strict([])).toBe('');
    expect(decodeUtf8Strict([0xc3])).toBeNull();
    expect(decodeUtf8Strict([0xc0, 0x80])).toBeNull();
    expect(decodeUtf8Strict([0xed, 0xa0, 0x80])).toBeNull();
    expect(decodeUtf8Strict([0xf4, 0x90, 0x80, 0x80])).toBeNull();
    expect(decodeUtf8Strict([0xff])).toBeNull();
  });
});
