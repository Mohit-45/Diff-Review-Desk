import { useState } from 'react';
import type { ReviewState } from '../core/types';

type Draft = { readonly id: string; readonly text: string };

/**
 * Tracks the text in the open comment editor, which the editor keeps to itself until it commits.
 * Returns whether closing the tab now would lose a comment the review does not hold yet.
 */
export function useCommentDraft(state: ReviewState, editingId: string | null) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const committed = editingId === null ? '' : (state.hunks[editingId]?.comment ?? '');
  const unsaved =
    editingId !== null &&
    draft?.id === editingId &&
    draft.text.trim() !== '' &&
    draft.text !== committed;
  return {
    unsaved,
    onDraftChange: (id: string, text: string) => {
      setDraft({ id, text });
    },
  };
}
