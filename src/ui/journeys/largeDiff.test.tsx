import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  adapterOver,
  newAreas,
  pasteAndLoad,
  renderApp,
  resetBrowserState,
  stubDialogs,
} from './journeyHelpers';
import { longHunkDiff, longLine, manyHunkDiff, oneLineDiff } from '../diffFixtures';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  resetBrowserState();
});

const SLOW = { timeout: 60_000 };

function load(text: string): void {
  renderApp(adapterOver(newAreas()));
  pasteAndLoad(text);
}

function press(key: string): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

/**
 * Role queries walk every element and compute its accessible name, which takes minutes once a
 * few hundred cards are drawn. These helpers read the DOM directly; the semantics of the cards
 * and the table are covered by the role-based component tests.
 */
function articles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('article.hunk'));
}

/** The visible label of a button, without the decorative key hint beside it. */
function labelOf(button: HTMLElement): string {
  const copy = button.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('kbd').forEach((hint) => {
    hint.remove();
  });
  return copy.textContent.trim();
}

function buttonsNamed(name: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button')).filter(
    (button) => labelOf(button) === name,
  );
}

function buttonNamed(name: string, root: ParentNode = document): HTMLElement {
  const found = buttonsNamed(name, root)[0];
  if (found === undefined) throw new Error(`No button named ${name}.`);
  return found;
}

/** The rail draws 100 Hunk links at a time, so a far hunk is reached through Show more hunks. */
function railHunk(name: string): HTMLElement {
  while (buttonsNamed(name).length === 0) {
    fireEvent.click(buttonNamed('Show more hunks'));
  }
  return buttonNamed(name);
}

function headingOf(element: Element | null): string {
  return element?.querySelector('h3')?.textContent ?? '';
}

function lineRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('tr.diff-line'));
}

describe('LIMITS-JOURNEY a 600 hunk file', () => {
  it(
    'LIMITS-600-WINDOW draws 100 cards, keeps the full count and offers the next 100',
    SLOW,
    () => {
      load(manyHunkDiff('src/big.ts', 600));

      expect(articles()).toHaveLength(100);
      expect(screen.getByText('0 of 600 hunks decided')).toBeTruthy();
      expect(screen.getByText('Showing 100 of 600 hunks in this file.')).toBeTruthy();
      expect(screen.getAllByText(/^Heuristic review aid\./)).toHaveLength(1);
      expect(document.querySelector('main')?.lastElementChild?.textContent).toBe(
        'Heuristic review aid. A flag is not a finding, and no flags does not mean the change is correct.',
      );

      fireEvent.click(buttonNamed('Show next 100 hunks (500 remaining)'));

      expect(articles()).toHaveLength(200);
      expect(document.activeElement).toBe(articles()[100]);
      expect(headingOf(document.activeElement)).toMatch(/^Hunk 101 of 600, /);
    },
  );

  it(
    'LIMITS-600-RAIL a rail button for a hunk beyond the window draws it and focuses it',
    SLOW,
    () => {
      load(manyHunkDiff('src/big.ts', 600));

      fireEvent.click(railHunk('Hunk 450'));

      expect(articles()).toHaveLength(500);
      expect(headingOf(document.activeElement)).toMatch(/^Hunk 450 of 600, /);
      expect(document.activeElement?.tagName).toBe('ARTICLE');
      expect(document.activeElement?.getAttribute('aria-current')).toBe('true');
    },
  );

  it('LIMITS-600-KEYS j and k walk across a window edge with nothing missing', SLOW, () => {
    load(manyHunkDiff('src/big.ts', 600));
    fireEvent.click(buttonNamed('Hunk 100'));
    expect(articles()).toHaveLength(100);

    press('j');

    expect(articles()).toHaveLength(200);
    expect(headingOf(document.activeElement)).toMatch(/^Hunk 101 of 600, /);
    press('k');
    expect(headingOf(document.activeElement)).toMatch(/^Hunk 100 of 600, /);
    expect(articles()).toHaveLength(200);
  });

  it(
    'LIMITS-600-ADVANCE approve on the last drawn hunk advances into the next window',
    SLOW,
    () => {
      load(manyHunkDiff('src/big.ts', 250));
      fireEvent.click(buttonNamed('Hunk 100'));
      expect(articles()).toHaveLength(100);

      press('a');

      expect(headingOf(document.activeElement)).toMatch(/^Hunk 101 of 250, /);
      expect(articles()).toHaveLength(200);
      expect(screen.getByText('1 of 250 hunks decided')).toBeTruthy();
    },
  );

  it('LIMITS-600-FULL-DATA decides a hunk that was never drawn and counts it', SLOW, () => {
    load(manyHunkDiff('src/big.ts', 600));
    fireEvent.click(railHunk('Hunk 450'));
    const card = document.activeElement as HTMLElement;

    press('a');

    expect(screen.getByText('1 of 600 hunks decided')).toBeTruthy();
    expect(buttonNamed('Approve', card).getAttribute('aria-pressed')).toBe('true');
  });

  it('LIMITS-600-GO-TO-FIRST draws an undrawn hunk named by an export warning', SLOW, () => {
    load(manyHunkDiff('src/big.ts', 600));
    fireEvent.click(railHunk('Hunk 450'));
    press('r');
    press('Escape');
    fireEvent.click(buttonNamed('Hunk 3'));
    fireEvent.click(buttonNamed('Hunk 1'));
    expect(headingOf(document.activeElement)).toMatch(/^Hunk 1 of 600, /);

    fireEvent.click(buttonNamed('Export', document.querySelector('header') ?? document));
    const dialog = document.querySelector<HTMLElement>('dialog[open]');
    const notes = dialog?.querySelector('aside');
    const rejected = Array.from(notes?.querySelectorAll('li') ?? []).find((item) =>
      item.textContent.startsWith('Rejected hunks without a comment'),
    );
    fireEvent.click(buttonNamed('Go to first', rejected));

    expect(headingOf(document.activeElement)).toMatch(/^Hunk 450 of 600, /);
  });
});

describe('LIMITS-JOURNEY big hunks, long lines and folded files', () => {
  it(
    'LIMITS-5000-FOLD folds a 5,000 line file, keeps its toolbar and pages it by 500',
    SLOW,
    () => {
      load(longHunkDiff('src/long.ts', 5000));

      expect(lineRows()).toHaveLength(0);
      expect(buttonsNamed('Approve')).toHaveLength(1);
      fireEvent.click(buttonNamed('Show diff (5000 lines)'));

      expect(lineRows()).toHaveLength(500);
      expect(document.activeElement).toBe(lineRows()[0]);
      expect(buttonsNamed('Show next 500 lines (4500 remaining)')).toHaveLength(1);

      fireEvent.click(buttonNamed('Show all 4500 remaining lines'));

      expect(lineRows()).toHaveLength(5000);
      expect(document.activeElement).toBe(lineRows()[500]);
    },
  );

  it('LIMITS-5000-TOOLBAR keeps Approve working while the hunk is folded or paged', SLOW, () => {
    load(longHunkDiff('src/long.ts', 1500));

    fireEvent.click(buttonNamed('Approve'));
    expect(screen.getByText('1 of 1 hunks decided')).toBeTruthy();
    fireEvent.click(buttonNamed('Show diff (1500 lines)'));
    expect(document.querySelector('.diff-paging')).not.toBeNull();
    fireEvent.click(buttonNamed('Clear decision'));
    expect(screen.getByText('0 of 1 hunks decided')).toBeTruthy();
  });

  it('LIMITS-LONGLINE cuts a 100,000 character line and restores it on request', SLOW, () => {
    const text = longLine(100_000);
    load(oneLineDiff('src/minified.ts', text));

    expect(document.querySelector('td.diff-code code')?.textContent).toHaveLength(1000);
    fireEvent.click(buttonNamed('Show 99000 more characters'));

    expect(document.querySelector('td.diff-code code')?.textContent).toBe(text);
    expect(document.activeElement).toBe(document.querySelector('td.diff-code'));
  });

  it(
    'LIMITS-GENERATED folds a lock file by default and opens only the hunk you move to',
    SLOW,
    () => {
      load(`${manyHunkDiff('src/a.ts', 1)}${manyHunkDiff('package-lock.json', 3)}`);

      expect(articles()).toHaveLength(4);
      expect(document.querySelectorAll('table')).toHaveLength(1);
      expect(buttonsNamed('Show diff (3 lines)')).toHaveLength(3);

      press('j');

      expect(headingOf(document.activeElement)).toMatch(/^Hunk 2 of 4, /);
      expect(document.querySelectorAll('table')).toHaveLength(2);
      expect(buttonsNamed('Show diff (3 lines)')).toHaveLength(2);
    },
  );

  it('LIMITS-FOLD-SMALL does not fold a 999 line file', SLOW, () => {
    load(longHunkDiff('src/just-under.ts', 999));

    expect(document.querySelector('.diff-folded')).toBeNull();
    expect(lineRows()).toHaveLength(500);
  });
});
