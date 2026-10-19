import type { ReviewState } from '../types';
import { reviewReducer, type ReviewAction } from './reducer';

export const HISTORY_CAP = 100;

export type HistoryState<T> = {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
};

export type HistoryAction = ReviewAction | { readonly type: 'undo' } | { readonly type: 'redo' };

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

function appendWithCap<T>(items: readonly T[], value: T): readonly T[] {
  const appended = [...items, value];
  return appended.length > HISTORY_CAP ? appended.slice(appended.length - HISTORY_CAP) : appended;
}

export function applyHistory<T, A>(
  history: HistoryState<T>,
  action: A,
  reducer: (state: T, action: A) => T,
): HistoryState<T> {
  const next = reducer(history.present, action);
  if (Object.is(next, history.present)) {
    return history;
  }
  return {
    past: appendWithCap(history.past, history.present),
    present: next,
    future: [],
  };
}

export function undo<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0];
  if (next === undefined) {
    return history;
  }
  return {
    past: appendWithCap(history.past, history.present),
    present: next,
    future: history.future.slice(1),
  };
}

export const undoReview = undo;
export const redoReview = redo;

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}

export type ReviewHistory = HistoryState<ReviewState>;

export function createReviewHistory(initial: ReviewState): ReviewHistory {
  return createHistory(initial);
}

export function reviewHistoryReducer(history: ReviewHistory, action: HistoryAction): ReviewHistory {
  if (action.type === 'undo') {
    return undo(history);
  }
  if (action.type === 'redo') {
    return redo(history);
  }
  return applyHistory(history, action, reviewReducer);
}

export const historyReducer = reviewHistoryReducer;
export const reduceReviewHistory = reviewHistoryReducer;
