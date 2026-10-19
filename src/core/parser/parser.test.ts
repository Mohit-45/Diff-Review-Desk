import { describe, expect, it } from 'vitest';
import { fileIdForPath, fingerprintForText, h, hunkHash } from '../hash';
import { parseDiff } from './parse';

const simpleDiff = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,2 +1,2 @@ function run',
  ' const before = true;',
  '-const oldValue = 1;',
  '+const newValue = 2;',
  '\\ No newline at end of file',
].join('\n');

describe('tier-A unified diff parser', () => {
  it('empty parses the blocking empty error', () => {
    const result = parseDiff('\u00a0\ufeff');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('empty');
    }
  });

  it('not-a-diff classifies web responses without throwing', () => {
    const result = parseDiff('<html>not a diff</html>');
    expect(result).toMatchObject({ ok: false, error: { code: 'not-a-diff', hint: 'web-page' } });
  });

  it('binary-input rejects an early NUL and preserves the Result contract', () => {
    const result = parseDiff(`plain\0text`);
    expect(result).toMatchObject({ ok: false, error: { code: 'binary-input' } });
  });

  it('parses a git hunk with exact line numbers and no-eol state', () => {
    const result = parseDiff(simpleDiff);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files).toHaveLength(1);
    const file = result.files[0];
    expect(file?.displayPath).toBe('src/app.ts');
    expect(file?.status).toBe('modified');
    const hunk = file?.hunks[0];
    expect(hunk?.kind).toBe('text');
    expect(hunk?.added).toBe(1);
    expect(hunk?.removed).toBe(1);
    expect(hunk?.lines[0]).toMatchObject({ kind: 'context', oldNo: 1, newNo: 1 });
    expect(hunk?.lines[1]).toMatchObject({ kind: 'remove', oldNo: 2, newNo: null });
    expect(hunk?.lines[2]).toMatchObject({ kind: 'add', oldNo: null, newNo: 2, noEol: true });
    expect(result.stats.lineClasses.hunkHeader).toBe(1);
    expect(result.stats.lineClasses.hunkBody).toBe(4);
    expect(Object.values(result.stats.lineClasses).reduce((sum, count) => sum + count, 0)).toBe(
      result.stats.totalLines,
    );
  });

  it('preamble-trailer does not turn a mail signature into a removed line', () => {
    const result = parseDiff(
      [
        'commit 0123456789012345678901234567890123456789',
        '--- a/x',
        '+++ b/x',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        '-- ',
        '2.50.1',
      ].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]?.hunks[0]?.removed).toBe(1);
      expect(result.files[0]?.hunks[0]?.countMismatch).toBe(false);
      expect(result.stats.lineClasses.trailer).toBe(2);
    }
  });

  it('crlf-transport has the same identity as LF transport', () => {
    const lf = parseDiff(simpleDiff);
    const crlf = parseDiff(simpleDiff.replaceAll('\n', '\r\n'));
    expect(lf.ok).toBe(true);
    expect(crlf.ok).toBe(true);
    if (lf.ok && crlf.ok) {
      expect(crlf.fingerprint).toBe(lf.fingerprint);
      expect(crlf.files[0]?.hunks[0]?.id).toBe(lf.files[0]?.hunks[0]?.id);
      expect(crlf.warnings.some((warning) => warning.code === 'crlf-normalised')).toBe(true);
    }
  });

  it('git wrapper and bare unified headers share canonical identities', () => {
    const bare = ['--- src/app.ts', '+++ src/app.ts', '@@ -1 +1 @@', '-old', '+new'].join('\n');
    const wrapped = [
      'commit 0123456789012345678901234567890123456789',
      'diff --git a/src/app.ts b/src/app.ts',
      'index 1..2 100644',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    const first = parseDiff(bare);
    const second = parseDiff(wrapped);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.fingerprint).toBe(first.fingerprint);
      expect(second.files[0]?.hunks[0]?.id).toBe(first.files[0]?.hunks[0]?.id);
    }
  });

  it('zero-context creates a hunk for a pure add', () => {
    const result = parseDiff(
      ['--- /dev/null', '+++ new.txt', '@@ -0,0 +1 @@', '+new line'].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]?.status).toBe('added');
      expect(result.files[0]?.hunks[0]?.newCount).toBe(1);
      expect(result.files[0]?.hunks[0]?.added).toBe(1);
      expect(result.files[0]?.hunks[0]?.lines[0]?.newNo).toBe(1);
    }
  });

  it('truncated records expected and observed counts without allocating by the declaration', () => {
    const result = parseDiff(
      ['--- a/x', '+++ b/x', '@@ -1,999999999 +1,999999999 @@', '+only'].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]?.hunks[0]).toMatchObject({
        truncated: true,
        oldCount: 999999999,
        newCount: 999999999,
      });
      expect(
        result.warnings.some(
          (warning) =>
            warning.code === 'hunk-truncated' &&
            warning.message.includes('expected 999999999/999999999'),
        ),
      ).toBe(true);
    }
  });

  it('overrun records a mismatch while retaining the extra body line', () => {
    const result = parseDiff(['--- a/x', '+++ b/x', '@@ -0,0 +1,1 @@', '+one', '+two'].join('\n'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]?.hunks[0]).toMatchObject({ countMismatch: true, added: 2 });
    }
  });

  it('header-lookalikes with a marker remain content', () => {
    const result = parseDiff(
      ['--- a/x', '+++ b/x', '@@ -1,1 +1,1 @@', '+--- a/not-a-header'].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]?.hunks[0]?.lines[0]?.text).toBe('--- a/not-a-header');
    }
  });

  it('concatenated paths receive duplicate file and hunk suffixes', () => {
    const one = ['--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b'].join('\n');
    const result = parseDiff(`${one}\n${one}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files.map((file) => file.id)).toEqual([
        fileIdForPath('b/x'),
        fileIdForPath('b/x', 2),
      ]);
      expect(result.files[0]?.hunks[0]?.id.endsWith('#1')).toBe(false);
      expect(result.files[1]?.hunks[0]?.id.endsWith('#1')).toBe(false);
    }
  });

  it('binary files become metadata hunks and do not store payload lines', () => {
    const result = parseDiff(
      [
        'diff --git a/image.bin b/image.bin',
        'index 1..2 100644',
        'Binary files a/image.bin and b/image.bin differ',
      ].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]).toMatchObject({
        binary: true,
        hunks: [{ kind: 'meta', meta: ['binary'], lines: [] }],
      });
    }
  });

  it('combined diffs remain individually reviewable metadata', () => {
    const result = parseDiff(
      [
        'diff --cc src/x',
        'index 111,222..333',
        '--- a/src/x',
        '+++ b/src/x',
        '@@@ -1 -1 +1 @@@',
      ].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]?.hunks[0]?.meta).toContain('combined');
      expect(result.warnings.some((warning) => warning.code === 'combined-unsupported')).toBe(true);
    }
  });

  it('invalid bytes use replacement characters and a warning', () => {
    const bytes = new Uint8Array([
      0x2d, 0x2d, 0x2d, 0x20, 0x61, 0x2f, 0x78, 0x0a, 0x2b, 0x2b, 0x2b, 0x20, 0x62, 0x2f, 0x78,
      0x0a, 0x40, 0x40, 0x20, 0x2d, 0x31, 0x20, 0x2b, 0x31, 0x20, 0x40, 0x40, 0x0a, 0x2b, 0xff,
    ]);
    const result = parseDiff(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.some((warning) => warning.code === 'invalid-utf8')).toBe(true);
    }
  });
});

describe('identity helpers', () => {
  it('uses the pinned cyrb53 vector shape', () => {
    expect(h('')).toHaveLength(11);
    expect(h('f1\0diff')).toMatch(/^[0-9a-z]{11}$/);
    expect(fingerprintForText('diff')).toBe(h('f1\0diff'));
  });

  it('hashes content markers and no-eol state but not line numbers', () => {
    const first = { kind: 'add' as const, text: 'x', oldNo: null, newNo: 1 };
    const second = { kind: 'add' as const, text: 'x', oldNo: null, newNo: 99 };
    expect(hunkHash([first])).toBe(hunkHash([second]));
    expect(hunkHash([first])).not.toBe(hunkHash([{ ...first, noEol: true }]));
  });
});
