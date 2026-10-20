import { useState } from 'react';
import { carryFactsOf } from '../app/carryFacts';
import type { PendingChoice, PendingLoad } from '../app/loadPlan';
import type { OpenDiffValue } from '../app/open';
import { selectReviewed } from '../core/review/selectors';
import type { ParseError, ReviewState } from '../core/types';
import type { LoadedReview } from './loadedReview';
import { loadedDiff, loadedWithDecisions } from './messages/app';
import { bannerAnnouncement } from './messages/carryover';
import { warnLevelCount, warningsAnnouncement } from './messages/warnings';

type CommitDeps = {
  readonly say: (text: string) => void;
  readonly open: (loaded: LoadedReview) => void;
};

function loadLine(opened: OpenDiffValue): string {
  const files = opened.parsed.files.length;
  const hunks = opened.state.hunkIds.length;
  if (opened.outcome !== 'restored') {
    return loadedDiff(files, hunks);
  }
  return loadedWithDecisions(files, hunks, selectReviewed(opened.parsed.files, opened.state));
}

function warningTail(opened: OpenDiffValue): string {
  return warningsAnnouncement(warnLevelCount(opened.parsed.warnings));
}

/** "Loaded 14 files, 37 hunks. 2 warnings." */
export function openedMessage(opened: OpenDiffValue): string {
  return `${loadLine(opened)}${warningTail(opened)}`;
}

/** What the user chose for a waiting load: the state to open and the line to announce. */
function resolved(
  pending: PendingLoad,
  choice: PendingChoice,
): { state: ReviewState; text: string } {
  const { opened } = pending;
  if (pending.kind === 'carry' && choice === 'carry-over') {
    const facts = carryFactsOf(pending.summary.state);
    return {
      state: pending.summary.state,
      text: facts === null ? openedMessage(opened) : bannerAnnouncement(facts),
    };
  }
  return { state: opened.state, text: openedMessage(opened) };
}

/**
 * The last step of a load: the parse error to show, the load that waits for an answer, and the
 * moment a review replaces the one on screen.
 */
export function useLoadCommit({ say, open }: CommitDeps) {
  const [error, setError] = useState<ParseError | null>(null);
  const [pending, setPending] = useState<PendingLoad | null>(null);

  function commit(opened: OpenDiffValue, state: ReviewState, dismissed: boolean, text: string) {
    setError(null);
    setPending(null);
    open({
      files: opened.parsed.files,
      state,
      diffText: opened.decoded.text,
      warnings: opened.parsed.warnings,
      restoredOnReload: false,
      carryoverDismissed: dismissed,
    });
    say(text);
  }

  function resolve(choice: PendingChoice): void {
    if (pending === null) {
      return;
    }
    const { state, text } = resolved(pending, choice);
    commit(pending.opened, state, pending.kind === 'restore' && pending.dismissed, text);
  }

  return { error, setError, pending, setPending, commit, resolve };
}
