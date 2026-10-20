import { carryOverSummary, type CarryOverSummary } from '../core/review/carryover';
import type { ReviewState } from '../core/types';
import type { ReviewStorageAdapter } from '../storage/adapter';
import { stateFromStored, type OpenDiffValue } from './open';

/** The newest stored reviews that may lend their decisions to a new diff. */
export const CARRY_SOURCES = 5;

/**
 * What a successfully parsed diff means for the review that is open (or the stored ones):
 * nothing to do, open it straight away, or ask first because something would be left behind.
 */
export type LoadPlan =
  | { readonly kind: 'same-open' }
  | { readonly kind: 'open'; readonly opened: OpenDiffValue; readonly dismissed: boolean }
  /** The diff was reviewed before while another review with decisions is open. */
  | {
      readonly kind: 'restore';
      readonly opened: OpenDiffValue;
      readonly openDecisions: number;
      readonly dismissed: boolean;
    }
  /** The user picks round N+1 or a fresh start; with nothing to carry only the fresh start. */
  | {
      readonly kind: 'carry';
      readonly opened: OpenDiffValue;
      readonly previous: ReviewState;
      readonly summary: CarryOverSummary;
    };

/** A load that waits for the user's answer before anything on screen changes. */
export type PendingLoad = Extract<LoadPlan, { readonly kind: 'restore' | 'carry' }>;

/** What the user can answer: carry the decisions over, start fresh, or restore a saved review. */
export type PendingChoice = 'carry-over' | 'new' | 'restore';

export type PlanDeps = {
  readonly current: ReviewState | null;
  readonly adapter: ReviewStorageAdapter;
};

export function decidedCount(state: ReviewState): number {
  return Object.values(state.hunks).filter((review) => review.decision !== null).length;
}

function hasWork(state: ReviewState): boolean {
  return Object.values(state.hunks).some(
    (review) => review.decision !== null || review.comment !== '',
  );
}

/** Whether the banner was dismissed, which the open-diff result does not carry. */
export function readDismissed(adapter: ReviewStorageAdapter, fingerprint: string): boolean {
  const stored = adapter.getReview(fingerprint);
  return stored.ok && stored.value?.carryoverDismissed === true;
}

function recentStored(
  adapter: ReviewStorageAdapter,
  skip: readonly string[],
): readonly ReviewState[] {
  const listed = adapter.listReviews();
  if (!listed.ok) {
    return [];
  }
  return [...listed.value]
    .filter((record) => !skip.includes(record.fingerprint))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, CARRY_SOURCES)
    .map((record) => stateFromStored(record, record.hunkIds));
}

function carryFrom(opened: OpenDiffValue, previous: ReviewState): CarryOverSummary {
  return carryOverSummary(previous, {
    fingerprint: opened.parsed.fingerprint,
    hunkIds: opened.state.hunkIds,
    label: opened.state.label,
  });
}

/** The open review first, then the newest stored ones; the first with a carried hunk wins. */
function findCarry(
  opened: OpenDiffValue,
  deps: PlanDeps,
): { readonly previous: ReviewState; readonly summary: CarryOverSummary } | null {
  const { current, adapter } = deps;
  const skip = [opened.parsed.fingerprint, ...(current === null ? [] : [current.fingerprint])];
  const sources = [...(current === null ? [] : [current]), ...recentStored(adapter, skip)];
  for (const previous of sources) {
    const summary = carryFrom(opened, previous);
    if (summary.carriedIds.length > 0) {
      return { previous, summary };
    }
  }
  return null;
}

function planRestored(opened: OpenDiffValue, deps: PlanDeps): LoadPlan {
  const dismissed = readDismissed(deps.adapter, opened.parsed.fingerprint);
  const openDecisions = deps.current === null ? 0 : decidedCount(deps.current);
  return openDecisions > 0
    ? { kind: 'restore', opened, openDecisions, dismissed }
    : { kind: 'open', opened, dismissed };
}

export function planLoad(opened: OpenDiffValue, deps: PlanDeps): LoadPlan {
  if (opened.outcome === 'same-open') {
    return { kind: 'same-open' };
  }
  if (opened.outcome === 'restored') {
    return planRestored(opened, deps);
  }
  const found = findCarry(opened, deps);
  if (found !== null) {
    return { kind: 'carry', opened, ...found };
  }
  // No hunk of the new diff appeared before, yet the open review has work in it: say what the
  // new diff leaves behind. Shared hunks that hold no decision carry nothing and need no question.
  if (deps.current !== null && hasWork(deps.current)) {
    const summary = carryFrom(opened, deps.current);
    if (summary.unchangedIds.length === 0) {
      return { kind: 'carry', opened, previous: deps.current, summary };
    }
  }
  return { kind: 'open', opened, dismissed: false };
}
