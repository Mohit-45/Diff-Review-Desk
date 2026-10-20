import type { ReviewState } from '../core/types';

/** The numbers behind every carry-over sentence, badge and filter. All derived, never stored. */
export type CarryFacts = {
  /** The round this review is in. */
  readonly round: number;
  /** The round the carried decisions came from. */
  readonly priorRound: number;
  /** Hunks whose id also appeared in the previous round. */
  readonly unchanged: number;
  readonly total: number;
  /** Decisions that came across, split by kind. */
  readonly approved: number;
  readonly rejected: number;
  readonly newOrChanged: number;
  readonly gone: number;
  readonly goneRejected: number;
};

export type CarryBadge =
  | { readonly kind: 'new-or-changed' }
  | {
      readonly kind: 'unchanged';
      readonly carried: 'approved' | 'rejected' | 'pending';
      readonly round: number;
    };

/** Null in round 1 and after an undone carry-over, when there is no previous round to talk about. */
export function carryFactsOf(state: ReviewState): CarryFacts | null {
  const { prior } = state;
  if (prior === null) {
    return null;
  }
  const known = new Set(state.hunkIds);
  const unchanged = prior.unchangedIds.filter((id) => known.has(id)).length;
  const decisions = Object.values(prior.carried);
  return {
    round: state.round,
    priorRound: prior.round,
    unchanged,
    total: state.hunkIds.length,
    approved: decisions.filter((decision) => decision === 'approved').length,
    rejected: decisions.filter((decision) => decision === 'rejected').length,
    newOrChanged: state.hunkIds.length - unchanged,
    gone: prior.goneCount,
    goneRejected: prior.goneRejected,
  };
}

/** Ids outside the previous round's hunks, in document order. Empty in round 1. */
export function newOrChangedIdsOf(state: ReviewState): readonly string[] {
  if (state.prior === null) {
    return [];
  }
  const unchanged = new Set(state.prior.unchangedIds);
  return state.hunkIds.filter((id) => !unchanged.has(id));
}

/** One pass over the prior, so a screen of hundreds of cards does not rescan it per card. */
export function carryBadgeIndex(state: ReviewState): (hunkId: string) => CarryBadge | null {
  const { prior } = state;
  if (prior === null) {
    return () => null;
  }
  const unchanged = new Set(prior.unchangedIds);
  const known = new Set(state.hunkIds);
  return (hunkId) => {
    if (!known.has(hunkId)) {
      return null;
    }
    if (!unchanged.has(hunkId)) {
      return { kind: 'new-or-changed' };
    }
    const carried = Object.hasOwn(prior.carried, hunkId) ? prior.carried[hunkId] : undefined;
    return { kind: 'unchanged', carried: carried ?? 'pending', round: prior.round };
  };
}
