import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adapterOver,
  articles,
  newAreas,
  renderApp,
  resetBrowserState,
  stubDialogs,
} from './journeyHelpers';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetBrowserState();
});

type Viewport = { readonly setWide: (wide: boolean) => void };

/** A matchMedia whose answer the test controls, and whose "change" listeners it can call. */
function stubViewport(initiallyWide: boolean): Viewport {
  let wide = initiallyWide;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return wide;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    setWide: (next) => {
      wide = next;
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

function loadSampleOne(): void {
  renderApp(adapterOver(newAreas()));
  fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
}

function rows(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.file-list-row'));
}

function tabStops(): HTMLElement[] {
  const list = document.querySelector('.file-list');
  return Array.from(list?.querySelectorAll<HTMLElement>('button') ?? []).filter(
    (button) => button.tabIndex >= 0,
  );
}

function disclosure(): HTMLDetailsElement {
  const element = document.querySelector('details.rail-disclosure');
  if (!(element instanceof HTMLDetailsElement)) throw new Error('No Files disclosure.');
  return element;
}

describe('RAIL-ROVING the file list is one Tab stop with arrows, Home and End', () => {
  it('makes the current file row the only Tab stop in the list, hunk buttons included', () => {
    loadSampleOne();
    const all = rows();
    expect(all.length).toBeGreaterThan(2);
    expect(all.map((row) => row.tabIndex)).toEqual(
      all.map((_row, index) => (index === 0 ? 0 : -1)),
    );
    expect(tabStops()).toEqual([all[0]]);
    const firstFileHunks = Array.from(
      all[0]?.closest('li')?.querySelectorAll<HTMLElement>('.file-list-hunk-links button') ?? [],
    );
    expect(firstFileHunks.length).toBeGreaterThan(0);
    expect(firstFileHunks.every((button) => button.tabIndex === -1)).toBe(true);
  });

  it('moves focus and the Tab stop with ArrowDown, ArrowUp, Home and End, and stops at the ends', () => {
    loadSampleOne();
    const all = rows();
    const last = all.length - 1;
    all[0]?.focus();

    fireEvent.keyDown(all[0] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(all[1]);
    expect(rows().map((row) => row.tabIndex)).toEqual(
      all.map((_row, index) => (index === 1 ? 0 : -1)),
    );

    fireEvent.keyDown(all[1] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(all[0]);
    fireEvent.keyDown(all[0] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(all[0]);

    fireEvent.keyDown(all[0] as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(all[last]);
    fireEvent.keyDown(all[last] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(all[last]);
    expect(all[last]?.tabIndex).toBe(0);

    fireEvent.keyDown(all[last] as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(all[0]);
  });

  it('draws Hunk links for the current file only and keeps one Tab stop as the focus moves', () => {
    loadSampleOne();
    const all = rows();
    expect(document.querySelectorAll('.file-list-hunk-links')).toHaveLength(1);
    expect(all[0]?.closest('li')?.querySelector('.file-list-hunk-links')).not.toBeNull();
    all[0]?.focus();
    fireEvent.keyDown(all[0] as HTMLElement, { key: 'ArrowDown' });
    expect(tabStops()).toEqual([all[1]]);
    expect(fireEvent.keyDown(all[1] as HTMLElement, { key: 'ArrowRight' })).toBe(true);
    expect(document.activeElement).toBe(all[1]);
  });

  it("moves into a file's Hunk links with ArrowRight and back with ArrowLeft or Escape", () => {
    loadSampleOne();
    const first = rows()[0] as HTMLButtonElement;
    first.focus();
    const hunks = Array.from(
      first.closest('li')?.querySelectorAll<HTMLButtonElement>('.file-list-hunk-links button') ??
        [],
    );
    expect(hunks.length).toBeGreaterThan(2);

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(hunks[0]);
    expect(tabStops()).toEqual([first]);
    fireEvent.keyDown(hunks[0] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(hunks[1]);
    fireEvent.keyDown(hunks[1] as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(hunks[hunks.length - 1]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(hunks[0]);
    fireEvent.keyDown(hunks[0] as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    fireEvent.keyDown(hunks[0] as HTMLElement, { key: 'Escape' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
      expect(
        fireEvent.keyDown(hunks[0] as HTMLElement, { key: 'ArrowLeft', [modifier]: true }),
      ).toBe(true);
    }
    expect(fireEvent.keyDown(hunks[0] as HTMLElement, { key: 'x' })).toBe(true);
    expect(document.activeElement).toBe(hunks[0]);
  });

  it('activates a Hunk link with a click and the Tab stop stays on the file row', () => {
    loadSampleOne();
    const first = rows()[0] as HTMLButtonElement;
    const hunks = first
      .closest('li')
      ?.querySelectorAll<HTMLButtonElement>('.file-list-hunk-links button');
    fireEvent.click(hunks?.[2] as HTMLElement);
    expect(document.activeElement?.tagName).toBe('ARTICLE');
    expect(hunks?.[2]?.getAttribute('aria-current')).toBe('location');
    expect(tabStops()).toEqual([first]);
  });

  it('leaves Enter and Space to the button, and every other key and chord alone', () => {
    loadSampleOne();
    const first = rows()[0] as HTMLButtonElement;
    first.focus();
    for (const init of [{ key: 'Enter' }, { key: ' ' }, { key: 'x' }, { key: 'Tab' }]) {
      expect(fireEvent.keyDown(first, init)).toBe(true);
    }
    for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
      expect(fireEvent.keyDown(first, { key: 'ArrowDown', [modifier]: true })).toBe(true);
    }
    expect(document.activeElement).toBe(first);
  });

  it('activates a row on click and the Tab stop then follows the current file', () => {
    loadSampleOne();
    const all = rows();
    fireEvent.click(all[2] as HTMLElement);
    expect(document.activeElement).toBe(articles().find((a) => a.getAttribute('aria-current')));
    expect(all[2]?.getAttribute('aria-current')).toBe('location');
    expect(all[2]?.tabIndex).toBe(0);
    expect(all[0]?.tabIndex).toBe(-1);
    fireEvent.click(screen.getByRole('button', { name: 'Previous file' }));
    expect(rows().filter((row) => row.tabIndex === 0)).toHaveLength(1);
  });
});

describe('RAIL-DISCLOSURE the rail becomes a Files (N) disclosure below 64rem', () => {
  it('is an open list that needs no toggle where the rail is a column', () => {
    stubViewport(true);
    loadSampleOne();
    expect(disclosure().open).toBe(true);
    expect(within(disclosure()).getByText('Files (8)')).toBeTruthy();
  });

  it('is open without a way to ask, so the files are never hidden by a missing API', () => {
    loadSampleOne();
    expect(disclosure().open).toBe(true);
  });

  it('starts closed when narrow, with progress and Hunk navigation still on the page', () => {
    stubViewport(false);
    loadSampleOne();
    const details = disclosure();
    expect(details.open).toBe(false);
    expect(within(details).getByText('Files (8)').tagName).toBe('SUMMARY');
    expect(details.contains(document.querySelector('.file-list'))).toBe(true);
    expect(details.contains(screen.getByRole('button', { name: 'Next hunk' }))).toBe(false);
    expect(screen.getByText('0 of 11 hunks decided')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Changed files' });
    expect(nav.contains(details)).toBe(true);
    expect(nav.contains(screen.getByRole('button', { name: 'Next hunk' }))).toBe(true);
  });

  it('follows the viewport as it changes: open when wide, folded again when narrow', () => {
    const viewport = stubViewport(false);
    loadSampleOne();
    expect(disclosure().open).toBe(false);
    viewport.setWide(true);
    expect(disclosure().open).toBe(true);
    viewport.setWide(false);
    expect(disclosure().open).toBe(false);
  });

  it('keeps a list the user opened while narrow, across a change of viewport', () => {
    const viewport = stubViewport(false);
    loadSampleOne();
    disclosure().open = true;
    fireEvent(disclosure(), new Event('toggle'));
    viewport.setWide(true);
    viewport.setWide(false);
    expect(disclosure().open).toBe(true);
  });

  it("closes after a file is chosen and hands focus to that file's current hunk", () => {
    stubViewport(false);
    loadSampleOne();
    disclosure().open = true;
    fireEvent(disclosure(), new Event('toggle'));
    fireEvent.click(rows()[3] as HTMLElement);
    expect(disclosure().open).toBe(false);
    expect(document.activeElement).toBe(articles().find((a) => a.getAttribute('aria-current')));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('closes after a Hunk button is chosen too', () => {
    stubViewport(false);
    loadSampleOne();
    disclosure().open = true;
    fireEvent(disclosure(), new Event('toggle'));
    const hunkButton = document.querySelector<HTMLElement>('.file-list-hunk-links button');
    fireEvent.click(hunkButton as HTMLElement);
    expect(disclosure().open).toBe(false);
    expect(document.activeElement?.tagName).toBe('ARTICLE');
  });

  it('opens the list for the / shortcut so the path filter can take focus', () => {
    stubViewport(false);
    loadSampleOne();
    expect(disclosure().open).toBe(false);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: '/' });
    expect(disclosure().open).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('Path'));
  });

  it('opens the list for Skip to changed files, which lands on the navigation landmark', () => {
    stubViewport(false);
    loadSampleOne();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to changed files' }));
    expect(document.activeElement).toBe(screen.getByRole('navigation', { name: 'Changed files' }));
  });
});
