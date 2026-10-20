import type { DiffFile, Hunk, ReviewState } from '../types';

export type ReviewVerdict = 'Changes requested' | 'In progress' | 'Approved';

export type ReviewStats = {
  readonly total: number;
  readonly reviewed: number;
  readonly approved: number;
  readonly rejected: number;
  readonly pending: number;
  readonly percent: number;
  readonly verdict: ReviewVerdict;
};

export type ReviewProgress = {
  readonly total: number;
  readonly reviewed: number;
  readonly percent: number;
};

export type HunkSource = readonly Hunk[] | readonly DiffFile[];

function isReviewState(value: HunkSource | ReviewState): value is ReviewState {
  return !Array.isArray(value) && typeof value === 'object' && 'hunkIds' in value;
}

export function flattenHunks(source: HunkSource): readonly Hunk[] {
  if (source.length === 0) {
    return [];
  }
  const first = source[0];
  if (first !== undefined && 'hunks' in first) {
    const files = source as readonly DiffFile[];
    const hunks: Hunk[] = [];
    for (const file of files) {
      hunks.push(...file.hunks);
    }
    return hunks;
  }
  return source as readonly Hunk[];
}

function resolveInputs(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): { readonly source: HunkSource; readonly state: ReviewState } {
  if (isReviewState(first)) {
    return { source: second as HunkSource, state: first };
  }
  return { source: first, state: second as ReviewState };
}

function reviewFor(state: ReviewState, id: string) {
  return Object.hasOwn(state.hunks, id) ? state.hunks[id] : undefined;
}

export function selectDecision(state: ReviewState, id: string): 'approved' | 'rejected' | null {
  return reviewFor(state, id)?.decision ?? null;
}

export function selectComment(state: ReviewState, id: string): string {
  return reviewFor(state, id)?.comment ?? '';
}

export function selectReviewed(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): number {
  const { source, state } = resolveInputs(first, second);
  let count = 0;
  for (const hunk of flattenHunks(source)) {
    const review = reviewFor(state, hunk.id);
    if (review !== undefined && review.decision !== null) {
      count += 1;
    }
  }
  return count;
}

export function selectApproved(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): number {
  const { source, state } = resolveInputs(first, second);
  let count = 0;
  for (const hunk of flattenHunks(source)) {
    if (reviewFor(state, hunk.id)?.decision === 'approved') {
      count += 1;
    }
  }
  return count;
}

export function selectRejected(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): number {
  const { source, state } = resolveInputs(first, second);
  let count = 0;
  for (const hunk of flattenHunks(source)) {
    if (reviewFor(state, hunk.id)?.decision === 'rejected') {
      count += 1;
    }
  }
  return count;
}

export function selectPending(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): number {
  const hunks = flattenHunks(resolveInputs(first, second).source);
  const { state } = resolveInputs(first, second);
  let count = 0;
  for (const hunk of hunks) {
    const review = reviewFor(state, hunk.id);
    if (review === undefined || review.decision === null) {
      count += 1;
    }
  }
  return count;
}

export function selectPercent(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): number {
  const source = resolveInputs(first, second).source;
  const total = flattenHunks(source).length;
  return total === 0 ? 0 : Math.floor((selectReviewed(first, second) * 100) / total);
}

export function selectVerdict(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): ReviewVerdict {
  const { source, state } = resolveInputs(first, second);
  const hunks = flattenHunks(source);
  let hasRejected = false;
  let hasPending = false;
  for (const hunk of hunks) {
    const decision = reviewFor(state, hunk.id)?.decision ?? null;
    if (decision === 'rejected') {
      hasRejected = true;
    } else if (decision === null) {
      hasPending = true;
    }
  }
  if (hasRejected) {
    return 'Changes requested';
  }
  return hasPending ? 'In progress' : 'Approved';
}

export function selectReviewStats(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): ReviewStats {
  const { source } = resolveInputs(first, second);
  const total = flattenHunks(source).length;
  const reviewed = selectReviewed(first, second);
  const approved = selectApproved(first, second);
  const rejected = selectRejected(first, second);
  const pending = total - reviewed;
  return {
    total,
    reviewed,
    approved,
    rejected,
    pending,
    percent: total === 0 ? 0 : Math.floor((reviewed * 100) / total),
    verdict: selectVerdict(first, second),
  };
}

export const selectStats = selectReviewStats;
export const reviewStats = selectReviewStats;
export const getReviewStats = selectReviewStats;
export const getReviewed = selectReviewed;
export const getPending = selectPending;
export const getPercent = selectPercent;
export const getVerdict = selectVerdict;
export const reviewed = selectReviewed;
export const pending = selectPending;
export const approved = selectApproved;
export const rejected = selectRejected;
export const percent = selectPercent;
export const verdict = selectVerdict;
export const getHunkReview = selectHunkReview;

export function selectProgress(
  first: HunkSource | ReviewState,
  second: HunkSource | ReviewState,
): ReviewProgress {
  const { source } = resolveInputs(first, second);
  const total = flattenHunks(source).length;
  const reviewed = selectReviewed(first, second);
  return { total, reviewed, percent: total === 0 ? 0 : Math.floor((reviewed * 100) / total) };
}

export function selectHunkReview(state: ReviewState, hunkId: string) {
  return reviewFor(state, hunkId) ?? { decision: null, comment: '' };
}
