import type { ScreenActions } from './reviewCommands';
import type { FocusTargets } from './useFocusTargets';

/**
 * Where the two review skip links lead: the changed-files landmark, and the current hunk. A
 * review with no hunk has no card to land on, so the diff link falls back to the main landmark.
 */
export function skipHandlers(
  focus: FocusTargets,
  actions: Pick<ScreenActions, 'goTo'>,
  currentId: string | null,
): { readonly onSkipToFiles: () => void; readonly onSkipToDiff: () => void } {
  return {
    onSkipToFiles: () => {
      focus.focus({ kind: 'files-nav' });
    },
    onSkipToDiff: () => {
      if (currentId === null) {
        focus.focus({ kind: 'main' });
      } else {
        actions.goTo(currentId);
      }
    },
  };
}
