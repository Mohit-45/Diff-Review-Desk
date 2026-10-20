import { describe, expect, it } from 'vitest';
import { createReviewState } from '../core/review/reducer';
import { carryBadgeIndex, carryFactsOf, newOrChangedIdsOf } from './carryFacts';
import { roundTwoSummary } from './carryFixtures';

describe('carryFactsOf', () => {
  it('CARRY-FACTS derives the pinned round 2 numbers from the prior alone', () => {
    const facts = carryFactsOf(roundTwoSummary().state);
    expect(facts).toEqual({
      round: 2,
      priorRound: 1,
      unchanged: 6,
      total: 9,
      approved: 5,
      rejected: 1,
      newOrChanged: 3,
      gone: 5,
      goneRejected: 4,
    });
  });

  it('CARRY-FACTS is null in round 1, where there is no previous round', () => {
    expect(carryFactsOf(createReviewState('fp', ['f1:a'], 'x'))).toBeNull();
  });

  it('CARRY-FACTS ignores prior ids the diff no longer has', () => {
    const { state } = roundTwoSummary();
    const trimmed = { ...state, hunkIds: state.hunkIds.slice(0, 2) };
    const facts = carryFactsOf(trimmed);
    expect(facts?.unchanged).toBe(2);
    expect(facts?.newOrChanged).toBe(0);
  });
});

describe('newOrChangedIdsOf', () => {
  it('CARRY-NEW lists the three hunks outside the previous round in document order', () => {
    const summary = roundTwoSummary();
    expect(newOrChangedIdsOf(summary.state)).toEqual(summary.newOrChangedIds);
    expect(newOrChangedIdsOf(summary.state)).toHaveLength(3);
  });

  it('CARRY-NEW is empty in round 1', () => {
    expect(newOrChangedIdsOf(createReviewState('fp', ['f1:a'], 'x'))).toEqual([]);
  });
});

describe('carryBadgeIndex', () => {
  it('CARRY-BADGE tells approved, rejected, pending and new hunks apart', () => {
    const summary = roundTwoSummary();
    const badgeFor = carryBadgeIndex(summary.state);
    const kinds = summary.state.hunkIds.map((id) => badgeFor(id));
    expect(kinds.filter((badge) => badge?.kind === 'new-or-changed')).toHaveLength(3);
    expect(
      kinds.filter((badge) => badge?.kind === 'unchanged' && badge.carried === 'approved'),
    ).toHaveLength(5);
    expect(
      kinds.filter((badge) => badge?.kind === 'unchanged' && badge.carried === 'rejected'),
    ).toHaveLength(1);
    expect(
      kinds.every(
        (badge) => badge === null || badge.kind === 'new-or-changed' || badge.round === 1,
      ),
    ).toBe(true);
  });

  it('CARRY-BADGE calls an unchanged hunk without a decision still pending', () => {
    const { state } = roundTwoSummary();
    const [first] = state.hunkIds;
    if (first === undefined) throw new Error('No hunk.');
    const noDecision = { ...state, prior: state.prior && { ...state.prior, carried: {} } };
    expect(carryBadgeIndex(noDecision)(first)).toEqual({
      kind: 'unchanged',
      carried: 'pending',
      round: 1,
    });
  });

  it('CARRY-BADGE gives round 1 and unknown ids no badge', () => {
    expect(carryBadgeIndex(createReviewState('fp', ['f1:a'], 'x'))('f1:a')).toBeNull();
    expect(carryBadgeIndex(roundTwoSummary().state)('f9:zzz')).toBeNull();
  });
});
