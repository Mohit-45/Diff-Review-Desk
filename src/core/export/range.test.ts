import { describe, expect, it } from 'vitest';
import type { DiffFile, DiffLine, Hunk, MetaReason } from '../types';
import { rangeLabel } from './range';

function line(kind: DiffLine['kind'], oldNo: number | null, newNo: number | null): DiffLine {
  return { kind, text: 'text', oldNo, newNo };
}

function makeHunk(overrides: Partial<Hunk> = {}): Hunk {
  return {
    id: 'f00000000000:h',
    fileId: 'f00000000000',
    index: 0,
    kind: 'text',
    meta: [],
    header: '@@ -1 +1 @@',
    section: '',
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 1,
    lines: [],
    added: 0,
    removed: 0,
    truncated: false,
    countMismatch: false,
    hash: 'h',
    ...overrides,
  };
}

function makeFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    id: 'f00000000000',
    displayPath: 'src/a.ts',
    oldPath: 'src/a.ts',
    newPath: 'src/a.ts',
    status: 'modified',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated: false,
    hunks: [],
    added: 0,
    removed: 0,
    incomplete: false,
    ...overrides,
  };
}

function metaHunk(...meta: MetaReason[]): Hunk {
  return makeHunk({ kind: 'meta', meta });
}

describe('rangeLabel line ranges', () => {
  it('uses the first and last added new line numbers', () => {
    const hunk = makeHunk({
      lines: [line('add', null, 5), line('context', 6, 6), line('add', null, 9)],
    });
    expect(rangeLabel(hunk)).toBe('lines 5-9');
  });

  it('collapses a single added line to one number', () => {
    expect(rangeLabel(makeHunk({ lines: [line('add', null, 5)] }))).toBe('line 5');
  });

  it('uses old numbers and a removed suffix for deletion-only hunks', () => {
    const hunk = makeHunk({
      lines: [line('remove', 4, null), line('remove', 5, null), line('remove', 6, null)],
    });
    expect(rangeLabel(hunk)).toBe('lines 4-6 (removed)');
    expect(rangeLabel(makeHunk({ lines: [line('remove', 4, null)] }))).toBe('line 4 (removed)');
  });

  it('prefers additions over removals when both are present', () => {
    const hunk = makeHunk({ lines: [line('remove', 2, null), line('add', null, 3)] });
    expect(rangeLabel(hunk)).toBe('line 3');
  });

  it('falls back to the hunk start when no changed line has a number', () => {
    expect(rangeLabel(makeHunk({ newStart: 7, lines: [line('context', 7, 7)] }))).toBe('lines 7-7');
    expect(rangeLabel(makeHunk({ newStart: 1, lines: [] }))).toBe('line 1');
  });
});

describe('rangeLabel whole-file labels', () => {
  it('reports binary files before any other reason', () => {
    const file = makeFile({ binary: true, status: 'deleted' });
    expect(rangeLabel(metaHunk('unparsed'), file)).toBe('(binary file)');
    expect(rangeLabel(metaHunk('binary'))).toBe('(binary file)');
  });

  it('reports deleted files before unparsed and empty-file reasons', () => {
    const file = makeFile({ status: 'deleted' });
    expect(rangeLabel(metaHunk('unparsed'), file)).toBe('(file deleted)');
  });

  it('reports unparsed lines before an empty file', () => {
    expect(rangeLabel(metaHunk('empty-file', 'unparsed'))).toBe('(unparsed lines)');
    expect(rangeLabel(metaHunk('empty-file'))).toBe('(empty file)');
  });

  it('shows both modes for a mode change and unknown when a file is missing', () => {
    const file = makeFile({ oldMode: '100644', newMode: '100755' });
    expect(rangeLabel(metaHunk('mode-change'), file)).toBe('(mode 100644 -> 100755)');
    expect(rangeLabel(metaHunk(), file)).toBe('(mode 100644 -> 100755)');
    expect(rangeLabel(metaHunk('mode-change'))).toBe('(mode unknown -> unknown)');
    expect(rangeLabel(metaHunk('mode-change'), makeFile({ newMode: '100755' }))).toBe(
      '(mode unknown -> 100755)',
    );
  });

  it('does not report a mode change for a text hunk without that reason', () => {
    const file = makeFile({ oldMode: '100644', newMode: '100755' });
    expect(rangeLabel(makeHunk({ lines: [line('add', null, 2)] }), file)).toBe('line 2');
  });

  it('names the old path of a rename with Markdown punctuation escaped', () => {
    const file = makeFile({
      status: 'renamed',
      oldPath: 'src/old_name-v2.ts',
      oldMode: '100644',
      newMode: '100644',
    });
    expect(rangeLabel(metaHunk('rename'), file)).toBe('(renamed from src/old\\_name\\-v2\\.ts)');
    expect(rangeLabel(metaHunk(), file)).toBe('(renamed from src/old\\_name\\-v2\\.ts)');
  });

  it('omits the old path when a rename has none', () => {
    expect(rangeLabel(metaHunk('rename'), makeFile({ oldPath: null }))).toBe('(renamed)');
    expect(rangeLabel(metaHunk('rename'))).toBe('(renamed)');
  });

  it('lists the distinct meta reasons of any other meta hunk', () => {
    expect(rangeLabel(metaHunk('copy', 'type-change'))).toBe('(copy, type-change)');
    expect(rangeLabel(metaHunk('copy', 'copy'))).toBe('(copy)');
    expect(rangeLabel(metaHunk('no-hunks'), makeFile())).toBe('(no-hunks)');
  });
});
