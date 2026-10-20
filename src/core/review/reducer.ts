import { LIMITS } from '../limits';
import type { HunkReview, ReviewState } from '../types';

export type ReviewAction =
  | {
      readonly type: 'decide';
      readonly id: string;
      readonly decision: 'approved' | 'rejected';
    }
  | { readonly type: 'clear'; readonly id: string }
  | { readonly type: 'setComment'; readonly id: string; readonly comment: string }
  | { readonly type: 'setOverallNote'; readonly note: string }
  | { readonly type: 'hydrate'; readonly state: ReviewState }
  | { readonly type: 'reset' };

function emptyHunks(): Record<string, HunkReview> {
  return Object.create(null) as Record<string, HunkReview>;
}

function isKnownHunk(state: ReviewState, id: string): boolean {
  return state.hunkIds.includes(id);
}

function isEmptyComment(comment: string): boolean {
  return /^\s*$/u.test(comment);
}

/** Truncates by Unicode code points, so a surrogate pair is never split. */
export function truncateCodePoints(value: string, maximum: number): string {
  if (maximum < 1 || value.length === 0) {
    return maximum < 1 ? '' : value;
  }
  const points = Array.from(value);
  return points.length <= maximum ? value : points.slice(0, maximum).join('');
}

function normalizeComment(comment: string): string {
  if (isEmptyComment(comment)) {
    return '';
  }
  return truncateCodePoints(comment, LIMITS.maxCommentChars);
}

function normalizeOverallNote(note: string): string {
  return truncateCodePoints(note, LIMITS.maxOverallNoteChars);
}

function reviewEquals(left: HunkReview | undefined, right: HunkReview | undefined): boolean {
  return left?.decision === right?.decision && left?.comment === right?.comment;
}

function copyHunksForIds(
  source: Readonly<Record<string, HunkReview>>,
  ids: readonly string[],
): Record<string, HunkReview> {
  const result = emptyHunks();
  for (const id of ids) {
    if (!Object.hasOwn(source, id)) {
      continue;
    }
    const review = source[id];
    if (review === undefined || (review.decision === null && review.comment === '')) {
      continue;
    }
    result[id] = { decision: review.decision, comment: review.comment };
  }
  return result;
}

function hunkMapsEqual(
  left: Readonly<Record<string, HunkReview>>,
  right: Readonly<Record<string, HunkReview>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const id of leftKeys) {
    if (!Object.hasOwn(right, id) || !reviewEquals(left[id], right[id])) {
      return false;
    }
  }
  return true;
}

function sanitizePrior(
  prior: ReviewState['prior'],
  hunkIds: readonly string[],
): ReviewState['prior'] {
  if (prior === null) {
    return null;
  }
  const known = new Set(hunkIds);
  const unchangedIds = prior.unchangedIds.filter((id) => known.has(id));
  const unchanged = new Set(unchangedIds);
  const carried = Object.create(null) as Record<string, 'approved' | 'rejected'>;
  let carriedChanged = false;
  for (const id of Object.keys(prior.carried)) {
    const decision = prior.carried[id];
    if (decision !== undefined && known.has(id) && unchanged.has(id)) {
      carried[id] = decision;
    } else {
      carriedChanged = true;
    }
  }
  if (!carriedChanged && unchangedIds.length === prior.unchangedIds.length) {
    return prior;
  }
  return { ...prior, unchangedIds, carried };
}

function resetState(state: ReviewState): ReviewState {
  if (
    state.round === 1 &&
    state.overallNote === '' &&
    state.prior === null &&
    Object.keys(state.hunks).length === 0
  ) {
    return state;
  }
  return {
    fingerprint: state.fingerprint,
    round: 1,
    label: state.label,
    overallNote: '',
    hunks: emptyHunks(),
    hunkIds: state.hunkIds,
    prior: null,
  };
}

function hydrateState(current: ReviewState, incoming: ReviewState): ReviewState {
  const hunkIds = current.hunkIds;
  const hunks = copyHunksForIds(incoming.hunks, hunkIds);
  const fingerprint = incoming.fingerprint;
  const round = incoming.round;
  const label = incoming.label;
  const overallNote = normalizeOverallNote(incoming.overallNote);
  const prior = sanitizePrior(incoming.prior, hunkIds);
  if (
    current.fingerprint === fingerprint &&
    current.round === round &&
    current.label === label &&
    current.overallNote === overallNote &&
    current.hunkIds === hunkIds &&
    current.prior === prior &&
    hunkMapsEqual(current.hunks, hunks)
  ) {
    return current;
  }
  return { fingerprint, round, label, overallNote, hunks, hunkIds, prior };
}

export function createReviewState(
  fingerprint: string,
  hunkIds: readonly string[],
  label = '',
  round = 1,
): ReviewState {
  return {
    fingerprint,
    round,
    label: truncateCodePoints(label, 80),
    overallNote: '',
    hunks: emptyHunks(),
    hunkIds,
    prior: null,
  };
}

export const initialReviewState = createReviewState;

function withoutHunk(
  hunks: Readonly<Record<string, HunkReview>>,
  id: string,
): Record<string, HunkReview> {
  return Object.fromEntries(Object.entries(hunks).filter(([key]) => key !== id));
}

function decide(state: ReviewState, id: string, decision: 'approved' | 'rejected'): ReviewState {
  if (!isKnownHunk(state, id)) {
    return state;
  }
  const existing = Object.hasOwn(state.hunks, id) ? state.hunks[id] : undefined;
  if (existing?.decision === decision) {
    return state;
  }
  const hunks = { ...state.hunks } as Record<string, HunkReview>;
  hunks[id] = { decision, comment: existing?.comment ?? '' };
  return { ...state, hunks };
}

function clearDecision(state: ReviewState, id: string): ReviewState {
  if (!isKnownHunk(state, id) || !Object.hasOwn(state.hunks, id)) {
    return state;
  }
  const existing = state.hunks[id];
  if (existing === undefined || existing.decision === null) {
    return state;
  }
  if (existing.comment === '') {
    return { ...state, hunks: withoutHunk(state.hunks, id) };
  }
  const hunks = { ...state.hunks } as Record<string, HunkReview>;
  hunks[id] = { decision: null, comment: existing.comment };
  return { ...state, hunks };
}

function setComment(state: ReviewState, id: string, rawComment: string): ReviewState {
  if (!isKnownHunk(state, id)) {
    return state;
  }
  const comment = normalizeComment(rawComment);
  const existing = Object.hasOwn(state.hunks, id) ? state.hunks[id] : undefined;
  if (existing?.comment === comment) {
    return state;
  }
  const hunks = { ...state.hunks } as Record<string, HunkReview>;
  hunks[id] = { decision: existing?.decision ?? null, comment };
  return { ...state, hunks };
}

function setOverallNote(state: ReviewState, rawNote: string): ReviewState {
  const note = normalizeOverallNote(rawNote);
  return note === state.overallNote ? state : { ...state, overallNote: note };
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'decide':
      return decide(state, action.id, action.decision);
    case 'clear':
      return clearDecision(state, action.id);
    case 'setComment':
      return setComment(state, action.id, action.comment);
    case 'setOverallNote':
      return setOverallNote(state, action.note);
    case 'hydrate':
      return hydrateState(state, action.state);
    case 'reset':
      return resetState(state);
  }
}

export const reduceReview = reviewReducer;
