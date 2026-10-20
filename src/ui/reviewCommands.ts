import type { Command, HunkReview, Prefs } from '../core/types';
import type { HistoryAction, ReviewHistory } from '../core/review/history';
import { selectDecision, selectHunkReview } from '../core/review/selectors';
import type { CommentCloseReason } from './components/CommentEditor';
import {
  changedEntry,
  findEntry,
  pendingCount,
  stepFile,
  stepHunk,
  stepPending,
  type Entry,
  type ReviewView,
  type Step,
} from './reviewModel';
import {
  decisionMessage,
  hiddenPending,
  historyMessage,
  noPending,
  pendingMoved,
  reviewMessages,
} from './messages/review-screen';

export type DialogName = 'load' | 'export' | 'help' | 'settings';

/** What the review screen lets a command do. Everything else is derived from the model. */
export type ScreenActions = {
  /** Applies a history action and returns the resulting history. */
  readonly apply: (action: HistoryAction) => ReviewHistory;
  /** Makes a hunk current, expands and pins it, and focuses its article. */
  readonly goTo: (id: string) => void;
  readonly edit: (id: string | null) => void;
  readonly toggleCollapse: (id: string) => void;
  readonly openDialog: (name: DialogName) => void;
  readonly focusPathFilter: () => void;
  /** Opens the parse report disclosure and focuses it. */
  readonly focusParseReport: () => void;
  readonly announce: (text: string) => void;
};

export type CommandDeps = {
  readonly view: ReviewView;
  readonly history: ReviewHistory;
  readonly currentId: string | null;
  readonly prefs: Prefs;
  readonly actions: ScreenActions;
};

type Decision = HunkReview['decision'];

/** Keys move and decide; buttons only decide, because Approve by mouse never advances. */
type DecisionSource = 'key' | 'button';

function moveHunk(deps: CommandDeps, step: Step): void {
  const { view, currentId, actions } = deps;
  if (view.matching.length === 0) {
    actions.announce(reviewMessages.noMatches);
    return;
  }
  const target = stepHunk(view.visible, currentId, step);
  if (target === null) {
    actions.announce(step === 1 ? reviewMessages.lastHunk : reviewMessages.firstHunk);
    return;
  }
  actions.goTo(target.hunk.id);
}

function movePending(deps: CommandDeps, step: Step): void {
  const { view, currentId, actions, history } = deps;
  const state = history.present;
  const total = view.entries.length;
  const pending = pendingCount(view.entries, state);
  if (!view.matching.some((entry) => selectDecision(state, entry.hunk.id) === null)) {
    actions.announce(pending === 0 ? noPending(total) : hiddenPending(pending));
    return;
  }
  const found = stepPending(view.visible, state, currentId, step);
  if (found === null) {
    return;
  }
  if (found.entry.hunk.id === currentId) {
    actions.announce(reviewMessages.onlyPending);
    return;
  }
  actions.goTo(found.entry.hunk.id);
  actions.announce(pendingMoved(found.entry.number, total, found.wrapped));
}

function moveFile(deps: CommandDeps, step: Step): void {
  const { view, currentId, actions } = deps;
  if (view.matching.length === 0) {
    actions.announce(reviewMessages.noMatches);
    return;
  }
  const target = stepFile(view.visible, currentId, step);
  if (target === null) {
    actions.announce(step === 1 ? reviewMessages.lastFile : reviewMessages.firstFile);
    return;
  }
  actions.goTo(target.hunk.id);
}

/** Moves to the next pending hunk that passes the filters; false when there is none. */
function advance(deps: CommandDeps, state: ReviewHistory['present'], fromId: string): boolean {
  const found = stepPending(deps.view.visible, state, fromId, 1);
  if (found === null || found.entry.hunk.id === fromId) {
    return false;
  }
  deps.actions.goTo(found.entry.hunk.id);
  return true;
}

function decisionAction(id: string, decision: Decision): HistoryAction {
  return decision === null ? { type: 'clear', id } : { type: 'decide', id, decision };
}

/** a and r always set, u clears, and only a (with auto-advance) moves on. */
export function applyDecision(
  deps: CommandDeps,
  id: string,
  decision: Decision,
  source: DecisionSource,
): void {
  const entry = findEntry(deps.view.entries, id);
  if (entry === undefined) {
    return;
  }
  if (decision === null && selectDecision(deps.history.present, id) === null) {
    deps.actions.announce(reviewMessages.noDecisionToClear);
    return;
  }
  const next = deps.actions.apply(decisionAction(id, decision)).present;
  const pending = pendingCount(deps.view.entries, next);
  const base = decisionMessage(entry.number, decision, pending, deps.view.entries.length);
  const wantsAdvance = source === 'key' && decision === 'approved' && deps.prefs.autoAdvance;
  const advanced = wantsAdvance && advance(deps, next, id);
  // Pending hunks that exist but cannot be reached mean the filters are hiding them.
  const stranded = wantsAdvance && !advanced && pending > 0;
  deps.actions.announce(
    stranded ? `Hunk ${String(entry.number)} approved. ${hiddenPending(pending)}` : base,
  );
  if (source === 'key' && decision === 'rejected') {
    deps.actions.edit(id);
  }
}

function decideCurrent(deps: CommandDeps, decision: Decision): void {
  if (deps.currentId !== null) {
    applyDecision(deps, deps.currentId, decision, 'key');
  }
}

/** Done and Ctrl/Cmd+Enter commit and then advance; Esc and blur stay put. */
export function advanceAfterComment(
  deps: CommandDeps,
  id: string,
  reason: CommentCloseReason,
): void {
  if ((reason === 'done' || reason === 'shortcut') && deps.prefs.autoAdvance) {
    advance(deps, deps.history.present, id);
  }
}

function stepHistory(deps: CommandDeps, kind: 'undo' | 'redo'): void {
  const { actions, history, view } = deps;
  const next = actions.apply({ type: kind });
  if (next === history) {
    actions.announce(kind === 'undo' ? reviewMessages.nothingToUndo : reviewMessages.nothingToRedo);
    return;
  }
  const changed: Entry | null = changedEntry(view.entries, history.present, next.present);
  const decision =
    changed === null ? null : selectHunkReview(next.present, changed.hunk.id).decision;
  actions.announce(historyMessage(kind, changed?.number ?? null, decision));
  if (changed !== null) {
    actions.goTo(changed.hunk.id);
  }
}

function withCurrent(deps: CommandDeps, run: (id: string) => void): void {
  if (deps.currentId !== null) {
    run(deps.currentId);
  }
}

const HANDLERS: Readonly<Record<Command, (deps: CommandDeps) => void>> = {
  'next-hunk': (deps) => {
    moveHunk(deps, 1);
  },
  'previous-hunk': (deps) => {
    moveHunk(deps, -1);
  },
  'next-pending': (deps) => {
    movePending(deps, 1);
  },
  'previous-pending': (deps) => {
    movePending(deps, -1);
  },
  'next-file': (deps) => {
    moveFile(deps, 1);
  },
  'previous-file': (deps) => {
    moveFile(deps, -1);
  },
  approve: (deps) => {
    decideCurrent(deps, 'approved');
  },
  reject: (deps) => {
    decideCurrent(deps, 'rejected');
  },
  clear: (deps) => {
    decideCurrent(deps, null);
  },
  comment: (deps) => {
    withCurrent(deps, deps.actions.edit);
  },
  'collapse-hunk': (deps) => {
    withCurrent(deps, deps.actions.toggleCollapse);
  },
  export: (deps) => {
    deps.actions.openDialog('export');
  },
  load: (deps) => {
    deps.actions.openDialog('load');
  },
  settings: (deps) => {
    deps.actions.openDialog('settings');
  },
  help: (deps) => {
    deps.actions.openDialog('help');
  },
  'path-filter': (deps) => {
    deps.actions.focusPathFilter();
  },
  undo: (deps) => {
    stepHistory(deps, 'undo');
  },
  redo: (deps) => {
    stepHistory(deps, 'redo');
  },
  // Esc and Ctrl/Cmd+Enter are owned by the dialog wrapper and the comment editor.
  close: () => undefined,
  'commit-comment': () => undefined,
};

export function runCommand(command: Command, deps: CommandDeps): void {
  HANDLERS[command](deps);
}

/** A file in the list: its first visible hunk, else its first hunk, which the filters then pin. */
export function goToFile(deps: CommandDeps, fileId: string): void {
  const inFile = (entry: Entry) => entry.file.id === fileId;
  const target = deps.view.visible.find(inFile) ?? deps.view.entries.find(inFile);
  if (target !== undefined) {
    deps.actions.goTo(target.hunk.id);
  }
}
