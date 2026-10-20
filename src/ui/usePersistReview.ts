import { useEffect, useRef, useState } from 'react';
import { persistReview } from '../app/persist';
import { createPersistGate } from '../app/persistGate';
import type { DiffFile, Prefs, ReviewState } from '../core/types';
import type { ReviewSession } from './reviewTypes';

export type SaveStatus = 'saved' | 'saving' | 'not-saved';

export type PersistView = {
  readonly status: SaveStatus;
  /** Why the diff text is not stored, when it is being withheld; null otherwise. */
  readonly diffNote: string | null;
};

type Written = {
  readonly state: ReviewState | null;
  readonly failed: boolean;
  readonly note: string | null;
};

type Input = {
  readonly session: ReviewSession;
  readonly files: readonly DiffFile[];
  readonly state: ReviewState;
  readonly prefs: Prefs;
  /** Dismissing the round banner is a change of its own, saved though the review is the same. */
  readonly dismissed: boolean;
  /** A risk rule could not run on this diff, so only decisions may rest in storage. */
  readonly withholdDiff: boolean;
};

/**
 * One immediate write per change, with no debounce. A review that just came back from storage is
 * already saved, so its first render writes nothing.
 */
export function usePersistReview({
  session,
  files,
  state,
  prefs,
  dismissed,
  withholdDiff,
}: Input): PersistView {
  const { adapter, clock, diffText, restoredOnReload, onStorageChange } = session;
  const remember = prefs.rememberDiff;
  const [gate] = useState(() => createPersistGate(files, diffText));
  const last = useRef(restoredOnReload ? { state, remember, dismissed } : null);
  const [written, setWritten] = useState<Written>({
    state: restoredOnReload ? state : null,
    failed: false,
    note: null,
  });

  useEffect(() => {
    const seen = last.current;
    if (seen?.state === state && seen.remember === remember && seen.dismissed === dismissed) {
      return;
    }
    last.current = { state, remember, dismissed };
    const saved = persistReview(state, {
      adapter,
      updatedAt: clock(),
      diffText,
      rememberDiff: remember,
      carryoverDismissed: dismissed,
      withholdDiff,
      ...gate,
    });
    setWritten({ state, failed: !saved.ok, note: saved.ok ? saved.value.diffNote : null });
    onStorageChange();
  }, [state, remember, dismissed, withholdDiff, adapter, clock, diffText, gate, onStorageChange]);

  if (session.storage.degraded || written.failed) {
    return { status: 'not-saved', diffNote: written.note };
  }
  return { status: written.state === state ? 'saved' : 'saving', diffNote: written.note };
}
