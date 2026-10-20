import type { HunkReview, ReviewState } from '../types';
import { createReviewState } from './reducer';

export type CarryOverSummary = {
  readonly state: ReviewState;
  readonly unchangedIds: readonly string[];
  readonly carriedIds: readonly string[];
  readonly carried: Readonly<Record<string, 'approved' | 'rejected'>>;
  readonly newOrChangedIds: readonly string[];
  readonly goneIds: readonly string[];
  readonly goneCount: number;
  readonly goneRejected: number;
};

export type CarryOverTarget = {
  readonly fingerprint: string;
  readonly hunkIds: readonly string[];
  readonly label?: string;
};

function uniqueIds(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function targetFrom(
  target: ReviewState | CarryOverTarget | readonly string[] | string,
  hunkIds?: readonly string[],
  label?: string,
): CarryOverTarget {
  if (typeof target === 'string') {
    return { fingerprint: target, hunkIds: hunkIds ?? [], label };
  }
  if (Array.isArray(target)) {
    return { fingerprint: '', hunkIds: target, label };
  }
  if (!('fingerprint' in target) || !('hunkIds' in target)) {
    return { fingerprint: '', hunkIds: [], label };
  }
  return {
    fingerprint: target.fingerprint,
    hunkIds: target.hunkIds,
    label: 'label' in target ? target.label : label,
  };
}

function reviewFor(state: ReviewState, id: string): HunkReview | undefined {
  return Object.hasOwn(state.hunks, id) ? state.hunks[id] : undefined;
}

function carrySummary(previous: ReviewState, target: CarryOverTarget): CarryOverSummary {
  const nextIds = uniqueIds(target.hunkIds);
  const previousIds = uniqueIds(previous.hunkIds);
  const previousSet = new Set(previousIds);
  const nextSet = new Set(nextIds);
  const unchangedIds = nextIds.filter((id) => previousSet.has(id));
  const newOrChangedIds = nextIds.filter((id) => !previousSet.has(id));
  const goneIds = previousIds.filter(
    (id) =>
      !nextSet.has(id) &&
      reviewFor(previous, id)?.decision !== null &&
      reviewFor(previous, id) !== undefined,
  );
  const carriedIds: string[] = [];
  const carried = Object.create(null) as Record<string, 'approved' | 'rejected'>;
  const hunks = Object.create(null) as Record<string, HunkReview>;
  for (const id of unchangedIds) {
    const review = reviewFor(previous, id);
    if (review === undefined || (review.decision === null && review.comment === '')) {
      continue;
    }
    carriedIds.push(id);
    hunks[id] = { decision: review.decision, comment: review.comment };
    if (review.decision !== null) {
      carried[id] = review.decision;
    }
  }
  let goneRejected = 0;
  for (const id of goneIds) {
    if (reviewFor(previous, id)?.decision === 'rejected') {
      goneRejected += 1;
    }
  }
  const prior: ReviewState['prior'] = {
    round: previous.round,
    unchangedIds,
    carried,
    goneCount: goneIds.length,
    goneRejected,
  };
  const state: ReviewState = {
    fingerprint: target.fingerprint,
    round: previous.round + 1,
    label: previous.label,
    overallNote: '',
    hunks,
    hunkIds: nextIds,
    prior,
  };
  return {
    state,
    unchangedIds,
    carriedIds,
    carried,
    newOrChangedIds,
    goneIds,
    goneCount: goneIds.length,
    goneRejected,
  };
}

export function carryOverSummary(
  previous: ReviewState,
  target: ReviewState | CarryOverTarget | readonly string[] | string,
  hunkIds?: readonly string[],
  label?: string,
): CarryOverSummary {
  return carrySummary(previous, targetFrom(target, hunkIds, label));
}

/** Creates the next round while preserving only byte-identical hunk ids. */
export function carryOver(
  previous: ReviewState,
  target: ReviewState | CarryOverTarget | readonly string[] | string,
  hunkIds?: readonly string[],
  label?: string,
): ReviewState {
  return carryOverSummary(previous, target, hunkIds, label).state;
}

export const carryOverState = carryOver;

export function startNewReview(
  previous: ReviewState,
  fingerprint: string,
  hunkIds: readonly string[],
  label = previous.label,
): ReviewState {
  return createReviewState(fingerprint, uniqueIds(hunkIds), label, 1);
}
