import { describe, expect, it } from 'vitest';
import type { DiffFile, Hunk, ReviewState } from '../core/types';
import { DEFAULT_REVIEW_FILTERS } from './components/Filters';
import {
  buildEntries,
  buildView,
  changedEntry,
  findEntry,
  firstPending,
  pendingCount,
  stepFile,
  stepHunk,
  stepPending,
} from './reviewModel';

function hunk(id: string, fileId: string, index: number): Hunk {
  return {
    id,
    fileId,
    index,
    kind: 'text',
    meta: [],
    header: null,
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
    hash: id,
  };
}

function file(id: string, path: string, hunkIds: readonly string[]): DiffFile {
  return {
    id,
    displayPath: path,
    oldPath: path,
    newPath: path,
    status: 'modified',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated: false,
    hunks: hunkIds.map((hunkId, index) => hunk(hunkId, id, index)),
    added: 0,
    removed: 0,
    incomplete: false,
  };
}

const files = [
  file('fa', 'src/a.ts', ['a1', 'a2']),
  file('fb', 'src/b.ts', ['b1']),
  file('fc', 'docs/c.md', ['c1', 'c2']),
];
const entries = buildEntries(files);

function state(decisions: Record<string, 'approved' | 'rejected'>, comments = {}): ReviewState {
  const hunks: ReviewState['hunks'] = Object.fromEntries(
    entries.map((entry) => [
      entry.hunk.id,
      {
        decision: decisions[entry.hunk.id] ?? null,
        comment: (comments as Record<string, string>)[entry.hunk.id] ?? '',
      },
    ]),
  );
  return {
    fingerprint: 'f',
    round: 1,
    label: 'L',
    overallNote: '',
    hunks,
    hunkIds: entries.map((entry) => entry.hunk.id),
    prior: null,
  };
}

const ids = (list: readonly { readonly hunk: Hunk }[]) => list.map((entry) => entry.hunk.id);

describe('review model', () => {
  it('MODEL-ENTRIES numbers hunks across files in document order', () => {
    expect(entries.map((entry) => entry.number)).toEqual([1, 2, 3, 4, 5]);
    expect(ids(entries)).toEqual(['a1', 'a2', 'b1', 'c1', 'c2']);
    expect(findEntry(entries, 'b1')?.number).toBe(3);
    expect(findEntry(entries, null)).toBeUndefined();
    expect(findEntry(entries, 'zz')).toBeUndefined();
  });

  it('MODEL-VIEW filters hunks and pins the current one when a filter would hide it', () => {
    const review = { state: state({ a1: 'approved' }), flags: [] };
    const pending = buildView(
      entries,
      { ...DEFAULT_REVIEW_FILTERS, status: 'pending' },
      review,
      null,
    );
    expect(ids(pending.matching)).toEqual(['a2', 'b1', 'c1', 'c2']);
    expect(ids(pending.visible)).toEqual(['a2', 'b1', 'c1', 'c2']);

    const pinned = buildView(
      entries,
      { ...DEFAULT_REVIEW_FILTERS, status: 'pending' },
      review,
      'a1',
    );
    expect(ids(pinned.matching)).toEqual(['a2', 'b1', 'c1', 'c2']);
    expect(ids(pinned.visible)).toEqual(['a1', 'a2', 'b1', 'c1', 'c2']);

    const byPath = buildView(entries, { ...DEFAULT_REVIEW_FILTERS, path: 'docs' }, review, null);
    expect(ids(byPath.matching)).toEqual(['c1', 'c2']);
    const none = buildView(entries, { ...DEFAULT_REVIEW_FILTERS, path: 'nope' }, review, 'b1');
    expect(none.matching).toHaveLength(0);
    expect(ids(none.visible)).toEqual(['b1']);
  });

  it('MODEL-PENDING counts and finds pending hunks', () => {
    const decided = state({ a1: 'approved', a2: 'rejected' });
    expect(pendingCount(entries, decided)).toBe(3);
    expect(firstPending(entries, decided)?.hunk.id).toBe('b1');
    expect(
      firstPending(
        entries,
        state({ a1: 'approved', a2: 'approved', b1: 'approved', c1: 'approved', c2: 'approved' }),
      ),
    ).toBeUndefined();
  });

  it('MODEL-STEP-HUNK walks without wrapping and falls back to the ends for an unknown id', () => {
    expect(stepHunk(entries, 'a1', 1)?.hunk.id).toBe('a2');
    expect(stepHunk(entries, 'c2', 1)).toBeNull();
    expect(stepHunk(entries, 'a1', -1)).toBeNull();
    expect(stepHunk(entries, 'zz', 1)?.hunk.id).toBe('a1');
    expect(stepHunk(entries, null, -1)?.hunk.id).toBe('c2');
    expect(stepHunk([], null, 1)).toBeNull();
  });

  it('MODEL-STEP-PENDING wraps, reports the wrap and returns the current hunk only when alone', () => {
    const decided = state({ a1: 'approved', b1: 'approved' });
    expect(stepPending(entries, decided, 'a1', 1)).toMatchObject({ wrapped: false });
    expect(stepPending(entries, decided, 'a1', 1)?.entry.hunk.id).toBe('a2');
    expect(stepPending(entries, decided, 'c2', 1)).toMatchObject({ wrapped: true });
    expect(stepPending(entries, decided, 'c2', 1)?.entry.hunk.id).toBe('a2');
    expect(stepPending(entries, decided, 'a2', -1)?.entry.hunk.id).toBe('c2');
    expect(stepPending(entries, decided, 'a2', -1)?.wrapped).toBe(true);
    expect(stepPending(entries, decided, 'zz', 1)?.entry.hunk.id).toBe('a2');
    expect(stepPending(entries, decided, null, -1)?.entry.hunk.id).toBe('c2');

    const alone = state({ a1: 'approved', b1: 'approved', c1: 'approved', c2: 'approved' });
    expect(stepPending(entries, alone, 'a2', 1)?.entry.hunk.id).toBe('a2');
    const none = state({
      a1: 'approved',
      a2: 'approved',
      b1: 'approved',
      c1: 'approved',
      c2: 'approved',
    });
    expect(stepPending(entries, none, 'a1', 1)).toBeNull();
    expect(stepPending([], none, 'a1', 1)).toBeNull();
  });

  it('MODEL-STEP-FILE jumps to the first hunk of the next or previous file', () => {
    expect(stepFile(entries, 'a1', 1)?.hunk.id).toBe('b1');
    expect(stepFile(entries, 'a2', 1)?.hunk.id).toBe('b1');
    expect(stepFile(entries, 'c2', 1)).toBeNull();
    expect(stepFile(entries, 'c2', -1)?.hunk.id).toBe('b1');
    expect(stepFile(entries, 'b1', -1)?.hunk.id).toBe('a1');
    expect(stepFile(entries, 'a2', -1)).toBeNull();
    expect(stepFile(entries, 'zz', 1)).toBeNull();
  });

  it('MODEL-CHANGED finds the first hunk whose decision or comment differs', () => {
    const before = state({});
    expect(changedEntry(entries, before, before)).toBeNull();
    expect(changedEntry(entries, before, state({ b1: 'approved', c1: 'rejected' }))?.hunk.id).toBe(
      'b1',
    );
    expect(changedEntry(entries, before, state({}, { c2: 'note' }))?.hunk.id).toBe('c2');
  });
});
