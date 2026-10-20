import { useState } from 'react';
import { EMPTY_RENDER_STATE, withMoreHunks, withTarget, type RenderState } from './renderPlan';
import { findEntry, type Entry } from './reviewModel';

export type ListView = {
  readonly render: RenderState;
  /** Hunks that show their secrets as typed. Session memory: never saved, never exported. */
  readonly revealedIds: ReadonlySet<string>;
  /** Widens the target's file window, so a command that moves there finds a card. */
  readonly revealTarget: (id: string) => void;
  readonly showMoreHunks: (fileId: string) => void;
  readonly setRevealed: (id: string, revealed: boolean) => void;
};

function withRevealed(
  ids: ReadonlySet<string>,
  id: string,
  revealed: boolean,
): ReadonlySet<string> {
  if (ids.has(id) === revealed) {
    return ids;
  }
  const next = new Set(ids);
  if (revealed) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
}

/**
 * What the reader has opened up: hunk windows and revealed secrets. The screen is
 * mounted per diff, so all of it starts empty for a new diff.
 */
export function useListView(entries: readonly Entry[], initialId: string | null): ListView {
  const [render, setRender] = useState<RenderState>(() => {
    const first = findEntry(entries, initialId);
    return first === undefined ? EMPTY_RENDER_STATE : withTarget(EMPTY_RENDER_STATE, first);
  });
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  return {
    render,
    revealedIds,
    revealTarget: (id) => {
      const target = findEntry(entries, id);
      if (target !== undefined) {
        setRender((state) => withTarget(state, target));
      }
    },
    showMoreHunks: (fileId) => {
      setRender((state) => withMoreHunks(state, fileId));
    },
    setRevealed: (id, revealed) => {
      setRevealedIds((ids) => withRevealed(ids, id, revealed));
    },
  };
}
