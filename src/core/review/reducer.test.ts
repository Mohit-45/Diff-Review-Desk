import { describe, expect, it } from 'vitest';
import { createReviewHistory, reviewHistoryReducer } from './history';
import { createReviewState, reviewReducer, truncateCodePoints } from './reducer';

const ids = ['f00000000001:00000000001', 'f00000000001:00000000002'] as const;

describe('reviewReducer', () => {
  it('RV-COMMENT-CAP truncates comments at a code-point boundary and treats whitespace as empty', () => {
    const state = createReviewState('00000000001', ids);
    const long = '😀'.repeat(2_001);
    const capped = reviewReducer(state, { type: 'setComment', id: ids[0], comment: long });
    expect(Array.from(capped.hunks[ids[0]?.toString() ?? '']?.comment ?? '')).toHaveLength(2_000);
    expect(capped.hunks[ids[0]]?.comment.endsWith('😀')).toBe(true);
    const empty = reviewReducer(capped, { type: 'setComment', id: ids[0], comment: ' \n\t' });
    expect(empty.hunks[ids[0]]?.comment).toBe('');
  });

  it('keeps RV-HELD-KEY unknown ids and repeated decisions as no-ops', () => {
    const state = createReviewState('00000000001', ids);
    const unknown = reviewReducer(state, { type: 'decide', id: 'unknown', decision: 'approved' });
    expect(unknown).toBe(state);
    const approved = reviewReducer(state, { type: 'decide', id: ids[0], decision: 'approved' });
    expect(reviewReducer(approved, { type: 'decide', id: ids[0], decision: 'approved' })).toBe(
      approved,
    );
    expect(reviewReducer(approved, { type: 'clear', id: ids[1] })).toBe(approved);
  });

  it('preserves comments when clearing a decision and reset clears carry-over', () => {
    const initial = createReviewState('00000000001', ids);
    const commented = reviewReducer(initial, {
      type: 'setComment',
      id: ids[0],
      comment: 'Keep this note',
    });
    const rejected = reviewReducer(commented, { type: 'decide', id: ids[0], decision: 'rejected' });
    const cleared = reviewReducer(rejected, { type: 'clear', id: ids[0] });
    expect(cleared.hunks[ids[0]]).toEqual({ decision: null, comment: 'Keep this note' });
    const reset = reviewReducer(
      {
        ...cleared,
        round: 2,
        prior: { round: 1, unchangedIds: ids, carried: {}, goneCount: 0, goneRejected: 0 },
      },
      { type: 'reset' },
    );
    expect(reset.round).toBe(1);
    expect(reset.prior).toBeNull();
    expect(Object.keys(reset.hunks)).toHaveLength(0);
  });

  it('hydrates only current ids and returns the same reference for an identical hydrate', () => {
    const state = createReviewState('00000000001', ids);
    const hydrated = reviewReducer(state, {
      type: 'hydrate',
      state: {
        ...state,
        hunks: {
          [ids[0]]: { decision: 'approved', comment: '' },
          unknown: { decision: 'rejected', comment: '' },
        },
      },
    });
    expect(hydrated.hunks[ids[0]]?.decision).toBe('approved');
    expect(hydrated.hunks.unknown).toBeUndefined();
    expect(reviewReducer(hydrated, { type: 'hydrate', state: hydrated })).toBe(hydrated);
  });

  it('caps history at 100 entries and makes undo/redo no-ops at the ends', () => {
    let history = createReviewHistory(createReviewState('00000000001', ids));
    for (let index = 0; index < 102; index += 1) {
      history = reviewHistoryReducer(history, {
        type: 'setOverallNote',
        note: truncateCodePoints(`note-${index}`, 4_000),
      });
    }
    expect(history.past).toHaveLength(100);
    let undone = history;
    for (let index = 0; index < 100; index += 1) {
      undone = reviewHistoryReducer(undone, { type: 'undo' });
    }
    expect(reviewHistoryReducer(undone, { type: 'undo' })).toBe(undone);
    let redone = undone;
    for (let index = 0; index < 100; index += 1) {
      redone = reviewHistoryReducer(redone, { type: 'redo' });
    }
    expect(reviewHistoryReducer(redone, { type: 'redo' })).toBe(redone);
  });
});
