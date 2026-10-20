import { describe, expect, it } from 'vitest';
import type { ReviewState } from '../types';
import { createReviewState, reviewReducer } from './reducer';

const first = 'f00000000001:00000000001';
const second = 'f00000000001:00000000002';
const stale = 'f00000000001:00000000009';

function decided(): ReviewState {
  const state = createReviewState('00000000001', [first, second], 'Label');
  return reviewReducer(state, { type: 'decide', id: first, decision: 'approved' });
}

describe('decide and clear', () => {
  it('switches a decision without losing the comment and leaves the old state untouched', () => {
    const commented = reviewReducer(decided(), { type: 'setComment', id: first, comment: 'note' });
    const rejected = reviewReducer(commented, { type: 'decide', id: first, decision: 'rejected' });
    expect(rejected.hunks[first]).toEqual({ decision: 'rejected', comment: 'note' });
    expect(commented.hunks[first]).toEqual({ decision: 'approved', comment: 'note' });
    expect(rejected.hunkIds).toBe(commented.hunkIds);
  });

  it('removes the entry when a decided hunk without a comment is cleared', () => {
    const before = decided();
    const cleared = reviewReducer(before, { type: 'clear', id: first });
    expect(Object.keys(cleared.hunks)).toEqual([]);
    expect(Object.keys(before.hunks)).toEqual([first]);
  });

  it('ignores a clear for a pending hunk, even one that only has a comment', () => {
    const commented = reviewReducer(createReviewState('00000000001', [first]), {
      type: 'setComment',
      id: first,
      comment: 'note',
    });
    expect(reviewReducer(commented, { type: 'clear', id: first })).toBe(commented);
    expect(reviewReducer(commented, { type: 'clear', id: stale })).toBe(commented);
  });

  it('ignores decisions and comments for ids that are not in the diff', () => {
    const state = decided();
    expect(reviewReducer(state, { type: 'decide', id: stale, decision: 'rejected' })).toBe(state);
    expect(reviewReducer(state, { type: 'setComment', id: stale, comment: 'x' })).toBe(state);
  });
});

describe('comments and overall note', () => {
  it('keeps the decision when the comment changes and treats an equal comment as a no-op', () => {
    const state = reviewReducer(decided(), { type: 'setComment', id: first, comment: 'one' });
    expect(state.hunks[first]).toEqual({ decision: 'approved', comment: 'one' });
    expect(reviewReducer(state, { type: 'setComment', id: first, comment: 'one' })).toBe(state);
    const emptied = reviewReducer(state, { type: 'setComment', id: first, comment: ' \n ' });
    expect(emptied.hunks[first]).toEqual({ decision: 'approved', comment: '' });
  });

  it('stores a comment on a hunk with no decision as pending', () => {
    const state = reviewReducer(createReviewState('00000000001', [first]), {
      type: 'setComment',
      id: first,
      comment: 'later',
    });
    expect(state.hunks[first]).toEqual({ decision: null, comment: 'later' });
  });

  it('keeps overall note whitespace, caps it at 4,000 code points and ignores repeats', () => {
    const state = createReviewState('00000000001', [first]);
    const noted = reviewReducer(state, { type: 'setOverallNote', note: '  keep  ' });
    expect(noted.overallNote).toBe('  keep  ');
    expect(reviewReducer(noted, { type: 'setOverallNote', note: '  keep  ' })).toBe(noted);
    const capped = reviewReducer(state, {
      type: 'setOverallNote',
      note: '\u{1f600}'.repeat(4_001),
    });
    expect(Array.from(capped.overallNote)).toHaveLength(4_000);
  });

  it('caps the label at 80 code points when a review is created', () => {
    const state = createReviewState('00000000001', [first], '\u{1f600}'.repeat(90));
    expect(Array.from(state.label)).toHaveLength(80);
  });
});

describe('hydrate and reset', () => {
  it('drops carried ids that are not in this diff and keeps the prior when nothing is dropped', () => {
    const state = createReviewState('00000000001', [first, second]);
    const prior = {
      round: 1,
      unchangedIds: [first, stale],
      carried: { [first]: 'approved', [stale]: 'rejected' } as const,
      goneCount: 2,
      goneRejected: 1,
    };
    const hydrated = reviewReducer(state, {
      type: 'hydrate',
      state: { ...state, round: 2, prior },
    });
    expect(hydrated.round).toBe(2);
    expect(hydrated.prior?.unchangedIds).toEqual([first]);
    expect(hydrated.prior?.carried).toEqual({ [first]: 'approved' });
    expect(hydrated.prior?.goneCount).toBe(2);

    const clean = { ...prior, unchangedIds: [first], carried: { [first]: 'approved' } as const };
    const again = reviewReducer(state, {
      type: 'hydrate',
      state: { ...state, round: 2, prior: clean },
    });
    expect(again.prior).toBe(clean);
  });

  it('drops carried decisions whose id is not among the unchanged ids', () => {
    const state = createReviewState('00000000001', [first, second]);
    const prior = {
      round: 1,
      unchangedIds: [first],
      carried: { [first]: 'approved', [second]: 'rejected' } as const,
      goneCount: 0,
      goneRejected: 0,
    };
    const hydrated = reviewReducer(state, { type: 'hydrate', state: { ...state, prior } });
    expect(hydrated.prior?.carried).toEqual({ [first]: 'approved' });
  });

  it('drops empty entries and normalises the note while hydrating', () => {
    const state = createReviewState('00000000001', [first, second]);
    const hydrated = reviewReducer(state, {
      type: 'hydrate',
      state: {
        ...state,
        overallNote: 'y'.repeat(4_010),
        hunks: {
          [first]: { decision: null, comment: '' },
          [second]: { decision: 'rejected', comment: 'why' },
        },
      },
    });
    expect(Object.keys(hydrated.hunks)).toEqual([second]);
    expect(hydrated.overallNote).toHaveLength(4_000);
  });

  it('resets to round one while keeping identity, label and hunk ids', () => {
    const state = reviewReducer(decided(), { type: 'setOverallNote', note: 'n' });
    const reset = reviewReducer({ ...state, round: 4 }, { type: 'reset' });
    expect(reset).toEqual({
      fingerprint: '00000000001',
      round: 1,
      label: 'Label',
      overallNote: '',
      hunks: {},
      hunkIds: [first, second],
      prior: null,
    });
    expect(reset.hunkIds).toBe(state.hunkIds);
  });

  it('returns the same reference when a reset changes nothing', () => {
    const pristine = createReviewState('00000000001', [first]);
    expect(reviewReducer(pristine, { type: 'reset' })).toBe(pristine);
  });
});
