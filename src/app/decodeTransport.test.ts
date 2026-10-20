import { describe, expect, it } from 'vitest';
import type { ParseError, Result } from '../core/types';
import {
  decode,
  decodeBytesInput,
  decodeFile,
  decodeInput,
  decodeText,
  type DecodedDiff,
} from './decode';

const ESC = '\u001B';
const BEL = '\u0007';

function failureOf(result: Result<DecodedDiff, ParseError>): ParseError {
  if (result.ok) {
    throw new Error('Expected a decode failure.');
  }
  return result.error;
}

function valueOf(result: Result<DecodedDiff, ParseError>): DecodedDiff {
  if (!result.ok) {
    throw new Error(`Expected a decode success, got ${result.error.code}.`);
  }
  return result.value;
}

function isUtf16Rejection(bytes: readonly number[]): boolean {
  const result = decode(new Uint8Array(bytes));
  return !result.ok && result.error.hint === 'utf16';
}

function textFor(input: string): string {
  return valueOf(decode(input)).text;
}

function times(count: number, pattern: readonly number[]): number[] {
  return Array.from({ length: count }, () => pattern).flat();
}

describe('decode UTF-16 signature detection', () => {
  it.each([
    ['little-endian byte order mark', [0xff, 0xfe, 0x64, 0x00]],
    ['big-endian byte order mark', [0xfe, 0xff, 0x00, 0x64]],
    ['byte order mark alone', [0xff, 0xfe]],
    ['two-byte little-endian ASCII', [0x64, 0x00]],
    ['two-byte big-endian ASCII', [0x00, 0x64]],
    ['little-endian ASCII text', [0x64, 0x00, 0x69, 0x00, 0x66, 0x00, 0x66, 0x00]],
    ['big-endian ASCII text', [0x00, 0x64, 0x00, 0x69, 0x00, 0x66, 0x00, 0x66]],
    ['tab and line feed count as ASCII', [0x09, 0x00, 0x0a, 0x00]],
    ['tilde is the last ASCII byte', [0x7e, 0x00, 0x7e, 0x00]],
    ['little-endian text with an odd byte count', [0x64, 0x00, 0x69, 0x00, 0x66]],
    ['signature only inspected within the first 64 bytes', [...times(32, [0x64, 0x00]), 0xff]],
  ])('flags %s as UTF-16', (_label, bytes) => {
    expect(isUtf16Rejection(bytes)).toBe(true);
  });

  it.each([
    ['empty input', []],
    ['a single ASCII byte', [0x64]],
    ['a single high byte', [0xff]],
    ['plain ASCII', [0x61, 0x62, 0x63, 0x64]],
    ['two zero bytes', [0x00, 0x00]],
    ['a control byte in the pattern', [0x64, 0x00, 0x01, 0x00]],
    ['DEL in the pattern', [0x7f, 0x00, 0x7f, 0x00]],
    ['a high byte in the pattern', [0x64, 0x00, 0xe9, 0x00]],
    ['text bytes at both parities', [0x64, 0x69, 0x00, 0x66]],
    ['zero bytes at both parities', [0x64, 0x00, 0x00, 0x00]],
    ['a pattern broken inside the 64-byte window', [...times(31, [0x64, 0x00]), 0x64, 0x69]],
    ['a high byte inside the 64-byte window', [...times(30, [0x64, 0x00]), 0xff, 0x00]],
    ['a single wrong byte order mark', [0xff, 0xff]],
  ])('does not flag %s as UTF-16', (_label, bytes) => {
    expect(isUtf16Rejection(bytes)).toBe(false);
  });

  it('IN-IMAGE-PASTE rejects an alternating NUL pattern as UTF-16 before the binary check', () => {
    expect(failureOf(decode(new Uint8Array([0x64, 0x00, 0x01, 0x00])))).toMatchObject({
      code: 'binary-input',
    });
    expect(failureOf(decode(new Uint8Array([0x64, 0x00, 0x69, 0x00])))).toEqual({
      code: 'not-a-diff',
      title: 'This looks like UTF-16 text',
      detail:
        'PowerShell `>` writes UTF-16. Re-run with `| Out-File -Encoding utf8`, or paste the text.',
      hint: 'utf16',
      suggestion: 'Re-run the command with UTF-8 output, or paste the text directly.',
    });
  });
});

describe('decode error messages', () => {
  const tooLarge = (count: number): ParseError => ({
    code: 'too-large',
    title: 'This diff is too large',
    detail: `The input is ${String(count)} bytes; the limit is 10485760 bytes.`,
    hint: 'generic',
    suggestion: 'Review a narrower change with `git diff -- src/`.',
  });

  it('IN-OVERLIMIT-FILE reports the byte count for bytes, text and files', async () => {
    expect(failureOf(decodeBytesInput(new Uint8Array(10 * 1024 * 1024 + 1)))).toEqual(
      tooLarge(10_485_761),
    );
    expect(failureOf(decode('x'.repeat(10 * 1024 * 1024 + 2)))).toEqual(tooLarge(10_485_762));
    const file = await decodeFile({
      name: 'big.diff',
      size: 10 * 1024 * 1024 + 3,
      arrayBuffer: () => Promise.reject(new Error('must not be read')),
    });
    expect(failureOf(file)).toEqual(tooLarge(10_485_763));
  });

  it('accepts input exactly at the limit', () => {
    const bytes = new Uint8Array(10 * 1024 * 1024).fill(0x61);
    expect(decodeBytesInput(bytes).ok).toBe(true);
  });

  it('IN-IMAGE-PASTE words the binary and empty failures exactly', () => {
    expect(failureOf(decode('a\u0000b'))).toEqual({
      code: 'binary-input',
      title: 'This looks like a binary file, not text',
      detail: 'A NUL byte appeared near the start of the input.',
      hint: 'generic',
      suggestion: 'Choose a text diff or run `git diff --no-ext-diff --no-color`.',
    });
    expect(failureOf(decode('  \n\t '))).toEqual({
      code: 'empty',
      title: 'Nothing to review',
      detail: 'The diff is empty or contains only whitespace.',
      hint: null,
      suggestion: 'Paste a unified diff or try a sample.',
    });
  });

  it('IN-ZERO-BYTE and IN-READ-FAIL word the file failures exactly', async () => {
    const empty = await decodeFile({
      size: 0,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    expect(failureOf(empty)).toEqual({
      code: 'empty',
      title: 'Nothing to review',
      detail: 'The selected file is empty.',
      hint: null,
      suggestion: 'Choose a diff file or paste the diff text.',
    });
    const named = await decodeFile({
      name: 'broken.diff',
      size: 4,
      arrayBuffer: () => Promise.reject(new Error('read')),
    });
    expect(failureOf(named)).toEqual({
      code: 'internal',
      title: 'Could not read broken.diff',
      detail: 'The file broken.diff could not be read from this browser.',
      hint: 'generic',
      suggestion: 'Choose the file again or paste the diff text. Retry.',
    });
    const anonymous = await decodeFile({
      size: 4,
      arrayBuffer: () => Promise.reject(new Error('read')),
    });
    expect(failureOf(anonymous)).toMatchObject({
      title: 'Could not read this file',
      detail: 'The file could not be read could not be read from this browser.',
    });
  });

  it('decodes a readable file through the bytes path', async () => {
    const bytes = new TextEncoder().encode('diff --git a/a b/a\n');
    const decoded = await decodeFile({
      name: 'ok.diff',
      size: bytes.length,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    expect(valueOf(decoded)).toEqual({
      text: 'diff --git a/a b/a\n',
      inputBytes: 19,
      warnings: [],
    });
  });
});

describe('decode input forms and warnings', () => {
  it('routes strings, bytes and decoder inputs through one pipeline', () => {
    const text = 'diff --git a/a b/a\n';
    const expected = { text, inputBytes: 19, warnings: [] };
    expect(valueOf(decode(text))).toEqual(expected);
    expect(valueOf(decodeText(text))).toEqual(expected);
    expect(valueOf(decodeInput(text))).toEqual(expected);
    expect(valueOf(decode({ kind: 'text', text }))).toEqual(expected);
    expect(valueOf(decode(new TextEncoder().encode(text)))).toEqual(expected);
    expect(valueOf(decode({ kind: 'bytes', bytes: new TextEncoder().encode(text) }))).toEqual(
      expected,
    );
  });

  it('counts the encoded size of pasted text, not its length', () => {
    expect(valueOf(decode('café \u{1F600}')).inputBytes).toBe(10);
  });

  it('rejects NUL near the start for every input form', () => {
    const bytes = new TextEncoder().encode('diff\u0000');
    expect(failureOf(decode(bytes)).code).toBe('binary-input');
    expect(failureOf(decode({ kind: 'bytes', bytes })).code).toBe('binary-input');
    expect(failureOf(decode({ kind: 'text', text: 'diff\u0000' })).code).toBe('binary-input');
  });

  it('visualises NUL after the first 8000 bytes and counts each one', () => {
    const decoded = valueOf(decode(`${'a'.repeat(8_001)}\u0000b\u0000`));
    expect(decoded.text.endsWith('␀b␀')).toBe(true);
    expect(decoded.warnings).toEqual([
      { code: 'nul-replaced', message: 'NUL characters were visualised.', count: 2 },
    ]);
    expect(failureOf(decode(`${'a'.repeat(7_999)}\u0000`)).code).toBe('binary-input');
    expect(decode(`${'a'.repeat(8_000)}\u0000`).ok).toBe(true);
  });

  it('counts each invalid UTF-8 byte and keeps the replacement text', () => {
    const decoded = valueOf(decode(new Uint8Array([0x64, 0xff, 0xff, 0x69])));
    expect(decoded.text).toBe('d��i');
    expect(decoded.warnings).toEqual([
      { code: 'invalid-utf8', message: 'Some invalid UTF-8 bytes were replaced.', count: 2 },
    ]);
  });

  it('strips a byte order mark and unwraps one Markdown fence', () => {
    expect(textFor('\u{FEFF}diff --git a/a b/a')).toBe('diff --git a/a b/a');
    const fenced = valueOf(decode('```patch\ndiff --git a/a b/a\n```'));
    expect(fenced.text).toBe('diff --git a/a b/a');
    expect(fenced.warnings).toEqual([
      { code: 'fence-unwrapped', message: 'One Markdown code fence was removed.', count: 1 },
    ]);
    expect(textFor('  ```TEXT  \nx\n```')).toBe('x');
    expect(textFor('```\nx\n```')).toBe('x');
  });

  it('leaves near-miss fences alone', () => {
    expect(textFor('``` diff\nx\n```')).toBe('``` diff\nx\n```');
    expect(textFor('```diff\nx\n``` ')).toBe('```diff\nx\n``` ');
    expect(textFor('```diff')).toBe('```diff');
  });

  it('normalises CRLF only when every line ending is CRLF', () => {
    const crlf = valueOf(decode('a\r\nb\r\n'));
    expect(crlf.text).toBe('a\nb\n');
    expect(crlf.warnings).toEqual([
      { code: 'crlf-normalised', message: 'CRLF line endings were normalised.', count: 1 },
    ]);
    const mixed = valueOf(decode('a\r\nb\nc'));
    expect(mixed.text).toBe('a\r\nb\nc');
    expect(mixed.warnings).toEqual([
      { code: 'mixed-eol', message: 'The input contains mixed line endings.', count: 1 },
    ]);
    expect(valueOf(decode('a\nb')).warnings).toEqual([]);
  });

  it('orders warnings by pipeline stage', () => {
    const decoded = valueOf(
      decode(
        new TextEncoder().encode(
          `\`\`\`diff\r\n${ESC}[1mdiff --git a/a b/a${ESC}[m\r\n+x\r\n\`\`\``,
        ),
      ),
    );
    expect(decoded.warnings.map((warning) => warning.code)).toEqual([
      'fence-unwrapped',
      'crlf-normalised',
      'ansi-stripped',
    ]);
  });
});

describe('decode ANSI stripping on structural lines', () => {
  it('strips colour codes from a structural line and counts lines, not sequences', () => {
    const decoded = valueOf(
      decode(`${ESC}[1;31mdiff --git a/a b/a${ESC}[0m\n${ESC}[36m@@ -1 +1 @@${ESC}[m\n+kept\n`),
    );
    expect(decoded.text).toBe('diff --git a/a b/a\n@@ -1 +1 @@\n+kept\n');
    expect(decoded.warnings).toEqual([
      {
        code: 'ansi-stripped',
        message: 'ANSI colour sequences were removed from structural lines.',
        count: 2,
      },
    ]);
  });

  it('keeps coloured content lines and lines that do not start with an escape', () => {
    expect(textFor(`${ESC}[32m+added${ESC}[m\n`)).toBe(`${ESC}[32m+added${ESC}[m\n`);
    expect(textFor(`x${ESC}[1mdiff --git a/a b/a\n`)).toBe(`x${ESC}[1mdiff --git a/a b/a\n`);
    expect(textFor(` ${ESC}[1mdiff --git a/a b/a\n`)).toBe(` ${ESC}[1mdiff --git a/a b/a\n`);
  });

  it('recognises every structural line prefix once colour is removed', () => {
    const prefixes = [
      'diff --git a b',
      'diff --cc a',
      '--- a/a',
      '+++ b/b',
      '@@ -1 +1 @@',
      '@@@ -1 +1 +1 @@@',
      'index 1..2',
      'old mode 100644',
      'new mode 100755',
      'new file mode 100644',
      'deleted file mode 100644',
      'similarity index 90%',
      'rename from a',
      'copy from a',
      'Binary files a and b differ',
      'GIT binary patch',
    ];
    for (const prefix of prefixes) {
      expect(textFor(`${ESC}[1m${prefix}${ESC}[m`)).toBe(prefix);
    }
    expect(textFor(`${ESC}[1mdiffs --git${ESC}[m`)).toBe(`${ESC}[1mdiffs --git${ESC}[m`);
    expect(textFor(`${ESC}[1m@ -1${ESC}[m`)).toBe(`${ESC}[1m@ -1${ESC}[m`);
  });

  it('removes consecutive sequences and sequences with parameters and intermediates', () => {
    expect(textFor(`${ESC}[1m${ESC}[31mdiff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}[?25 qdiff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}[38;5;196mdiff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}[;1mdiff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}[~diff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}[@diff --git a/a b/a`)).toBe('diff --git a/a b/a');
  });

  it('keeps malformed CSI sequences untouched', () => {
    const unfinished = `${ESC}[12`;
    expect(textFor(unfinished)).toBe(unfinished);
    const wrongOrder = `${ESC}[ 1mdiff --git a/a b/a`;
    expect(textFor(wrongOrder)).toBe(wrongOrder);
    const noBracket = `${ESC}mdiff --git a/a b/a`;
    expect(textFor(noBracket)).toBe(noBracket);
    const highFinal = `${ESC}[1édiff --git a/a b/a`;
    expect(textFor(highFinal)).toBe(highFinal);
  });

  it('removes OSC sequences ended by BEL or by ESC backslash', () => {
    expect(textFor(`${ESC}]0;window title${BEL}--- a/a\n`)).toBe('--- a/a\n');
    expect(textFor(`${ESC}]8;;http://example.test${ESC}\\+++ b/b\n`)).toBe('+++ b/b\n');
    expect(textFor(`${ESC}]${BEL}diff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}]${ESC}\\diff --git a/a b/a`)).toBe('diff --git a/a b/a');
  });

  it('ends an OSC sequence at the first BEL and otherwise at the last ESC backslash', () => {
    expect(textFor(`${ESC}]0;a${BEL}diff --git a/a b/a${ESC}\\x`)).toBe(
      `diff --git a/a b/a${ESC}\\x`,
    );
    expect(textFor(`${ESC}]0;a${ESC}\\${BEL}diff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}]0;one${ESC}\\two${ESC}\\diff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}]0;${ESC}]nested${BEL}diff --git a/a b/a`)).toBe('diff --git a/a b/a');
  });

  it('keeps unterminated OSC sequences untouched', () => {
    const open = `${ESC}]0;titlediff --git a/a b/a`;
    expect(textFor(open)).toBe(open);
    const almost = `${ESC}]0;title${ESC}diff --git a/a b/a`;
    expect(textFor(almost)).toBe(almost);
    const swapped = `${ESC}]0;title\\${ESC}diff --git a/a b/a`;
    expect(textFor(swapped)).toBe(swapped);
  });

  it('strips every well-formed sequence even when a stray escape sits between them', () => {
    expect(textFor(`${ESC}[1mdiff --git a/a b/a${ESC}x${ESC}[m`)).toBe(`diff --git a/a b/a${ESC}x`);
  });

  it('keeps the line when a stray escape would still lead it after stripping', () => {
    const strayFirst = `${ESC}x${ESC}[1mdiff --git a/a b/a`;
    expect(textFor(strayFirst)).toBe(strayFirst);
    const doubled = `${ESC}${ESC}[1mdiff --git a/a b/a`;
    expect(textFor(doubled)).toBe(doubled);
  });

  it('handles surrogate pairs and lone surrogates inside an OSC body', () => {
    expect(textFor(`${ESC}]0;\u{1F600}${BEL}diff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}]0;\uD800${BEL}diff --git a/a b/a`)).toBe('diff --git a/a b/a');
    expect(textFor(`${ESC}[\u{1F600}diff --git a/a b/a`)).toBe(
      `${ESC}[\u{1F600}diff --git a/a b/a`,
    );
  });
});
