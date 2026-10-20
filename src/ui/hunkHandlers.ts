import type { Dispatch, SetStateAction } from 'react';
import {
  advanceAfterComment,
  applyDecision,
  type CommandDeps,
  type ScreenActions,
} from './reviewCommands';
import type { HunkHandlers, LimitHandlerName } from './ReviewHunks';
import { withCollapsed } from './screenActions';

type Input = {
  readonly deps: CommandDeps;
  readonly actions: ScreenActions;
  readonly onDraftChange: (id: string, text: string) => void;
  readonly setEditingId: Dispatch<SetStateAction<string | null>>;
  readonly setCollapsed: Dispatch<SetStateAction<ReadonlySet<string>>>;
  readonly setCurrentId: (id: string) => void;
  readonly register: HunkHandlers['register'];
};

/** What each hunk card reports back to the screen. */
export function createHunkHandlers(input: Input): Omit<HunkHandlers, LimitHandlerName> {
  const { deps, actions } = input;
  return {
    onDecision: (id, decision) => {
      applyDecision(deps, id, decision, 'button');
    },
    onComment: (id, comment) => {
      actions.apply({ type: 'setComment', id, comment });
    },
    onCommentClose: (id, reason) => {
      advanceAfterComment(deps, id, reason);
    },
    onDraftChange: input.onDraftChange,
    onEditingChange: (id, editing) => {
      input.setEditingId((open) => (editing ? id : open === id ? null : open));
    },
    onCollapseChange: (id, collapsed) => {
      input.setCollapsed((ids) => withCollapsed(ids, id, collapsed));
    },
    onFocusHunk: input.setCurrentId,
    register: input.register,
  };
}
