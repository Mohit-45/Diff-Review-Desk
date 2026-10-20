import { describe, expect, it } from 'vitest';
import type { DiffFile, DiffLine, Flag, Hunk } from '../types';
import { P0_RULES, type RiskRule } from './config';
import { analyze, analyzeFlags } from './engine';

type FileOptions = {
  readonly status?: DiffFile['status'];
  readonly added?: readonly string[];
  readonly removed?: readonly string[];
  readonly binary?: boolean;
  readonly generated?: boolean;
  readonly oldMode?: string | null;
  readonly newMode?: string | null;
};

function makeHunk(fileId: string, added: readonly string[], removed: readonly string[]): Hunk {
  const lines: DiffLine[] = [
    ...removed.map((text, index): DiffLine => ({
      kind: 'remove',
      text,
      oldNo: index + 1,
      newNo: null,
    })),
    ...added.map((text, index): DiffLine => ({ kind: 'add', text, oldNo: null, newNo: index + 1 })),
  ];
  return {
    id: `${fileId}:hunk`,
    fileId,
    index: 0,
    kind: 'text',
    meta: [],
    header: '@@ -1 +1 @@',
    section: '',
    oldStart: 1,
    oldCount: removed.length,
    newStart: 1,
    newCount: added.length,
    lines,
    added: added.length,
    removed: removed.length,
    truncated: false,
    countMismatch: false,
    hash: 'hash',
  };
}

function makeFile(path: string, options: FileOptions = {}): DiffFile {
  const id = `f-${path}`;
  const added = options.added ?? [];
  const removed = options.removed ?? [];
  return {
    id,
    displayPath: path,
    oldPath: options.status === 'added' ? null : path,
    newPath: options.status === 'deleted' ? null : path,
    status: options.status ?? 'modified',
    similarity: null,
    oldMode: options.oldMode ?? null,
    newMode: options.newMode ?? null,
    kind: 'regular',
    binary: options.binary ?? false,
    generated: options.generated ?? false,
    hunks: added.length + removed.length > 0 ? [makeHunk(id, added, removed)] : [],
    added: added.length,
    removed: removed.length,
    incomplete: false,
  };
}

function severities(file: DiffFile): Record<string, Flag['severity']> {
  return Object.fromEntries(analyze([file]).flags.map((flag) => [flag.ruleId, flag.severity]));
}

const TLS = 'rejectUnauthorized: false';
const GITHUB = `${['gh', 'p_'].join('')}${'aBcD1eFgH2iJkL3mN'.repeat(3).slice(0, 36)}`;

describe('severity caps by path', () => {
  it('lowers capped rules to low in test, docs, lock, vendored and generated paths', () => {
    for (const path of [
      'src/a.test.ts',
      'docs/guide.ts',
      'package-lock.json',
      'vendor/x.js',
      'src/gen.ts',
    ]) {
      const file = makeFile(path, { added: [TLS], generated: path === 'src/gen.ts' });
      expect(severities(file)['tls-verification-disabled'], path).toBe('low');
    }
    expect(
      severities(makeFile('src/client.ts', { added: [TLS] }))['tls-verification-disabled'],
    ).toBe('high');
  });

  it('never lowers secrets, sensitive files or hidden Unicode', () => {
    const secret = severities(makeFile('docs/guide.md', { added: [GITHUB] }));
    expect(secret['secret-known-token']).toBe('high');
    const sensitive = severities(
      makeFile('.env', { status: 'added', added: ['A=1'], generated: true }),
    );
    expect(sensitive['sensitive-file-added']).toBe('high');
    const hidden = severities(
      makeFile('src/a.test.ts', { added: [`x${String.fromCodePoint(0x202e)}y`] }),
    );
    expect(hidden['hidden-unicode']).toBe('high');
  });

  it('lowers shell scripts and bin files for mode changes but not other paths', () => {
    expect(severities(makeFile('scripts/run.sh', { newMode: '100755' }))['file-mode-changed']).toBe(
      'low',
    );
    expect(severities(makeFile('bin/run', { newMode: '100755' }))['file-mode-changed']).toBe('low');
    expect(severities(makeFile('src/run.py', { newMode: '100755' }))['file-mode-changed']).toBe(
      'medium',
    );
    const symlink = makeFile('src/link', { oldMode: '100644', newMode: '120000' });
    expect(severities(symlink)['file-mode-changed']).toBe('medium');
  });

  it('lowers deleted generated and lock files and keeps other deletions at medium', () => {
    expect(severities(makeFile('src/old.ts', { status: 'deleted' }))['file-deleted']).toBe(
      'medium',
    );
    expect(severities(makeFile('yarn.lock', { status: 'deleted' }))['file-deleted']).toBe('low');
    expect(severities(makeFile('dist/app.min.js', { status: 'deleted' }))['file-deleted']).toBe(
      'low',
    );
  });

  it('lowers image and font binaries and keeps other binaries at medium', () => {
    expect(severities(makeFile('assets/logo.png', { binary: true }))['binary-file']).toBe('low');
    expect(severities(makeFile('assets/font.woff2', { binary: true }))['binary-file']).toBe('low');
    expect(severities(makeFile('assets/data.bin', { binary: true }))['binary-file']).toBe('medium');
  });

  it('reports a deleted test file as high without a separate file-deleted flag', () => {
    const flags = severities(makeFile('src/widget.test.ts', { status: 'deleted' }));
    expect(flags['test-file-deleted']).toBe('high');
    expect(flags['file-deleted']).toBeUndefined();
  });
});

describe('line selection', () => {
  it('ignores an added line that was only moved within the file', () => {
    const moved = makeFile('src/a.ts', { added: ['// TODO later'], removed: ['// TODO later'] });
    expect(analyzeFlags([moved])).toEqual([]);
  });

  it('suppresses one added copy for each removed copy', () => {
    const file = makeFile('src/a.ts', {
      added: ['// TODO later', '// TODO later'],
      removed: ['// TODO later'],
    });
    const [flag] = analyzeFlags([file]);
    expect(flag).toMatchObject({ ruleId: 'placeholder-introduced', count: 1, lines: [2] });
  });

  it('matches only the scan prefix for ordinary rules but the whole line for secrets', () => {
    const padded = `${'x'.repeat(30)} // TODO later ${GITHUB}`;
    const ids = analyze([makeFile('src/a.ts', { added: [padded] })], {
      maxLineScanChars: 10,
    }).flags.map((flag) => flag.ruleId);
    expect(ids).toEqual(['secret-known-token']);
  });

  it('adds one notice per line longer than the scan limit', () => {
    const file = makeFile('src/a.ts', { added: ['x'.repeat(12), 'short', 'y'.repeat(20)] });
    const { notices, bulkIneligibleFileIds } = analyze([file], { maxLineScanChars: 10 });
    expect(notices).toEqual([
      { ruleId: null, fileId: file.id, message: 'A line in src/a.ts exceeds the scan limit.' },
      { ruleId: null, fileId: file.id, message: 'A line in src/a.ts exceeds the scan limit.' },
    ]);
    expect(bulkIneligibleFileIds).toEqual([]);
  });
});

describe('flags', () => {
  it('merges lines of one rule in one hunk into one flag with sorted line references', () => {
    const file = makeFile('src/a.ts', { added: ['// TODO one', 'plain', '// FIXME two'] });
    const [flag] = analyzeFlags([file]);
    expect(flag).toMatchObject({ ruleId: 'placeholder-introduced', count: 2, lines: [1, 3] });
    expect(flag?.evidence).toBe('// TODO one');
  });

  it('orders by severity, then path, then first line, then rule id', () => {
    const files = [
      makeFile('b.ts', { added: ['// TODO b'] }),
      makeFile('a.ts', { added: ['x', '// TODO a', '// eslint-disable-line'] }),
      makeFile('d.ts', { added: ['// TODO eslint-disable-line'] }),
      makeFile('c.ts', { added: [TLS] }),
    ];
    const order = analyzeFlags(files).map(
      (flag) => `${flag.severity}:${flag.fileId}:${flag.ruleId}`,
    );
    expect(order).toEqual([
      'high:f-c.ts:tls-verification-disabled',
      'medium:f-a.ts:placeholder-introduced',
      'medium:f-a.ts:suppression-added',
      'medium:f-b.ts:placeholder-introduced',
      'medium:f-d.ts:placeholder-introduced',
      'medium:f-d.ts:suppression-added',
    ]);
  });

  it('masks evidence and keeps no content for sensitive files', () => {
    const file = makeFile('.env', { status: 'added', added: ['SECRET_VALUE=abc'] });
    expect(
      analyzeFlags([file]).find((flag) => flag.ruleId === 'sensitive-file-added')?.evidence,
    ).toBe('[REDACTED:sensitive-file-added]');
    const token = analyzeFlags([makeFile('src/a.ts', { added: [`value = ${GITHUB}`] })]);
    expect(token[0]?.evidence).toBe('value = ghp_****[40]');
  });
});

describe('analyze configuration', () => {
  const rule: RiskRule = {
    id: 'dependency-added',
    severity: 'high',
    title: 'Custom',
    why: 'Custom rule',
    prefilter: [],
    evaluate: (context) => [{ hunkId: null, count: context.addedLines.length }],
  };

  it('accepts a rule list, a rules option or a registry option', () => {
    const file = makeFile('src/a.ts', { added: ['one', 'two'] });
    for (const config of [[rule], { rules: [rule] }, { registry: [rule] }]) {
      const result = analyze([file], config);
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0]).toMatchObject({
        ruleId: 'dependency-added',
        severity: 'high',
        count: 2,
      });
    }
  });

  it('runs the P0 registry by default and stays quiet for an empty rule list', () => {
    const file = makeFile('src/a.ts', { added: ['// TODO later'] });
    expect(analyze([file]).flags).toHaveLength(1);
    expect(analyze([file], { rules: P0_RULES }).flags).toEqual(analyze([file]).flags);
    expect(analyze([file], []).flags).toEqual([]);
  });

  it('clamps a scan limit below one character to one', () => {
    const file = makeFile('src/a.ts', { added: ['ab'] });
    expect(analyze([file], { maxLineScanChars: 0 }).notices).toHaveLength(1);
  });
});
