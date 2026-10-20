import { describe, expect, it } from 'vitest';
import type { Hunk } from '../types';
import { createReviewState, reviewReducer } from './reducer';
import { selectPercent, selectProgress, selectReviewStats } from './selectors';

function hunkWithId(id: string): Hunk {
  return {
    id,
    fileId: 'f00000000001',
    index: 0,
    kind: 'text',
    meta: [],
    header: null,
    section: '',
    oldStart: 1,
    oldCount: 0,
    newStart: 1,
    newCount: 0,
    lines: [],
    added: 0,
    removed: 0,
    truncated: false,
    countMismatch: false,
    hash: '00000000001',
  };
}

describe('review percent', () => {
  it('floors reviewed * 100 / total for every reviewed count and total from 1 to 100', () => {
    for (let total = 1; total <= 100; total += 1) {
      const ids = Array.from(
        { length: total },
        (_unused, index) => `f00000000001:${String(index).padStart(11, '0')}`,
      );
      const hunks = ids.map(hunkWithId);
      let state = createReviewState('00000000001', ids);
      for (let reviewed = 0; reviewed <= total; reviewed += 1) {
        const expected = Math.floor((reviewed * 100) / total);
        expect(selectPercent(hunks, state)).toBe(expected);
        expect(selectProgress(hunks, state)).toEqual({ total, reviewed, percent: expected });
        expect(selectReviewStats(hunks, state).percent).toBe(expected);
        const next = ids[reviewed];
        if (next !== undefined) {
          state = reviewReducer(state, { type: 'decide', id: next, decision: 'approved' });
        }
      }
    }
  });

  it('reports zero percent and no pending hunks for an empty diff', () => {
    const state = createReviewState('00000000001', []);
    expect(selectReviewStats([], state)).toEqual({
      total: 0,
      reviewed: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      percent: 0,
      verdict: 'Approved',
    });
  });
});
