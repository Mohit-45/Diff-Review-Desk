import { LIMITS } from '../core/limits';
import type { DiffFile } from '../core/types';
import type { Entry } from './reviewModel';

/** A file with this many body lines or more starts with its diffs folded (SPEC section 6). */
export const COLLAPSE_FILE_BODY_LINES = 1_000;
/** A file with more hunks than this renders them a window at a time (SPEC section 6). */
export const WINDOW_FILE_HUNKS = 200;

/** What the reader has opened up. Render-only: no decision, hash or export reads it. */
export type RenderState = {
  /** Hunks drawn so far for a file over the window size; absent means the first window. */
  readonly windows: ReadonlyMap<string, number>;
};

export const EMPTY_RENDER_STATE: RenderState = { windows: new Map() };

export type FilePlan = {
  readonly file: DiffFile;
  /** Hunks of this file that pass the filters, in order. */
  readonly entries: readonly Entry[];
  /** The leading part of `entries` that is drawn. */
  readonly shown: readonly Entry[];
};

const bodyLineCache = new WeakMap<DiffFile, number>();

export function bodyLineCount(file: DiffFile): number {
  const known = bodyLineCache.get(file);
  if (known !== undefined) {
    return known;
  }
  const count = file.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
  bodyLineCache.set(file, count);
  return count;
}

export function collapsedByDefault(file: DiffFile): boolean {
  return file.generated || bodyLineCount(file) >= COLLAPSE_FILE_BODY_LINES;
}

/** Ids of the hunks whose diff starts folded behind "Show diff (N lines)". */
export function defaultCollapsedIds(entries: readonly Entry[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const { file, hunk } of entries) {
    if (hunk.kind === 'text' && collapsedByDefault(file)) {
      ids.add(hunk.id);
    }
  }
  return ids;
}

function windowSize(state: RenderState, fileId: string): number {
  return state.windows.get(fileId) ?? LIMITS.maxFileRenderHunks;
}

function planFile(
  file: DiffFile,
  entries: readonly Entry[],
  state: RenderState,
  currentId: string | null,
): FilePlan {
  // The current hunk always has a card, so the roving tab stop and focus have somewhere to land.
  const currentRank = entries.findIndex((entry) => entry.hunk.id === currentId);
  const size = Math.max(windowSize(state, file.id), currentRank + 1);
  return {
    file,
    entries,
    shown: entries.length > WINDOW_FILE_HUNKS ? entries.slice(0, size) : entries,
  };
}

/** Group the visible hunks by file and decide how many cards of each file are drawn. */
export function planFiles(
  visible: readonly Entry[],
  state: RenderState,
  currentId: string | null,
): readonly FilePlan[] {
  const plans: FilePlan[] = [];
  let group: Entry[] = [];
  const flush = () => {
    const first = group[0];
    if (first !== undefined) {
      plans.push(planFile(first.file, group, state, currentId));
    }
    group = [];
  };
  for (const entry of visible) {
    if (group[0]?.file.id !== entry.file.id) {
      flush();
    }
    group.push(entry);
  }
  flush();
  return plans;
}

function pageUp(position: number): number {
  const page = LIMITS.maxFileRenderHunks;
  return Math.ceil((position + 1) / page) * page;
}

/** Widen the target's file window so the target is drawn. */
export function withTarget(state: RenderState, entry: Entry): RenderState {
  const { file, hunk } = entry;
  const position = file.hunks.indexOf(hunk);
  const wanted = position < 0 ? 0 : pageUp(position);
  if (wanted <= windowSize(state, file.id)) {
    return state;
  }
  return { windows: new Map(state.windows).set(file.id, wanted) };
}

export function withMoreHunks(state: RenderState, fileId: string): RenderState {
  const next = windowSize(state, fileId) + LIMITS.maxFileRenderHunks;
  return { windows: new Map(state.windows).set(fileId, next) };
}
