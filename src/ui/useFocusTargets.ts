import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type FocusTarget =
  | { readonly kind: 'hunk'; readonly id: string }
  | { readonly kind: 'path-filter' }
  /** The changed-files landmark, for "Skip to changed files". */
  | { readonly kind: 'files-nav' }
  /** The main landmark, for a review with no hunk to land on. */
  | { readonly kind: 'main' }
  /** The "Parse report" disclosure, opened so what it lists can be read. */
  | { readonly kind: 'parse-report' }
  /** Dialog close: the invoker if it still exists, else the current hunk, else main. */
  | {
      readonly kind: 'restore';
      readonly invoker: HTMLElement | null;
      readonly fallbackId: string | null;
    };

export type FocusTargets = {
  readonly register: (id: string, element: HTMLElement | null) => void;
  readonly focus: (target: FocusTarget) => void;
};

export type FocusRefs = {
  readonly pathFilter: RefObject<HTMLInputElement | null>;
  readonly main: RefObject<HTMLElement | null>;
  readonly nav: RefObject<HTMLElement | null>;
  readonly parseReport: RefObject<HTMLElement | null>;
};

/** A field inside the folded Files list can only take focus once the list is open. */
function inOpenDisclosure<T extends HTMLElement>(element: T | null): T | null {
  const disclosure = element?.closest('details');
  if (disclosure instanceof HTMLDetailsElement) {
    disclosure.open = true;
  }
  return element;
}

/** The summary of the Parse report disclosure, with the disclosure opened so its list can be read. */
function openedParseReport(summary: HTMLElement | null): HTMLElement | null {
  if (summary?.parentElement instanceof HTMLDetailsElement) {
    summary.parentElement.open = true;
  }
  return summary;
}

/** Dialog close: back to the invoker if it still exists, else the current hunk, else main. */
function restored(
  target: Extract<FocusTarget, { readonly kind: 'restore' }>,
  articles: ReadonlyMap<string, HTMLElement>,
  refs: FocusRefs,
): HTMLElement | null {
  if (target.invoker?.isConnected === true) {
    return target.invoker;
  }
  const hunk = target.fallbackId === null ? undefined : articles.get(target.fallbackId);
  return hunk ?? refs.main.current;
}

function resolve(
  target: FocusTarget,
  articles: ReadonlyMap<string, HTMLElement>,
  refs: FocusRefs,
): HTMLElement | null {
  switch (target.kind) {
    case 'hunk':
      return articles.get(target.id) ?? null;
    case 'path-filter':
      return inOpenDisclosure(refs.pathFilter.current);
    case 'files-nav':
      return refs.nav.current;
    case 'main':
      return refs.main.current;
    case 'parse-report':
      return openedParseReport(refs.parseReport.current);
    case 'restore':
      return restored(target, articles, refs);
  }
}

function reveal(element: HTMLElement): void {
  // jsdom has no scrollIntoView; real browsers always do.
  if ('scrollIntoView' in element) {
    element.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
  element.focus();
}

/**
 * Focus is requested as state and applied after the commit, so a target that was
 * hidden, collapsed or pinned by the same command is in the DOM by the time it is focused.
 */
export function useFocusTargets(refs: FocusRefs, initialHunkId: string | null): FocusTargets {
  const articles = useRef(new Map<string, HTMLElement>());
  const [request, setRequest] = useState<FocusTarget | null>(
    initialHunkId === null ? null : { kind: 'hunk', id: initialHunkId },
  );
  const { pathFilter, main, nav, parseReport } = refs;

  useEffect(() => {
    if (request === null) {
      return;
    }
    const element = resolve(request, articles.current, { pathFilter, main, nav, parseReport });
    if (element !== null) {
      reveal(element);
    }
  }, [request, pathFilter, main, nav, parseReport]);

  const register = useCallback((id: string, element: HTMLElement | null) => {
    if (element === null) {
      articles.current.delete(id);
    } else {
      articles.current.set(id, element);
    }
  }, []);

  return { register, focus: setRequest };
}

/** The elements a focus request can land on besides a hunk card. */
export function useFocusRefs(): FocusRefs {
  return {
    pathFilter: useRef<HTMLInputElement>(null),
    main: useRef<HTMLElement>(null),
    nav: useRef<HTMLElement>(null),
    parseReport: useRef<HTMLElement>(null),
  };
}
