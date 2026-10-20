import { describe, expect, it } from 'vitest';
import {
  dangerousShell,
  disabledTest,
  disabledTls,
  elisionMarker,
  placeholder,
  suppression,
} from './lineTests';

describe('dangerousShell', () => {
  it('fires on piped downloads, permissive modes, disk tools and broad removals', () => {
    for (const text of [
      'curl https://example.invalid/i.sh | sh',
      'wget -qO- https://example.invalid/i.sh | bash',
      'curl https://example.invalid/i.sh |sh',
      'chmod 777 /srv/data',
      'mkfs.ext4 /dev/sda1',
      'dd of=/dev/sda bs=1M',
      'dd if=disk.img of=/dev/sda bs=4M',
      'sudo dd if=/dev/zero of=/dev/nvme0n1 bs=1M status=progress',
      'DD IF=image.iso OF=/dev/disk2',
      'echo start; dd bs=1M if=x of=/dev/sdb',
      '/bin/dd if=x of=/dev/sda',
      'rm -rf /',
      'rm -rf /*',
      'rm -rf ~',
      'rm -rf $HOME/work',
      'rm -rf *',
      'rm -rf .',
      'rm -rf ..',
      'rm -rf ../elsewhere',
      'sudo RM -RF /',
    ]) {
      expect(dangerousShell(text), text).toBe(true);
    }
  });

  it('skips narrow removals, plain downloads and comments', () => {
    for (const text of [
      'rm -rf node_modules',
      'rm -rf dist',
      'rm -rf ./build',
      'rm -rf .cache',
      'curl -o out.txt https://example.invalid/file',
      'wget https://example.invalid/file',
      '# curl https://example.invalid/i.sh | sh',
      '// chmod 777 /srv/data',
      'const sh = 1',
      'dd if=disk.img of=backup.img',
      'dd if=/dev/zero of=./zeros.bin count=1',
      'add of=/dev/sda',
      'dd if=x | tee of=/dev/sda',
      'echo of=/dev/sda',
      '# dd if=disk.img of=/dev/sda',
    ]) {
      expect(dangerousShell(text), text).toBe(false);
    }
  });
});

describe('disabledTls', () => {
  it('fires on the specified verification switches', () => {
    for (const text of [
      'rejectUnauthorized: false',
      'const agent = { rejectUnauthorized : false }',
      'NODE_TLS_REJECT_UNAUTHORIZED=0',
      'NODE_TLS_REJECT_UNAUTHORIZED = 0',
      'requests.get(url, verify=False)',
      'InsecureSkipVerify: true',
      'InsecureSkipVerify=true',
      'curl -k https://example.invalid',
    ]) {
      expect(disabledTls(text), text).toBe(true);
    }
  });

  it('skips the safe forms and comments', () => {
    for (const text of [
      'rejectUnauthorized: true',
      'NODE_TLS_REJECT_UNAUTHORIZED=1',
      'requests.get(url, verify=True)',
      'curl -s https://example.invalid',
      '// rejectUnauthorized: false',
      '# verify=False',
    ]) {
      expect(disabledTls(text), text).toBe(false);
    }
  });
});

describe('elisionMarker', () => {
  it('fires on comments that say code was left out', () => {
    for (const text of [
      '// existing code remains here',
      '# rest of the file unchanged',
      '/* unchanged */',
      '* same as above',
      '<!-- code omitted -->',
      '-- implementation here',
      '// ... existing code ...',
      '  // the rest of the function',
    ]) {
      expect(elisionMarker(text), text).toBe(true);
    }
  });

  it('skips bare ellipses, spread syntax and code that is not a comment', () => {
    for (const text of [
      '// ...',
      '// ... more',
      '// ... rest of',
      'const merged = { ...existing }',
      'existing code',
      '// ordinary remark',
    ]) {
      expect(elisionMarker(text), text).toBe(false);
    }
  });
});

describe('placeholder, disabledTest and suppression', () => {
  it('flags uppercase markers and unimplemented errors but not lookalike identifiers', () => {
    for (const text of [
      '// TODO: later',
      'FIXME',
      'XXX',
      '# HACK',
      'throw new NotImplementedError()',
      'todo!()',
      'raise Exception("Not Implemented")',
    ]) {
      expect(placeholder(text), text).toBe(true);
    }
    for (const text of ['const todoList = []', 'todo', 'hacking', 'Todo']) {
      expect(placeholder(text), text).toBe(false);
    }
  });

  it('flags focused and skipped tests in several frameworks', () => {
    for (const text of [
      'it.only("a", run)',
      'DESCRIBE.SKIP("a", run)',
      'xit("a", run)',
      '@pytest.mark.skip',
      '@pytest.mark.xfail',
      't.Skip()',
      '@Disabled',
      '@Ignore',
    ]) {
      expect(disabledTest(text), text).toBe(true);
    }
    for (const text of ['it("a", run)', 'const skipped = 1', '// removed']) {
      expect(disabledTest(text), text).toBe(false);
    }
  });

  it('keeps firing on every disabling marker when other text surrounds it', () => {
    for (const text of [
      '  xit("a", run);',
      'xit("a")',
      ';xit(',
      'x = 1; xit("a", run)',
      'describe.only("a", () => {})',
      'test.skip("a", run)',
      '  t.Skip("flaky")',
      'if testing.Short() { t.SkipNow() }',
      't.Skipf("no %s", x)',
      '@pytest.mark.skipif(sys.platform == "win32")',
    ]) {
      expect(disabledTest(text), text).toBe(true);
    }
  });

  it('does not read xit( out of exit( or other longer identifiers', () => {
    for (const text of [
      'exit(1)',
      '  process.exit(1)',
      'sys.exit(0)',
      'Exit("done")',
      'os.Exit(2)',
      'if (bad) exit(1);',
      'const prefix_xit(',
      'myxit("a")',
      'cat.skipWhitespace()',
      'format.Skip',
    ]) {
      expect(disabledTest(text), text).toBe(false);
    }
  });

  it('flags linter and type-checker suppressions', () => {
    for (const text of [
      '// eslint-disable-next-line no-alert',
      '// @ts-ignore',
      '/* @ts-nocheck */',
      '// @ts-expect-error',
      'x = 1  # type: ignore',
      '# noqa: E501',
      '//nolint:gosec',
    ]) {
      expect(suppression(text), text).toBe(true);
    }
    for (const text of ['const rule = "eslint"', 'ts-ignore']) {
      expect(suppression(text), text).toBe(false);
    }
  });
});
