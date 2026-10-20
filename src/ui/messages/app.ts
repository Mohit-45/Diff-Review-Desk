import type { ParseError } from '../../core/types';

/** Status-line and live-region copy for loading, restoring and saving. Numbers only, never diff text. */
export const appMessages = {
  reading: 'Reading diff…',
  alreadyOpen: 'Nothing to load. This diff is already open.',
  cleared: 'All saved data was cleared.',
  clearFailed: 'Saved data could not be cleared.',
  saved: 'Saved',
  saving: 'Saving',
  notSaved: 'Not saved',
} as const;

export function restoredReview(decided: number, total: number): string {
  return `Restored review: ${String(decided)} of ${String(total)} hunks decided.`;
}

export function loadedDiff(files: number, hunks: number): string {
  return `Loaded ${String(files)} files, ${String(hunks)} hunks.`;
}

export function loadedWithDecisions(files: number, hunks: number, decided: number): string {
  const noun = decided === 1 ? 'decision' : 'decisions';
  return `${loadedDiff(files, hunks)} Restored ${String(decided)} saved ${noun}.`;
}

export const LOAD_FAILED: ParseError = {
  code: 'internal',
  title: 'Could not load that diff',
  detail: 'The diff could not be read or parsed.',
  hint: 'generic',
  suggestion: 'Paste the diff text instead, or choose another file.',
};
