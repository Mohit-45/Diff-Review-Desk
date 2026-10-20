import type { DiffFile, Flag, Hunk, ReviewState } from '../core/types';
import { selectDecision, selectHunkReview } from '../core/review/selectors';
import { createFilterContext, hunkMatchesFilters, type ReviewFilters } from './components/Filters';

/** One hunk in document order, with the 1-based number the cards show. */
export type Entry = {
  readonly file: DiffFile;
  readonly hunk: Hunk;
  readonly number: number;
};

export type ReviewView = {
  /** Every hunk, whatever the filters say. */
  readonly entries: readonly Entry[];
  /** Hunks that pass the filters. */
  readonly matching: readonly Entry[];
  /** What main renders: matching hunks plus the current one, pinned so it never vanishes. */
  readonly visible: readonly Entry[];
};

export type Step = 1 | -1;

export function buildEntries(files: readonly DiffFile[]): readonly Entry[] {
  const entries: Entry[] = [];
  for (const file of files) {
    for (const hunk of file.hunks) {
      entries.push({ file, hunk, number: entries.length + 1 });
    }
  }
  return entries;
}

export function buildView(
  entries: readonly Entry[],
  filters: ReviewFilters,
  review: { readonly state: ReviewState; readonly flags: readonly Flag[] },
  currentId: string | null,
): ReviewView {
  const context = createFilterContext(review.state, review.flags);
  const matching = entries.filter((entry) =>
    hunkMatchesFilters(entry.file, entry.hunk, filters, context),
  );
  const matchingIds = new Set(matching.map((entry) => entry.hunk.id));
  const visible = entries.filter(
    (entry) => matchingIds.has(entry.hunk.id) || entry.hunk.id === currentId,
  );
  return { entries, matching, visible };
}

export function isPending(state: ReviewState, entry: Entry): boolean {
  return selectDecision(state, entry.hunk.id) === null;
}

export function pendingCount(entries: readonly Entry[], state: ReviewState): number {
  return entries.filter((entry) => isPending(state, entry)).length;
}

export function firstPending(entries: readonly Entry[], state: ReviewState): Entry | undefined {
  return entries.find((entry) => isPending(state, entry));
}

export function findEntry(entries: readonly Entry[], id: string | null): Entry | undefined {
  return id === null ? undefined : entries.find((entry) => entry.hunk.id === id);
}

/** The neighbour in the list, or null at either end. No wrapping. */
export function stepHunk(
  list: readonly Entry[],
  currentId: string | null,
  step: Step,
): Entry | null {
  const index = list.findIndex((entry) => entry.hunk.id === currentId);
  if (index === -1) {
    return (step === 1 ? list[0] : list[list.length - 1]) ?? null;
  }
  return list[index + step] ?? null;
}

export type PendingStep = { readonly entry: Entry; readonly wrapped: boolean };

/**
 * The next pending hunk in a direction, wrapping around the list. The current hunk is
 * the last candidate, so it comes back only when nothing else is pending.
 */
export function stepPending(
  list: readonly Entry[],
  state: ReviewState,
  currentId: string | null,
  step: Step,
): PendingStep | null {
  const size = list.length;
  const index = list.findIndex((entry) => entry.hunk.id === currentId);
  const origin = index === -1 ? (step === 1 ? -1 : size) : index;
  for (let offset = 1; offset <= size; offset += 1) {
    const raw = origin + step * offset;
    const entry = list[((raw % size) + size) % size];
    if (entry !== undefined && isPending(state, entry)) {
      return { entry, wrapped: raw < 0 || raw >= size };
    }
  }
  return null;
}

/** The first hunk of the next or previous file in the list, or null at either end. */
export function stepFile(
  list: readonly Entry[],
  currentId: string | null,
  step: Step,
): Entry | null {
  const index = list.findIndex((entry) => entry.hunk.id === currentId);
  const current = list[index];
  if (current === undefined) {
    return null;
  }
  if (step === 1) {
    return list.slice(index + 1).find((entry) => entry.file.id !== current.file.id) ?? null;
  }
  const earlier = list.slice(0, index).filter((entry) => entry.file.id !== current.file.id);
  const previous = earlier[earlier.length - 1];
  return previous === undefined
    ? null
    : (list.find((entry) => entry.file.id === previous.file.id) ?? null);
}

/** The first hunk whose decision or comment differs, so undo and redo can focus it. */
export function changedEntry(
  entries: readonly Entry[],
  before: ReviewState,
  after: ReviewState,
): Entry | null {
  return (
    entries.find((entry) => {
      const left = selectHunkReview(before, entry.hunk.id);
      const right = selectHunkReview(after, entry.hunk.id);
      return left.decision !== right.decision || left.comment !== right.comment;
    }) ?? null
  );
}
