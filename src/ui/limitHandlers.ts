import { createHunkHandlers } from './hunkHandlers';
import type { HunkHandlers, LimitHandlerName } from './ReviewHunks';
import type { FocusTargets } from './useFocusTargets';
import type { ListView } from './useListView';

type LimitHandlers = Pick<HunkHandlers, LimitHandlerName>;

/** The controls that open up what the render limits fold away. Each one hands focus to what it revealed. */
export function limitHandlers(view: ListView, focus: FocusTargets): LimitHandlers {
  return {
    onRevealChange: view.setRevealed,
    onShowMoreHunks: (fileId, firstNewHunkId) => {
      view.showMoreHunks(fileId);
      if (firstNewHunkId !== null) {
        focus.focus({ kind: 'hunk', id: firstNewHunkId });
      }
    },
  };
}

/** Every handler a card needs: what it reports back, plus the controls that open up folded content. */
export function composeHunkHandlers(
  input: Parameters<typeof createHunkHandlers>[0],
  view: ListView,
  focus: FocusTargets,
): HunkHandlers {
  return { ...createHunkHandlers(input), ...limitHandlers(view, focus) };
}
