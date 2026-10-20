import { describe, expect, it } from 'vitest';
import type { DiffFile, ParseResult, ParseWarning } from '../types';
import { parseDiff, parseUnifiedDiff } from './parse';

const encoder = new TextEncoder();
const BOM = '\ufeff';

function lines(...parts: string[]): string {
  return parts.join('\n');
}

function files(result: ParseResult): readonly DiffFile[] {
  if (!result.ok) {
    throw new Error(`expected a parse, got ${result.error.code}`);
  }
  return result.files;
}

function warning(result: ParseResult, code: ParseWarning['code']): ParseWarning | undefined {
  return result.warnings.find((candidate) => candidate.code === code);
}

describe('entry points', () => {
  const diff = lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b', '');

  it('accepts text and bytes with identical results and keeps the alias', () => {
    expect(parseDiff(encoder.encode(diff))).toEqual(parseDiff(diff));
    expect(parseUnifiedDiff).toBe(parseDiff);
  });

  it('strips one leading BOM from text and from bytes', () => {
    expect(parseDiff(`${BOM}${diff}`)).toEqual(parseDiff(diff));
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode(diff)]);
    const decodedWithBom = parseDiff(withBom);
    const decodedPlain = parseDiff(encoder.encode(diff));
    expect(decodedWithBom.ok && decodedWithBom.files).toEqual(
      decodedPlain.ok && decodedPlain.files,
    );
    expect(decodedWithBom.ok && decodedWithBom.fingerprint).toBe(
      decodedPlain.ok && decodedPlain.fingerprint,
    );
  });

  it('reports the input size in bytes for both input kinds', () => {
    const result = parseDiff(diff);
    expect(result.ok && result.stats.inputBytes).toBe(encoder.encode(diff).length);
    expect(result.ok && result.stats.totalLines).toBe(5);
  });

  it('detects UTF-16 bytes and a NUL in the first 8,000 bytes', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x2d, 0x00, 0x2d, 0x00]);
    expect(parseDiff(utf16)).toMatchObject({
      ok: false,
      error: {
        code: 'not-a-diff',
        hint: 'utf16',
        title: 'This does not look like a diff',
        suggestion: 'Re-run with `| Out-File -Encoding utf8`, or paste the text.',
      },
    });
    const binary = new Uint8Array([0x41, 0x42, 0x00, 0x43, 0x44]);
    expect(parseDiff(binary)).toMatchObject({
      ok: false,
      error: {
        code: 'binary-input',
        title: 'This looks like a binary file, not text.',
        hint: null,
      },
    });
  });

  it('reports blank input as empty for text and bytes', () => {
    expect(parseDiff('')).toMatchObject({ ok: false, error: { code: 'empty' } });
    expect(parseDiff(new Uint8Array([0x20, 0x0a, 0xc2, 0xa0]))).toMatchObject({
      ok: false,
      error: { code: 'empty', title: 'Nothing to review' },
    });
  });
});

describe('limit overrides', () => {
  const diff = lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b');
  const two = lines(diff, '--- a/y', '+++ b/y', '@@ -1 +1 @@', '-a', '+b');

  it('too-large names the observed bytes and the limit', () => {
    const expected = {
      ok: false,
      error: {
        code: 'too-large',
        title: 'Diff is too large',
        detail: `Observed ${String(encoder.encode(diff).length)} bytes; the limit is 5.`,
        hint: 'generic',
      },
    };
    expect(parseDiff(diff, { limits: { maxInputBytes: 5 } })).toMatchObject(expected);
    expect(parseDiff(encoder.encode(diff), { limits: { maxInputBytes: 5 } })).toMatchObject(
      expected,
    );
  });

  it('too-many-files and too-many-lines carry the observed numbers', () => {
    expect(parseDiff(two, { limits: { maxFiles: 1 } })).toMatchObject({
      ok: false,
      error: { code: 'too-many-files', detail: 'Observed 2 files; the limit is 1.' },
    });
    expect(parseDiff(two, { limits: { maxTotalDiffLines: 3 } })).toMatchObject({
      ok: false,
      error: { code: 'too-many-lines', detail: 'Observed 10 lines; the limit is 3.' },
    });
  });

  it('counts warnings past maxWarnings as dropped', () => {
    const text = lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b', 'junk', 'more junk');
    const result = parseDiff(
      lines('hello', '--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b', 'junk', text),
      { limits: { maxWarnings: 1 } },
    );
    expect(result.ok && result.warnings).toHaveLength(1);
    expect(result.ok && result.stats.warningsDropped).toBeGreaterThan(0);
  });
});

describe('blocking error classification', () => {
  it.each([
    ['web page', '  <html>', 'web-page', 'not-a-diff'],
    ['json', '{"a": 1}', 'web-page', 'not-a-diff'],
    ['apply_patch', '*** Begin Patch\n*** End Patch', 'other-format', 'not-a-diff'],
    ['context diff', '*** 1,3 ****\n--- 1,3 ----', 'other-format', 'not-a-diff'],
    ['stat summary', '--stat\n a | 2 +-', 'summary', 'not-a-diff'],
    ['word diff', 'plain\n[-old-]{+new+}\n~', 'other-format', 'word-diff'],
    ['prose', 'just words here', 'generic', 'not-a-diff'],
  ])('%s', (_name, text, hint, code) => {
    expect(parseDiff(text)).toMatchObject({ ok: false, error: { code, hint } });
  });

  it('commit headers with no files name git show -m', () => {
    const result = parseDiff('commit 0123456789012345678901234567890123456789\nAuthor: A\n');
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'not-a-diff',
        hint: 'generic',
        detail:
          'Commit headers were found but no file changes. Merge commits show no diff by default; use `git show -m <sha>` or `git diff <base>...<head>`.',
      },
    });
  });

  it('a summary line wins over a word-diff look-alike', () => {
    expect(parseDiff('--numstat\n[-x-]\n~')).toMatchObject({
      ok: false,
      error: {
        code: 'not-a-diff',
        hint: 'summary',
        title: 'This is a summary and has no changed lines.',
      },
    });
  });
});

describe('hunk warnings', () => {
  it('hunk-truncated reports expected and found counts', () => {
    const result = parseDiff(lines('--- a/x', '+++ b/x', '@@ -1,3 +1,4 @@', ' a', '+b'));
    expect(warning(result, 'hunk-truncated')).toMatchObject({
      level: 'warn',
      message: 'expected 3/4, found 1/2',
      srcLine: 3,
      count: 1,
      samples: ['@@ -1,3 +1,4 @@'],
    });
    expect(files(result)[0]).toMatchObject({ incomplete: true });
  });

  it('hunk-count-mismatch flags lines beyond the declared counts', () => {
    const result = parseDiff(
      lines('--- a/x', '+++ b/x', '@@ -1,1 +1,1 @@', '-a', '+b', '+c', '-d'),
    );
    expect(warning(result, 'hunk-count-mismatch')?.message).toBe(
      'Hunk contains lines beyond its declared counts.',
    );
    expect(files(result)[0]?.hunks[0]).toMatchObject({ countMismatch: true, added: 2, removed: 2 });
    const lineNumbers = files(result)[0]?.hunks[0]?.lines.map((line) => [line.oldNo, line.newNo]);
    expect(lineNumbers).toEqual([
      [1, null],
      [null, 1],
      [null, null],
      [null, null],
    ]);
  });

  it('hunks-out-of-order warns once per file with the second header', () => {
    const result = parseDiff(
      lines('--- a/x', '+++ b/x', '@@ -10 +10 @@', '-a', '+b', '@@ -2 +2 @@', '-c', '+d'),
    );
    expect(warning(result, 'hunks-out-of-order')).toMatchObject({
      message: 'Hunks are out of source order.',
      srcLine: 6,
      samples: ['@@ -2 +2 @@'],
    });
  });

  it('numbers context on both sides and stops numbering a side with count 0', () => {
    const result = parseDiff(lines('--- a/x', '+++ b/x', '@@ -5,2 +0,0 @@', ' a', '-b'));
    const numbers = files(result)[0]?.hunks[0]?.lines.map((line) => [line.oldNo, line.newNo]);
    expect(numbers).toEqual([
      [5, null],
      [6, null],
    ]);
  });

  it('keeps a no-eol marker on the previous line and warns when none precedes it', () => {
    const marked = parseDiff(
      lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '\\ No newline', '+b'),
    );
    expect(files(marked)[0]?.hunks[0]?.lines[0]).toMatchObject({ noEol: true });
    expect(marked.ok && marked.stats.lineClasses.hunkBody).toBe(3);
    const orphan = parseDiff(
      lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '\\ No newline', '-a', '+b'),
    );
    expect(warning(orphan, 'orphan-lines')).toMatchObject({
      message: 'A no-newline marker had no preceding hunk line.',
      srcLine: 4,
    });
    expect(orphan.ok && orphan.stats.orphanLines).toBe(1);
  });

  it('suspicious-chars is reported per hunk line with a clipped sample', () => {
    const result = parseDiff(
      lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', `-${'a'.repeat(200)}\u{202E}`, '+b'),
    );
    const found = warning(result, 'suspicious-chars');
    expect(found).toMatchObject({
      message: 'A diff line contains hidden or control characters.',
      srcLine: 4,
    });
    expect(found?.samples[0]).toHaveLength(120);
    expect(files(result)[0]?.hunks[0]?.lines[0]).toMatchObject({ suspect: true });
  });

  it('keeps at most three samples and counts every occurrence', () => {
    const body = Array.from({ length: 6 }, (_, index) => `+\u{202E}${String(index)}`);
    const result = parseDiff(lines('--- a/x', '+++ b/x', '@@ -0,0 +1,6 @@', ...body));
    expect(warning(result, 'suspicious-chars')).toMatchObject({
      count: 6,
      samples: ['+\u{202E}0', '+\u{202E}1', '+\u{202E}2'],
    });
  });
});

describe('unparsed runs and trailers', () => {
  it('turns a bad hunk header into one unparsed meta hunk with a warning', () => {
    const result = parseDiff(
      lines('--- a/x', '+++ b/x', '@@ -x +y @@', 'stuff', '@@ -1 +1 @@', '-a', '+b'),
    );
    const hunks = files(result)[0]?.hunks ?? [];
    expect(hunks.map((hunk) => hunk.kind)).toEqual(['text', 'meta']);
    expect(hunks[1]).toMatchObject({ meta: ['unparsed'], truncated: false });
    expect(hunks[1]?.lines.map((line) => line.text)).toEqual(['@@ -x +y @@', 'stuff']);
    expect(warning(result, 'bad-hunk-header')?.message).toBe('A hunk header could not be parsed.');
    expect(result.ok && result.stats.orphanLines).toBe(2);
  });

  it('shows only the first 200 raw lines of an unparsed run and marks it truncated', () => {
    const junk = Array.from({ length: 205 }, (_, index) => `junk ${String(index)}`);
    const result = parseDiff(lines('--- a/x', '+++ b/x', '@@ -x +y @@', ...junk));
    const meta = files(result)[0]?.hunks[0];
    expect(meta?.lines).toHaveLength(200);
    expect(meta).toMatchObject({ kind: 'meta', truncated: true });
    expect(warning(result, 'unknown-lines')).toMatchObject({ count: 205 });
  });

  it('classifies text after a satisfied hunk as trailer and a blank line as separator', () => {
    const result = parseDiff(
      lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b', 'footer text', '', ''),
    );
    expect(result.ok && result.stats.lineClasses.trailer).toBe(1);
    expect(result.ok && result.stats.lineClasses.separator).toBe(1);
    expect(warning(result, 'trailer-ignored')).toMatchObject({ level: 'info', count: 2 });
  });

  it('classifies preamble and records the commit header flag through the diff', () => {
    const result = parseDiff(
      lines(
        'commit 0123456789012345678901234567890123456789',
        'Author: A',
        '',
        '--- a/x',
        '+++ b/x',
        '@@ -1 +1 @@',
        '-a',
        '+b',
      ),
    );
    expect(result.ok && result.stats.lineClasses).toMatchObject({ preamble: 2, separator: 1 });
    expect(warning(result, 'preamble-ignored')).toMatchObject({
      level: 'info',
      count: 3,
      srcLine: 1,
    });
  });
});

describe('file metadata', () => {
  it('rename with similarity gets renamed status, a rename meta hunk and the new path', () => {
    const result = parseDiff(
      lines(
        'diff --git a/old.ts b/new.ts',
        'similarity index 87%',
        'rename from old.ts',
        'rename to new.ts',
      ),
    );
    expect(files(result)[0]).toMatchObject({
      displayPath: 'new.ts',
      oldPath: 'old.ts',
      newPath: 'new.ts',
      status: 'renamed',
      similarity: 87,
      hunks: [{ kind: 'meta', meta: ['rename'] }],
    });
  });

  it('a copy gets copied status and a copy meta hunk', () => {
    const result = parseDiff(lines('diff --git a/a.ts b/b.ts', 'copy from a.ts', 'copy to b.ts'));
    expect(files(result)[0]).toMatchObject({ status: 'copied', hunks: [{ meta: ['copy'] }] });
  });

  it('mode-only change gets a mode-change hunk and executable kind', () => {
    const result = parseDiff(
      lines('diff --git a/s.sh b/s.sh', 'old mode 100644', 'new mode 100755'),
    );
    expect(files(result)[0]).toMatchObject({
      kind: 'executable',
      oldMode: '100644',
      newMode: '100755',
      hunks: [{ kind: 'meta', meta: ['mode-change'] }],
    });
  });

  it('a type change next to text hunks adds a trailing type-change meta hunk', () => {
    const result = parseDiff(
      lines(
        'diff --git a/l b/l',
        'old mode 100644',
        'new mode 120000',
        '--- a/l',
        '+++ b/l',
        '@@ -1 +1 @@',
        '-a',
        '+b',
      ),
    );
    const hunks = files(result)[0]?.hunks ?? [];
    expect(files(result)[0]).toMatchObject({ kind: 'symlink' });
    expect(hunks.map((hunk) => hunk.meta)).toEqual([[], ['type-change']]);
    expect(hunks.map((hunk) => hunk.index)).toEqual([0, 1]);
  });

  it('added and deleted empty files get an empty-file meta hunk', () => {
    const added = parseDiff(
      lines('diff --git a/n b/n', 'new file mode 100644', 'index 0000000..e69de29'),
    );
    expect(files(added)[0]).toMatchObject({ status: 'added', hunks: [{ meta: ['empty-file'] }] });
    const deleted = parseDiff(
      lines('diff --git a/d b/d', 'deleted file mode 100644', 'index e69de29..0000000'),
    );
    expect(files(deleted)[0]).toMatchObject({
      status: 'deleted',
      hunks: [{ meta: ['empty-file'] }],
    });
  });

  it('a header-only file gets no-hunks and an info warning', () => {
    const result = parseDiff(lines('diff --git a/q b/q', 'index 1..2 100644'));
    expect(files(result)[0]?.hunks[0]?.meta).toEqual(['no-hunks']);
    expect(warning(result, 'no-hunks')).toMatchObject({ level: 'info', samples: ['q'] });
  });

  it('marks lockfiles generated and a /dev/null side as added or deleted', () => {
    const result = parseDiff(
      lines(
        '--- /dev/null',
        '+++ b/package-lock.json',
        '@@ -0,0 +1 @@',
        '+{}',
        '--- a/old.txt',
        '+++ /dev/null',
        '@@ -1 +0,0 @@',
        '-x',
      ),
    );
    expect(files(result).map((file) => [file.displayPath, file.status, file.generated])).toEqual([
      ['b/package-lock.json', 'added', true],
      ['a/old.txt', 'deleted', false],
    ]);
  });

  it('combined diffs become one metadata hunk plus a warning', () => {
    const result = parseDiff(
      lines('diff --cc f', 'index 1,2..3', '--- a/f', '+++ b/f', '@@@ -1 -1 +1 @@@', ' x'),
    );
    expect(files(result)[0]?.hunks).toHaveLength(1);
    expect(files(result)[0]?.hunks[0]?.meta).toEqual(['combined']);
    expect(warning(result, 'combined-unsupported')?.message).toBe(
      'Combined diffs are shown as one metadata hunk.',
    );
    expect(result.ok && result.stats.lineClasses.binaryPayload).toBe(5);
  });

  it('binary payload lines are counted but never stored', () => {
    const result = parseDiff(
      lines(
        'diff --git a/b.bin b/b.bin',
        'GIT binary patch',
        'literal 3',
        'abc',
        '',
        'literal 0',
        'HcmV?d00001',
      ),
    );
    expect(files(result)[0]).toMatchObject({
      binary: true,
      hunks: [{ meta: ['binary'], lines: [] }],
    });
    expect(result.ok && result.stats.lineClasses.binaryPayload).toBe(6);
  });

  it('ambiguous and undecodable git header names warn and keep the file', () => {
    const ambiguous = parseDiff(
      lines('diff --git left b/right', '--- left', '+++ right', '@@ -1 +1 @@', '-a', '+b'),
    );
    expect(warning(ambiguous, 'ambiguous-path')?.message).toBe(
      'The Git file header had ambiguous path separators.',
    );
    const encoded = parseDiff(lines('diff --git "a/\\377" "b/\\377"', 'index 1..2 100644'));
    expect(files(encoded)[0]?.displayPath).toBe('�');
    expect(warning(encoded, 'path-encoding')?.message).toBe(
      'A file path could not be decoded as UTF-8.',
    );
  });

  it('overlong header lines warn with file-header-truncated', () => {
    const long = `diff --git a/${'p'.repeat(40)} b/${'p'.repeat(40)}`;
    const result = parseDiff(lines(long, 'index 1..2 100644'), {
      limits: { maxHeaderLineChars: 30 },
    });
    expect(warning(result, 'file-header-truncated')?.message).toBe(
      'A file header exceeded the header line limit.',
    );
  });

  it('a repeated path gets the ~2 suffix and a duplicate-path info warning', () => {
    const one = lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b');
    const result = parseDiff(lines(one, one));
    expect(files(result).map((file) => file.id.endsWith('~2'))).toEqual([false, true]);
    expect(warning(result, 'duplicate-path')).toMatchObject({ level: 'info', samples: ['b/x'] });
    expect(files(result)[1]?.hunks[0]?.id.includes('#')).toBe(false);
  });

  it('identical hunks in one file get #2 and #3 suffixes', () => {
    const hunk = ['-a', '+b'];
    const result = parseDiff(
      lines(
        '--- a/x',
        '+++ b/x',
        '@@ -1 +1 @@',
        ...hunk,
        '@@ -5 +5 @@',
        ...hunk,
        '@@ -9 +9 @@',
        ...hunk,
      ),
    );
    const ids = files(result)[0]?.hunks.map((hunk) => hunk.id) ?? [];
    expect(ids[1]?.endsWith('#2')).toBe(true);
    expect(ids[2]?.endsWith('#3')).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('transport warnings and fingerprint', () => {
  const diff = lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b', '');

  it('reports each pipeline step with its fixed message and level', () => {
    const esc = '\u001b';
    const padding = `x`.repeat(8_100);
    const text = `\`\`\`diff\r\n${esc}[1m--- a/x${esc}[m\r\n+++ b/x\r\n@@ -1,2 +1 @@\r\n ${padding}\r\n-a\0\r\n\`\`\`\r\n`;
    const result = parseDiff(text);
    const summary = result.warnings.map((entry) => [entry.code, entry.level, entry.message]);
    expect(summary).toEqual([
      ['crlf-normalised', 'info', 'CRLF line endings were normalised.'],
      ['fence-unwrapped', 'info', 'One Markdown code fence was unwrapped.'],
      ['ansi-stripped', 'info', 'ANSI colour sequences were stripped from structural lines.'],
      ['nul-replaced', 'warn', 'NUL characters were replaced with visible symbols.'],
    ]);
    expect(files(result)[0]?.hunks[0]?.lines[1]).toMatchObject({ text: 'a␀', suspect: true });
  });

  it('counts invalid UTF-8 bytes and keeps the mixed-eol warning informational', () => {
    const bytes = new Uint8Array([
      ...encoder.encode('--- a/x\r\n+++ b/x\n@@ -1 +1 @@\n+'),
      0xff,
      0x0a,
    ]);
    const result = parseDiff(bytes);
    expect(warning(result, 'invalid-utf8')).toMatchObject({
      level: 'warn',
      count: 1,
      message: 'Invalid UTF-8 bytes were replaced with U+FFFD.',
      samples: ['�'],
    });
    expect(warning(result, 'mixed-eol')).toMatchObject({
      level: 'info',
      message: 'Mixed line endings were retained.',
    });
  });

  it('keeps content CR on the line and hashes it', () => {
    const withCr = parseDiff(lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b\r', ''));
    const without = parseDiff(diff);
    expect(files(withCr)[0]?.hunks[0]?.lines[1]).toMatchObject({ text: 'b', cr: true });
    expect(files(withCr)[0]?.hunks[0]?.hash).not.toBe(files(without)[0]?.hunks[0]?.hash);
  });

  it('fingerprint ignores line numbers and the section but not the content or the paths', () => {
    const base = parseDiff(diff);
    const moved = parseDiff(
      lines('--- a/x', '+++ b/x', '@@ -40 +40 @@ other section', '-a', '+b', ''),
    );
    const edited = parseDiff(lines('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+c', ''));
    expect(base.ok && moved.ok && edited.ok).toBe(true);
    if (base.ok && moved.ok && edited.ok) {
      expect(moved.files[0]?.hunks[0]?.id).toBe(base.files[0]?.hunks[0]?.id);
      expect(moved.fingerprint).not.toBe(base.fingerprint);
      expect(edited.fingerprint).not.toBe(base.fingerprint);
    }
  });

  it('pins the fingerprint of a rename-with-edit diff covering header, mode and hunk lines', () => {
    const result = parseDiff(
      lines(
        'diff --git a/o.sh b/n.sh',
        'old mode 100644',
        'new mode 100755',
        'similarity index 87%',
        'rename from o.sh',
        'rename to n.sh',
        '--- a/o.sh',
        '+++ b/n.sh',
        '@@ -1,2 +1,3 @@ main',
        ' keep',
        '-old',
        '+new',
        '+extra',
        '\\ No newline at end of file',
        '',
      ),
    );
    expect(result.ok && result.fingerprint).toBe('1wyhyu7yrt9');
  });
});
