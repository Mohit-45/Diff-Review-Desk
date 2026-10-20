import type { Dispatch, SetStateAction } from 'react';
import { carryFactsOf, newOrChangedIdsOf, type CarryFacts } from '../app/carryFacts';
import type { ReviewState } from '../core/types';
import type { ReviewFilters } from './components/Filters';
import { carryMessages, newReviewAnnouncement } from './messages/carryover';
import type { ScreenActions } from './reviewCommands';
import type { Entry } from './reviewModel';

export type CarryBannerModel = {
  readonly facts: CarryFacts;
  readonly onReviewNew: () => void;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
};

type Input = {
  readonly state: ReviewState;
  readonly dismissed: boolean;
  readonly setDismissed: (dismissed: boolean) => void;
  readonly entries: readonly Entry[];
  readonly currentId: string | null;
  readonly setFilters: Dispatch<SetStateAction<ReviewFilters>>;
  readonly actions: ScreenActions;
};

/**
 * The round banner and what its three buttons do. Dismiss and Undo remove the button that held
 * focus, so both hand focus to the current hunk.
 */
export function carryBannerModel(input: Input): CarryBannerModel | null {
  const { state, dismissed, entries, currentId, actions } = input;
  const facts = carryFactsOf(state);
  if (facts === null || dismissed) {
    return null;
  }
  const backToHunk = () => {
    const target = currentId ?? entries[0]?.hunk.id ?? null;
    if (target !== null) {
      actions.goTo(target);
    }
  };
  return {
    facts,
    onReviewNew: () => {
      input.setFilters((filters) => ({ ...filters, status: 'new-or-changed' }));
      const fresh = new Set(newOrChangedIdsOf(state));
      const first = entries.find((entry) => fresh.has(entry.hunk.id));
      if (first !== undefined) {
        actions.goTo(first.hunk.id);
      }
      actions.announce(newReviewAnnouncement(facts));
    },
    onUndo: () => {
      actions.apply({ type: 'reset' });
      input.setFilters((filters) =>
        filters.status === 'new-or-changed' ? { ...filters, status: 'all' } : filters,
      );
      backToHunk();
      actions.announce(carryMessages.undone);
    },
    onDismiss: () => {
      input.setDismissed(true);
      backToHunk();
      actions.announce(carryMessages.dismissed);
    },
  };
}
