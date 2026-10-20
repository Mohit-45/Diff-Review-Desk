import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Hunk } from '../../core/types';
import { SafeText } from './SafeText';
import { rovingTarget } from './rovingTarget';

/** How many Hunk links the active file draws at a time, and how many each "Show" adds. */
export const HUNK_LINK_PAGE = 100;

export const FILE_ROW_SELECTOR = '.file-list-row';
export const HUNK_LINKS_SELECTOR = '.file-list-hunk-links';

type LinkWindow = { readonly start: number; readonly end: number };

function pageAround(anchor: number, count: number): LinkWindow {
  const start = Math.floor(anchor / HUNK_LINK_PAGE) * HUNK_LINK_PAGE;
  return { start, end: Math.min(start + HUNK_LINK_PAGE, count) };
}

/** The window the reader opened stays while it holds the current hunk; otherwise it follows it. */
function effectiveWindow(saved: LinkWindow | null, anchor: number, count: number): LinkWindow {
  if (saved !== null && saved.end <= count && anchor >= saved.start && anchor < saved.end) {
    return saved;
  }
  return pageAround(anchor, count);
}

/** The links and the Show buttons are one roving group: arrows move, Left and Esc go back. */
function moveWithinLinks(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  const group = event.currentTarget.closest(HUNK_LINKS_SELECTOR);
  if (group === null) {
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'Escape') {
    event.preventDefault();
    group.parentElement?.querySelector<HTMLElement>(FILE_ROW_SELECTOR)?.focus();
    return;
  }
  const items = Array.from(group.querySelectorAll<HTMLButtonElement>('button'));
  const next = rovingTarget(event.key, items.indexOf(event.currentTarget), items.length);
  if (next === null) {
    return;
  }
  event.preventDefault();
  items[next]?.focus();
}

type FileHunkLinksProps = {
  readonly hunks: readonly Hunk[];
  readonly currentHunkId?: string | null;
  readonly onSelectHunk: (hunkId: string) => void;
  readonly onFocusWithin: () => void;
};

/**
 * The active file's Hunk buttons. None is a Tab stop, so a file of hundreds of hunks costs the
 * keyboard nothing; at most one page is drawn, which always holds the current hunk.
 */
export function FileHunkLinks({
  hunks,
  currentHunkId,
  onSelectHunk,
  onFocusWithin,
}: FileHunkLinksProps) {
  const [saved, setSaved] = useState<LinkWindow | null>(null);
  const focusIndex = useRef<number | null>(null);
  const group = useRef<HTMLDivElement>(null);
  const anchor = Math.max(
    hunks.findIndex((hunk) => hunk.id === currentHunkId),
    0,
  );
  const view = effectiveWindow(saved, anchor, hunks.length);
  useEffect(() => {
    const target = focusIndex.current;
    focusIndex.current = null;
    if (target !== null) {
      group.current?.querySelector<HTMLElement>(`[data-position="${String(target)}"]`)?.focus();
    }
  }, [view.start, view.end]);
  const reveal = (next: LinkWindow, first: number) => {
    focusIndex.current = first;
    setSaved(next);
  };
  return (
    <div ref={group} className="file-list-hunk-links" role="group" aria-label="Hunks in file">
      {view.start > 0 ? (
        <button
          type="button"
          tabIndex={-1}
          onFocus={onFocusWithin}
          onKeyDown={moveWithinLinks}
          onClick={() => {
            const start = Math.max(view.start - HUNK_LINK_PAGE, 0);
            reveal({ start, end: view.end }, start);
          }}
        >
          Show earlier hunks
        </button>
      ) : null}
      {hunks.slice(view.start, view.end).map((hunk, offset) => (
        <button
          key={hunk.id}
          type="button"
          tabIndex={-1}
          data-position={view.start + offset}
          onFocus={onFocusWithin}
          onKeyDown={moveWithinLinks}
          onClick={() => {
            onSelectHunk(hunk.id);
          }}
          aria-current={currentHunkId === hunk.id ? 'location' : undefined}
        >
          <SafeText>{`Hunk ${String(hunk.index + 1)}`}</SafeText>
        </button>
      ))}
      {view.end < hunks.length ? (
        <button
          type="button"
          tabIndex={-1}
          onFocus={onFocusWithin}
          onKeyDown={moveWithinLinks}
          onClick={() => {
            const end = Math.min(view.end + HUNK_LINK_PAGE, hunks.length);
            reveal({ start: view.start, end }, view.end);
          }}
        >
          Show more hunks
        </button>
      ) : null}
    </div>
  );
}
