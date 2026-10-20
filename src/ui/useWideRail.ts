import { useSyncExternalStore } from 'react';

/** The same query the stylesheet uses to make the rail a sticky column. */
export const WIDE_RAIL = '(min-width: 64rem) and (min-height: 30rem)';

function query(): MediaQueryList | null {
  // Some embedded browsers and test environments have no matchMedia.
  return typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_RAIL) : null;
}

function subscribe(onChange: () => void): () => void {
  const list = query();
  list?.addEventListener('change', onChange);
  return () => {
    list?.removeEventListener('change', onChange);
  };
}

function snapshot(): boolean {
  // Without a way to ask, keep the files showing: hiding them would cost more than a long page.
  return query()?.matches ?? true;
}

/** True while the rail is a column beside the diff; false when it folds into a Files disclosure. */
export function useWideRail(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
