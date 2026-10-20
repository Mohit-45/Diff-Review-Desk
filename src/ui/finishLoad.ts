import type { LoadFailureError } from '../app/generation';
import { planLoad, type PendingLoad } from '../app/loadPlan';
import type { OpenDiffError, OpenDiffValue } from '../app/open';
import type { ParseError, Result, ReviewState } from '../core/types';
import type { ReviewStorageAdapter } from '../storage/adapter';
import { LOAD_FAILED, appMessages } from './messages/app';
import { openedMessage } from './useLoadCommit';

export type LoadResult = Result<OpenDiffValue, OpenDiffError | LoadFailureError>;

export function toParseError(error: OpenDiffError | LoadFailureError): ParseError {
  return 'title' in error ? error : LOAD_FAILED;
}

export type FinishDeps = {
  readonly adapter: ReviewStorageAdapter;
  readonly getCurrent: () => ReviewState | null;
  readonly say: (text: string) => void;
  readonly commit: (
    opened: OpenDiffValue,
    state: ReviewState,
    dismissed: boolean,
    text: string,
  ) => void;
  readonly setError: (error: ParseError | null) => void;
  readonly setPending: (pending: PendingLoad | null) => void;
};

/** What a finished load means: an error to show, a review to open, or a question to ask first. */
export function finishLoad(result: LoadResult, deps: FinishDeps): void {
  const { adapter, getCurrent, say, commit, setError, setPending } = deps;
  if (!result.ok) {
    const failure = toParseError(result.error);
    setError(failure);
    say(failure.title);
    return;
  }
  const plan = planLoad(result.value, { current: getCurrent(), adapter });
  if (plan.kind === 'same-open') {
    say(appMessages.alreadyOpen);
  } else if (plan.kind === 'open') {
    commit(plan.opened, plan.opened.state, plan.dismissed, openedMessage(plan.opened));
  } else {
    setError(null);
    setPending(plan);
  }
}
