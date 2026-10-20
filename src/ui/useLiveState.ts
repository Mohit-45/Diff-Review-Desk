import { useEffect } from 'react';
import type { ReviewState } from '../core/types';

/**
 * Reports the review as the reducer holds it, so a load can be judged against the decisions made
 * so far and not the ones the screen opened with. Cleared when the screen goes away.
 */
export function useLiveState(
  state: ReviewState,
  report: (state: ReviewState | null) => void,
): void {
  useEffect(() => {
    report(state);
    return () => {
      report(null);
    };
  }, [state, report]);
}
