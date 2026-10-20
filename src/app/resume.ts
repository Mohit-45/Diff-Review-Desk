import { parseDiff } from '../core/parser/parse';
import type { DiffFile, ParseWarning, ReviewState, StoredReview } from '../core/types';
import type { ReviewStorageAdapter } from '../storage/adapter';
import { openDiff, restoreReview } from './open';
import { memoizeParser } from './openStored';

export type ResumeResult =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'review';
      readonly files: readonly DiffFile[];
      readonly state: ReviewState;
      readonly diffText: string;
      readonly warnings: readonly ParseWarning[];
    }
  /** Decisions are stored but the diff text is not, so the user must bring the diff back. */
  | { readonly kind: 'decisions-only'; readonly notice: string };

const NONE: ResumeResult = { kind: 'none' };

/**
 * A built-in sample never needs to rest in storage: its text ships with the app, so a stored
 * review whose fingerprint matches one comes back even when the diff text was withheld.
 */
function fromBundledText(
  fingerprint: string,
  record: StoredReview,
  texts: readonly string[],
): ResumeResult {
  const parser = memoizeParser(parseDiff);
  for (const text of texts) {
    const opened = openDiff(text, { parser, stored: record });
    if (opened.ok && opened.value.parsed.fingerprint === fingerprint) {
      return {
        kind: 'review',
        files: opened.value.parsed.files,
        state: opened.value.state,
        diffText: text,
        warnings: opened.value.parsed.warnings,
      };
    }
  }
  return NONE;
}

/**
 * What a reload finds: the review this tab had open, restored with its diff, or just a note that
 * decisions are waiting. A missing, corrupt or newer-version record reads as nothing to resume.
 */
export function resumeOpenReview(
  adapter: ReviewStorageAdapter,
  bundledTexts: readonly string[] = [],
): ResumeResult {
  const open = adapter.getOpenFingerprint();
  if (!open.ok || open.value === null) {
    return NONE;
  }
  const restored = restoreReview(open.value, { adapter, parser: parseDiff });
  if (!restored.ok) {
    return NONE;
  }
  const { value } = restored;
  if (value.restoredDiff && value.files !== null && value.diffText !== null) {
    return {
      kind: 'review',
      files: value.files,
      state: value.state,
      diffText: value.diffText,
      warnings: value.warnings,
    };
  }
  const bundled = fromBundledText(open.value, value.record, bundledTexts);
  if (bundled.kind === 'review') {
    return bundled;
  }
  return { kind: 'decisions-only', notice: value.notice ?? '' };
}
