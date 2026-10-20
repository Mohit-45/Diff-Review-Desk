import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  adapterOver,
  newAreas,
  pasteAndLoad,
  renderApp,
  resetBrowserState,
  stubDialogs,
} from './journeyHelpers';
import { manyHunkDiff } from '../diffFixtures';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  resetBrowserState();
});

const SLOW = { timeout: 60_000 };

/**
 * Role queries compute every accessible name, which is far too slow with hundreds of nodes, so
 * these tests read the DOM directly; the roles of the list are covered by the small-diff tests.
 */
function load(hunks: number): void {
  renderApp(adapterOver(newAreas()));
  pasteAndLoad(manyHunkDiff('src/big.ts', hunks));
}

function nav(): HTMLElement {
  const element = document.querySelector<HTMLElement>('nav[aria-label="Changed files"]');
  if (element === null) throw new Error('No Changed files navigation.');
  return element;
}

function tabbable(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button')).filter(
    (button) => button.tabIndex >= 0,
  );
}

function links(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('.file-list-hunk-links button[data-position]'),
  );
}

function row(): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>('.file-list-row');
  if (element === null) throw new Error('No file row.');
  return element;
}

function railButton(name: string): HTMLButtonElement {
  const found = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.file-list-hunk-links button'),
  ).find((button) => button.textContent === name);
  if (found === undefined) throw new Error(`No rail button named ${name}.`);
  return found;
}

function names(): string[] {
  return links().map((link) => link.textContent);
}

function key(target: Element | null, name: string): void {
  fireEvent.keyDown(target ?? document.body, { key: name });
}

function headingOf(element: Element | null): string {
  return element?.querySelector('h3')?.textContent ?? '';
}

describe('RAIL-ROVING a 600 hunk file keeps the rail small and keyboard-cheap', () => {
  it(
    'RAIL-ROVING-BOUND draws at most 100 Hunk links and one Tab stop for the whole list',
    SLOW,
    () => {
      load(600);

      expect(links()).toHaveLength(100);
      expect(names()[0]).toBe('Hunk 1');
      expect(names()[99]).toBe('Hunk 100');
      expect(document.querySelectorAll('.file-list-hunk-links button')).toHaveLength(101);
      expect(nav().querySelectorAll('button').length).toBeLessThan(130);
      expect(tabbable(document.querySelector('.file-list') as HTMLElement)).toEqual([row()]);
      expect(links().every((link) => link.tabIndex === -1)).toBe(true);
      const outsideFilters = tabbable(nav()).filter(
        (button) => button.closest('.review-filters, .review-navigation') === null,
      );
      expect(outsideFilters).toEqual([row()]);
    },
  );

  it('RAIL-ROVING-ARROWS reaches the links from the row and back with the arrow keys', SLOW, () => {
    load(600);
    row().focus();

    key(row(), 'ArrowRight');
    expect(document.activeElement).toBe(railButton('Hunk 1'));
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(railButton('Hunk 2'));
    key(document.activeElement, 'ArrowUp');
    key(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(railButton('Hunk 1'));
    key(document.activeElement, 'End');
    expect(document.activeElement).toBe(railButton('Show more hunks'));
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(railButton('Show more hunks'));
    key(document.activeElement, 'Home');
    expect(document.activeElement).toBe(railButton('Hunk 1'));

    key(document.activeElement, 'ArrowLeft');
    expect(document.activeElement).toBe(row());
    key(row(), 'ArrowRight');
    key(document.activeElement, 'Escape');
    expect(document.activeElement).toBe(row());
    expect(tabbable(document.querySelector('.file-list') as HTMLElement)).toEqual([row()]);
  });

  it('RAIL-ROVING-ACTIVATE a link goes to its hunk and focuses it', SLOW, () => {
    load(600);

    fireEvent.click(railButton('Hunk 7'));

    expect(document.activeElement?.tagName).toBe('ARTICLE');
    expect(headingOf(document.activeElement)).toMatch(/^Hunk 7 of 600, /);
    expect(railButton('Hunk 7').getAttribute('aria-current')).toBe('location');
  });

  it('RAIL-ROVING-MORE Show more hunks adds 100 links and focuses the first new one', SLOW, () => {
    load(600);
    row().focus();
    key(row(), 'ArrowRight');
    key(document.activeElement, 'End');

    fireEvent.click(railButton('Show more hunks'));

    expect(links()).toHaveLength(200);
    expect(document.activeElement).toBe(railButton('Hunk 101'));
    expect(tabbable(document.querySelector('.file-list') as HTMLElement)).toEqual([row()]);
    for (let page = 0; page < 4; page += 1) {
      fireEvent.click(railButton('Show more hunks'));
    }
    expect(links()).toHaveLength(600);
    expect(document.activeElement).toBe(railButton('Hunk 501'));
    expect(
      Array.from(document.querySelectorAll('.file-list-hunk-links button')).some(
        (button) => button.textContent === 'Show more hunks',
      ),
    ).toBe(false);
  });

  it(
    'RAIL-ROVING-FOLLOW the window follows the current hunk and Show earlier brings the rest',
    SLOW,
    () => {
      load(600);
      fireEvent.click(railButton('Hunk 100'));

      key(document.activeElement, 'j');

      expect(headingOf(document.activeElement)).toMatch(/^Hunk 101 of 600, /);
      expect(links()).toHaveLength(100);
      expect(names()[0]).toBe('Hunk 101');
      expect(railButton('Hunk 101').getAttribute('aria-current')).toBe('location');
      expect(tabbable(document.querySelector('.file-list') as HTMLElement)).toEqual([row()]);

      fireEvent.click(railButton('Show earlier hunks'));

      expect(links()).toHaveLength(200);
      expect(document.activeElement).toBe(railButton('Hunk 1'));
      expect(names()[199]).toBe('Hunk 200');
    },
  );

  it('RAIL-ROVING-FAR a hunk beyond the first page keeps its link in the window', SLOW, () => {
    load(600);
    for (let page = 0; page < 4; page += 1) {
      fireEvent.click(railButton('Show more hunks'));
    }

    fireEvent.click(railButton('Hunk 450'));

    expect(headingOf(document.activeElement)).toMatch(/^Hunk 450 of 600, /);
    expect(railButton('Hunk 450').getAttribute('aria-current')).toBe('location');
    expect(links()).toHaveLength(500);
  });
});
