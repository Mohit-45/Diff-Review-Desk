import { describe, expect, it } from 'vitest';
import { carryOver, carryOverSummary, startNewReview } from './carryover';
import { createReviewState, reviewReducer } from './reducer';

const first = 'f00000000001:00000000001';
const second = 'f00000000001:00000000002';
const changed = 'f00000000001:00000000003';

describe('carryOver', () => {
  it('carries decisions and comments for identical ids while preserving label and dropping overall note', () => {
    let previous = createReviewState('00000000001', [first, second], 'Review label');
    previous = reviewReducer(previous, { type: 'decide', id: first, decision: 'approved' });
    previous = reviewReducer(previous, { type: 'setComment', id: second, comment: 'Revisit this' });
    previous = reviewReducer(previous, { type: 'decide', id: second, decision: 'rejected' });
    previous = reviewReducer(previous, { type: 'setOverallNote', note: 'old note' });
    const summary = carryOverSummary(previous, {
      fingerprint: '00000000002',
      hunkIds: [first, changed],
      label: 'Ignored label because carry-over keeps the old one',
    });
    expect(summary.unchangedIds).toEqual([first]);
    expect(summary.newOrChangedIds).toEqual([changed]);
    expect(summary.goneIds).toEqual([second]);
    expect(summary.goneCount).toBe(1);
    expect(summary.goneRejected).toBe(1);
    expect(summary.state.round).toBe(2);
    expect(summary.state.label).toBe('Review label');
    expect(summary.state.overallNote).toBe('');
    expect(summary.state.hunks[first]?.decision).toBe('approved');
  });

  it('RV-GONE-PENDING does not count an undecided disappeared hunk as gone', () => {
    const previous = createReviewState('00000000001', [first, second]);
    const summary = carryOverSummary(previous, { fingerprint: '00000000002', hunkIds: [first] });
    expect(summary.goneCount).toBe(0);
    expect(summary.goneIds).toEqual([]);
  });

  it('treats duplicate ids and zero matches deterministically', () => {
    let previous = createReviewState('00000000001', [first, first]);
    previous = reviewReducer(previous, { type: 'decide', id: first, decision: 'rejected' });
    const summary = carryOverSummary(previous, {
      fingerprint: '00000000002',
      hunkIds: [changed, changed],
    });
    expect(summary.state.hunkIds).toEqual([changed]);
    expect(summary.unchangedIds).toEqual([]);
    expect(summary.newOrChangedIds).toEqual([changed]);
    expect(summary.goneRejected).toBe(1);
    const fresh = startNewReview(previous, '00000000002', [changed], 'New review');
    expect(fresh.round).toBe(1);
    expect(Object.keys(fresh.hunks)).toHaveLength(0);
    expect(carryOver(previous, '00000000002', [first, second]).round).toBe(2);
  });
});
