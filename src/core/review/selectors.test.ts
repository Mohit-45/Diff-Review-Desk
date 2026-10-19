import { describe, expect, it } from 'vitest';
import type { Hunk } from '../types';
import { createReviewState, reviewReducer } from './reducer';
import { selectPending, selectPercent, selectReviewStats, selectVerdict } from './selectors';

function hunk(id: string): Hunk {
  return {
    id,
    fileId: 'f00000000001',
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
    hash: '00000000001',
  };
}

describe('review selectors', () => {
  it('counts only parsed hunks and ignores stale state keys', () => {
    const parsed = [hunk('f00000000001:00000000001'), hunk('f00000000001:00000000002')];
    let state = createReviewState(
      '00000000001',
      parsed.map((item) => item.id),
    );
    state = reviewReducer(state, { type: 'decide', id: parsed[0]?.id ?? '', decision: 'approved' });
    state = reviewReducer(state, {
      type: 'decide',
      id: 'f00000000001:00000000003',
      decision: 'rejected',
    });
    expect(selectReviewStats(parsed, state)).toEqual({
      total: 2,
      reviewed: 1,
      approved: 1,
      rejected: 0,
      pending: 1,
      percent: 50,
      verdict: 'In progress',
    });
    expect(selectPending(state, parsed)).toBe(1);
  });

  it('returns Changes requested for any rejection and Approved for an empty diff', () => {
    const parsed = [hunk('f00000000001:00000000001')];
    let state = createReviewState('00000000001', [parsed[0]?.id ?? '']);
    state = reviewReducer(state, { type: 'decide', id: parsed[0]?.id ?? '', decision: 'rejected' });
    expect(selectVerdict(state, parsed)).toBe('Changes requested');
    expect(selectPercent([], state)).toBe(0);
    expect(selectVerdict([], state)).toBe('Approved');
  });
});
