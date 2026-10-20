import { describe, expect, it } from 'vitest';
import { generatedPath, parseGitHeaderPath, parseUnifiedHeaderPath } from './paths';

describe('parseGitHeaderPath', () => {
  it('splits equal prefixed halves without ambiguity', () => {
    expect(parseGitHeaderPath('a/src/x.ts b/src/x.ts')).toEqual({
      oldPath: 'src/x.ts',
      newPath: 'src/x.ts',
      ambiguous: false,
      encodingFailed: false,
    });
  });

  it('uses the first b/ boundary for names with spaces', () => {
    expect(parseGitHeaderPath('a/my dir/f.txt b/my dir/f.txt')).toMatchObject({
      oldPath: 'my dir/f.txt',
      newPath: 'my dir/f.txt',
      ambiguous: false,
    });
  });

  it('flags the b/ boundary as ambiguous when the old side is not a/-prefixed', () => {
    expect(parseGitHeaderPath('left b/right')).toMatchObject({
      oldPath: 'left',
      newPath: 'right',
      ambiguous: true,
    });
  });

  it('keeps equal unprefixed tokens as they are and strips nothing', () => {
    expect(parseGitHeaderPath('x.ts x.ts')).toMatchObject({
      oldPath: 'x.ts',
      newPath: 'x.ts',
      ambiguous: false,
    });
  });

  it('strips a/ and b/ from differing unprefixed tokens', () => {
    expect(parseGitHeaderPath('a/old.ts c/new.ts')).toMatchObject({
      oldPath: 'old.ts',
      newPath: 'c/new.ts',
      ambiguous: false,
    });
  });

  it('decodes quoted octal and escape sequences into UTF-8', () => {
    expect(parseGitHeaderPath('"a/caf\\303\\251\\t.ts" "b/caf\\303\\251\\t.ts"')).toEqual({
      oldPath: 'café\t.ts',
      newPath: 'café\t.ts',
      ambiguous: false,
      encodingFailed: false,
    });
  });

  it('reports invalid UTF-8 in a quoted name with U+FFFD and encodingFailed', () => {
    expect(parseGitHeaderPath('"a/bad\\377" "b/bad\\377"')).toMatchObject({
      oldPath: '�',
      newPath: '�',
      encodingFailed: true,
    });
  });

  it('treats /dev/null as a missing side', () => {
    expect(parseGitHeaderPath('/dev/null /dev/null')).toMatchObject({
      oldPath: null,
      newPath: null,
    });
    expect(parseGitHeaderPath('/dev/null b/new.txt')).toMatchObject({
      oldPath: null,
      newPath: 'new.txt',
    });
  });

  it('splits on the last space only when there is no second token, else uses one ambiguous token', () => {
    expect(parseGitHeaderPath('one two three')).toMatchObject({
      oldPath: 'one',
      newPath: 'two',
      ambiguous: false,
    });
    expect(parseGitHeaderPath('only ')).toMatchObject({
      oldPath: 'only',
      newPath: '',
      ambiguous: true,
    });
    expect(parseGitHeaderPath('only')).toMatchObject({
      oldPath: 'only',
      newPath: 'only',
      ambiguous: true,
    });
  });
});

describe('parseUnifiedHeaderPath', () => {
  it('drops a TAB and the timestamp after it, then the prefix', () => {
    expect(parseUnifiedHeaderPath('a/x.ts\t2020-01-01 00:00:00', 'a/')).toEqual({
      path: 'x.ts',
      failed: false,
    });
    expect(parseUnifiedHeaderPath('a/x.ts', null)).toEqual({ path: 'a/x.ts', failed: false });
  });

  it('maps /dev/null to no path, quoted or not', () => {
    expect(parseUnifiedHeaderPath('/dev/null', 'b/')).toEqual({ path: null, failed: false });
    expect(parseUnifiedHeaderPath('"/dev/null"', 'b/')).toEqual({ path: null, failed: false });
  });

  it('decodes quoted escapes and reports unterminated or invalid names', () => {
    expect(parseUnifiedHeaderPath('"b/a\\"q\\\\\\n"', 'b/')).toEqual({
      path: 'a"q\\\n',
      failed: false,
    });
    expect(parseUnifiedHeaderPath('"b/unterminated', 'b/')).toEqual({ path: '�', failed: true });
    expect(parseUnifiedHeaderPath('"b/\\', 'b/')).toEqual({ path: '�', failed: true });
    expect(parseUnifiedHeaderPath('"b/\\377"', 'b/')).toEqual({ path: '�', failed: true });
  });

  it('keeps a Latin-1 range literal as one byte, so a lone one is invalid UTF-8', () => {
    expect(parseUnifiedHeaderPath('"é"', null)).toEqual({ path: '�', failed: true });
    expect(parseUnifiedHeaderPath('"中\u{1F600}"', null)).toEqual({
      path: '中\u{1F600}',
      failed: false,
    });
  });
});

describe('generatedPath', () => {
  it.each([
    'package-lock.json',
    'yarn.lock',
    'a/Cargo.lock',
    'x.min.js',
    'x.MIN.CSS',
    'dist/a.map',
  ])('marks %s as generated', (path) => {
    expect(generatedPath(path)).toBe(true);
  });

  it.each(['src/app.ts', 'package.json', 'readme.md', 'maps.ts'])('does not mark %s', (path) => {
    expect(generatedPath(path)).toBe(false);
  });
});
