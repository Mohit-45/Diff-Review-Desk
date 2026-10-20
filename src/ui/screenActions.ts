import type { Dispatch, SetStateAction } from 'react';
import {
  reviewHistoryReducer,
  type HistoryAction,
  type ReviewHistory,
} from '../core/review/history';
import type { ScreenActions } from './reviewCommands';
import type { Dialogs } from './useDialogs';
import type { FocusTargets } from './useFocusTargets';

type ScreenActionDeps = {
  readonly history: ReviewHistory;
  readonly dispatch: Dispatch<HistoryAction>;
  readonly setCurrentId: Dispatch<SetStateAction<string | null>>;
  readonly setCollapsed: Dispatch<SetStateAction<ReadonlySet<string>>>;
  readonly setEditingId: Dispatch<SetStateAction<string | null>>;
  readonly focus: FocusTargets;
  /** Opens the target's file and widens its hunk window before focus is requested. */
  readonly revealTarget: (id: string) => void;
  readonly dialogs: Dialogs;
  readonly announce: (text: string) => void;
};

function without(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!ids.has(id)) {
    return ids;
  }
  const next = new Set(ids);
  next.delete(id);
  return next;
}

function toggled(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return ids.has(id) ? without(ids, id) : new Set(ids).add(id);
}

export function withCollapsed(
  ids: ReadonlySet<string>,
  id: string,
  collapsed: boolean,
): ReadonlySet<string> {
  if (!collapsed) {
    return without(ids, id);
  }
  return ids.has(id) ? ids : new Set(ids).add(id);
}

export function createScreenActions(deps: ScreenActionDeps): ScreenActions {
  return {
    apply: (action) => {
      // The reducer is pure, so the caller can read the outcome before React re-renders.
      const next = reviewHistoryReducer(deps.history, action);
      deps.dispatch(action);
      return next;
    },
    goTo: (id) => {
      deps.setCurrentId(id);
      deps.setCollapsed((ids) => without(ids, id));
      deps.revealTarget(id);
      deps.focus.focus({ kind: 'hunk', id });
    },
    edit: deps.setEditingId,
    toggleCollapse: (id) => {
      deps.setCollapsed((ids) => toggled(ids, id));
    },
    openDialog: deps.dialogs.open,
    focusPathFilter: () => {
      deps.focus.focus({ kind: 'path-filter' });
    },
    focusParseReport: () => {
      deps.focus.focus({ kind: 'parse-report' });
    },
    announce: deps.announce,
  };
}
