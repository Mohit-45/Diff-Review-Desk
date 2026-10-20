import { selectHunkReview } from '../core/review/selectors';
import type { ReviewState } from '../core/types';
import { redactTextWithCount } from '../core/export/redact';
import type { ExportWarningTarget } from './components/exportTypes';
import { isSensitiveFile, maskHunk } from './hunkMasking';
import { exportMessages } from './messages/export';
import type { CommandDeps } from './reviewCommands';
import type { Entry } from './reviewModel';

type HunkTest = (entry: Entry) => boolean;

function hasSecretComment(state: ReviewState, entry: Entry): boolean {
  return redactTextWithCount(selectHunkReview(state, entry.hunk.id).comment).count > 0;
}

function attentionTest(state: ReviewState, target: ExportWarningTarget): HunkTest | null {
  switch (target) {
    case 'pending':
      return (entry) => selectHunkReview(state, entry.hunk.id).decision === null;
    case 'rejected-comment':
      return (entry) => {
        const review = selectHunkReview(state, entry.hunk.id);
        return review.decision === 'rejected' && review.comment.trim().length === 0;
      };
    case 'redactions':
      return (entry) =>
        maskHunk(entry.hunk, isSensitiveFile(entry.file, undefined)).hasMasked ||
        hasSecretComment(state, entry);
    case 'parse-notes':
      return null;
  }
}

/**
 * Export's "Go to first" links. Parse notes open the parse report, since they belong to the diff
 * as a whole. A redaction that no hunk holds sits in the label, the overall note or a path, and
 * says so instead of leaving the dialog's close as the only response.
 */
export function goToFirstNeedingAttention(deps: CommandDeps, target: ExportWarningTarget): void {
  if (target === 'parse-notes') {
    deps.actions.focusParseReport();
    return;
  }
  const test = attentionTest(deps.history.present, target);
  const entry = test === null ? undefined : deps.view.entries.find(test);
  if (entry !== undefined) {
    deps.actions.goTo(entry.hunk.id);
  } else if (target === 'redactions') {
    deps.actions.announce(exportMessages.redactionsOutsideHunks);
  }
}
