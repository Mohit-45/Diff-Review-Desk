import { describe, expect, it } from 'vitest';
import { parseDiff } from '../parser/parse';
import { analyze } from './engine';
import { fileWithAddedLines } from './riskFixtures';
import { isVersionSpec, parsePackageEntry } from './rules/packageManifest';

function dependencyLines(diff: string): readonly number[] {
  const parsed = parseDiff(diff);
  if (!parsed.ok) {
    return [];
  }
  return analyze(parsed.files)
    .flags.filter((flag) => flag.ruleId === 'dependency-added')
    .flatMap((flag) => flag.lines);
}

function manifestDiff(path: string, body: readonly string[], oldCount: number): string {
  const newCount = body.filter((line) => !line.startsWith('-')).length;
  return [
    `diff --git a/${path} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${String(oldCount)} +1,${String(newCount)} @@`,
    ...body,
    '',
  ].join('\n');
}

function flagged(path: string, added: readonly string[]): boolean {
  return analyze([fileWithAddedLines(path, added)]).flags.some(
    (flag) => flag.ruleId === 'dependency-added',
  );
}

describe('dependency-added in a pretty-printed package.json hunk', () => {
  it('fires on the added dependency line and only on it', () => {
    const diff = manifestDiff(
      'package.json',
      [
        ' {',
        '   "name": "fictional-agent",',
        '   "version": "1.0.0",',
        '   "dependencies": {',
        '+    "review-helper": "1.0.0"',
        '   }',
        ' }',
      ],
      6,
    );
    expect(dependencyLines(diff)).toEqual([5]);
  });

  it('fires once per added dependency, including a comma-terminated one', () => {
    const diff = manifestDiff(
      'package.json',
      [
        '   "dependencies": {',
        '+    "left-pad": "^1.3.0",',
        '+    "right-pad": "~2.0.1",',
        '     "kept": "1.0.0"',
        '   }',
      ],
      3,
    );
    expect(dependencyLines(diff)).toEqual([2, 3]);
  });

  it('does not fire on added script lines, name or version', () => {
    const diff = manifestDiff(
      'package.json',
      [
        '+  "name": "renamed",',
        '+  "version": "2.0.0",',
        '+  "scripts": {',
        '+    "build": "tsc",',
        '+    "test": "vitest",',
        '+    "lint": "eslint . --max-warnings 0",',
        '+    "start": "node dist/index.js"',
        '+  }',
      ],
      0,
    );
    expect(dependencyLines(diff)).toEqual([]);
  });

  it('does not fire on a version bump of an existing dependency', () => {
    const diff = manifestDiff(
      'package.json',
      ['   "dependencies": {', '-    "left-pad": "1.0.0"', '+    "left-pad": "1.1.0"', '   }'],
      3,
    );
    expect(dependencyLines(diff)).toEqual([]);
  });

  it('does not fire on a one-line manifest that is not shaped like an entry', () => {
    const diff = manifestDiff('package.json', ['+{"dependencies":{"review-helper":"1.0.0"}}'], 0);
    expect(dependencyLines(diff)).toEqual([]);
  });
});

describe('dependency-added line shapes', () => {
  it('fires for every kind of version spec', () => {
    for (const value of [
      '1.0.0',
      '^1.2.3',
      '~1.2',
      '>=1.0.0 <2.0.0',
      '>= 1.0.0',
      '1.x',
      '1.2.x',
      '*',
      'latest',
      'next',
      '1.0.0-beta.1',
      '1.0.0 - 2.0.0',
      '^1.0.0 || ^2.0.0',
      'github:owner/repo#main',
      'git+https://example.invalid/owner/repo.git',
      'https://example.invalid/pkg.tgz',
      'file:../local-pkg',
      'workspace:*',
      'npm:other-name@^1.0.0',
    ]) {
      expect(flagged('package.json', [`    "some-package": "${value}",`]), value).toBe(true);
    }
  });

  it('stays quiet for commands, paths, malformed ranges and metadata keys', () => {
    for (const value of [
      'tsc',
      'vitest',
      'node index.js',
      'bin/cli.js',
      '1.0.0 ||',
      '>=',
      '1..2',
    ]) {
      expect(flagged('package.json', [`    "some-script": "${value}"`]), value).toBe(false);
    }
    for (const key of ['name', 'version', 'type', 'license', 'packageManager', 'homepage', 'url']) {
      expect(flagged('package.json', [`  "${key}": "1.0.0"`]), key).toBe(false);
    }
  });

  it('keeps requirements files and other files as before', () => {
    expect(flagged('requirements.txt', ['requests==2.0.0'])).toBe(true);
    expect(flagged('requirements-dev.txt', ['pytest>=7'])).toBe(true);
    expect(flagged('requirements.txt', ['# pinned', '-r base.txt'])).toBe(false);
    expect(flagged('src/config.json', ['  "some-package": "1.0.0"'])).toBe(false);
  });
});

describe('package entry parsing', () => {
  it('reads key and value from a whole line only', () => {
    expect(parsePackageEntry('  "Left-Pad": "1.0.0" , ')).toEqual({
      key: 'left-pad',
      value: '1.0.0',
    });
    for (const line of [
      '"a": 1',
      '"a": "b" extra',
      '"a" "b"',
      'a: "b"',
      '"a": "b\\"c"',
      '"a": {',
    ]) {
      expect(parsePackageEntry(line), line).toBeNull();
    }
  });

  it('rejects an empty or whitespace-only spec', () => {
    expect(isVersionSpec('')).toBe(false);
    expect(isVersionSpec('   ')).toBe(false);
  });
});
