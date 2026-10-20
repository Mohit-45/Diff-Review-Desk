import type { DiffFile, Prefs, ReviewState } from '../core/types';
import type { ReviewSession } from './reviewTypes';
import { useBeforeUnloadGuard } from './useBeforeUnloadGuard';
import { useCommentDraft } from './useCommentDraft';
import { usePersistReview } from './usePersistReview';

type Input = {
  readonly session: ReviewSession;
  readonly files: readonly DiffFile[];
  readonly state: ReviewState;
  readonly prefs: Prefs;
  readonly editingId: string | null;
  readonly dismissed: boolean;
  readonly withholdDiff: boolean;
};

/**
 * Everything about keeping the open review: the write after each change, the save indicator, and
 * the warning before a reload that would lose decisions or a half-written comment.
 */
export function useReviewSaving({
  session,
  files,
  state,
  prefs,
  editingId,
  dismissed,
  withholdDiff,
}: Input) {
  const saving = usePersistReview({ session, files, state, prefs, dismissed, withholdDiff });
  const draft = useCommentDraft(state, editingId);
  const hasDecisions = Object.values(state.hunks).some((review) => review.decision !== null);
  useBeforeUnloadGuard((session.storage.degraded && hasDecisions) || draft.unsaved);
  return { ...saving, onDraftChange: draft.onDraftChange };
}
