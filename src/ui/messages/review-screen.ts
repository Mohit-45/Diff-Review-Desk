import type { Command, HunkReview } from '../../core/types';

/** Live-region and panel copy for the review screen. Numbers only, never diff text. */
export const reviewMessages = {
  lastHunk: 'Last hunk',
  firstHunk: 'First hunk',
  lastFile: 'Last file',
  firstFile: 'First file',
  onlyPending: 'This is the only pending hunk.',
  noMatches: 'No hunks match the current filters.',
  nothingToUndo: 'Nothing to undo.',
  nothingToRedo: 'Nothing to redo.',
  noDecisionToClear: 'This hunk has no decision to clear.',
  clearFilters: 'Clear filters',
  exportReview: 'Export review',
  skipToFiles: 'Skip to changed files',
  skipToDiff: 'Skip to diff',
} as const;

export function pendingMoved(number: number, total: number, wrapped: boolean): string {
  const place = `pending hunk ${String(number)} of ${String(total)}.`;
  return wrapped ? `Wrapped to ${place}` : `Moved to ${place}`;
}

export function noPending(total: number): string {
  return `No pending hunks. All ${String(total)} hunks are decided.`;
}

export function hiddenPending(count: number): string {
  return count === 1
    ? '1 pending hunk is hidden by the current filters.'
    : `${String(count)} pending hunks are hidden by the current filters.`;
}

export function allDecided(total: number): string {
  return `All ${String(total)} hunks decided`;
}

export function decisionMessage(
  number: number,
  decision: HunkReview['decision'],
  pending: number,
  total: number,
): string {
  const verb = decision ?? 'cleared';
  const tail = pending === 0 ? `${allDecided(total)}.` : `${String(pending)} pending.`;
  return `Hunk ${String(number)} ${verb}. ${tail}`;
}

export function historyMessage(
  kind: Extract<Command, 'undo' | 'redo'>,
  number: number | null,
  decision: HunkReview['decision'],
): string {
  const verb = kind === 'undo' ? 'Undid' : 'Redid';
  if (number === null) {
    return `${verb} the last change.`;
  }
  return `${verb} a change to hunk ${String(number)}. It is now ${decision ?? 'pending'}.`;
}
