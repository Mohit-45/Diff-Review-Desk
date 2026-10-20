import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KEYMAP } from './keymap';
import { App } from './App';
import { immediateFrame } from './frameFixtures';

beforeAll(() => {
  // jsdom has no modal dialog support. These stubs behave like the browser: close()
  // fires a close event, which is also what native Esc produces.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  cleanup();
  // The app now saves progress, so a review must not leak into the next test's first render.
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function loadSampleOne(): void {
  render(
    <StrictMode>
      <App frame={immediateFrame} />
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
}

function articles(): HTMLElement[] {
  return screen.getAllByRole('article');
}

function article(index: number): HTMLElement {
  const found = articles()[index];
  if (found === undefined) throw new Error(`No article ${String(index)}`);
  return found;
}

function press(key: string, init: KeyboardEventInit = {}, target?: Element): void {
  fireEvent.keyDown(target ?? document.activeElement ?? document.body, { key, ...init });
}

function announced(): string {
  return document.querySelector('main .status-line')?.textContent ?? '';
}

function openDialog(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  if (dialog === null) throw new Error('No dialog is open');
  return dialog;
}

/** What the browser does on Esc: close the modal dialog and report it. */
function nativeEscape(): void {
  act(() => {
    openDialog().close();
  });
}

function heading(element: HTMLElement): string {
  return element.querySelector('h2')?.textContent ?? '';
}

describe('roving focus and navigation keys', () => {
  it('KB-ROVING focuses the first pending hunk after load with exactly one tab stop', () => {
    loadSampleOne();

    expect(articles()).toHaveLength(11);
    expect(document.activeElement).toBe(article(0));
    expect(articles().filter((card) => card.tabIndex === 0)).toHaveLength(1);
    expect(articles().filter((card) => card.getAttribute('aria-current') === 'true')).toEqual([
      article(0),
    ]);
  });

  it('KB-J moves the current hunk and focuses it, then a approves it and advances', () => {
    loadSampleOne();

    press('j');
    expect(article(1).getAttribute('aria-current')).toBe('true');
    expect(article(0).getAttribute('aria-current')).toBeNull();
    expect(article(1).tabIndex).toBe(0);
    expect(article(0).tabIndex).toBe(-1);
    expect(document.activeElement).toBe(article(1));

    press('a');
    expect(
      within(article(1)).getByRole('button', { name: 'Approve' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(within(article(1)).getByText('Approved')).toBeTruthy();
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(2));
    expect(article(2).getAttribute('aria-current')).toBe('true');
    expect(announced()).toBe('Hunk 2 approved. 10 pending.');
  });

  it('KB-JK-BOUNDS does not wrap and announces only when nothing moved', () => {
    loadSampleOne();

    press('k');
    expect(announced()).toBe('First hunk');
    expect(document.activeElement).toBe(article(0));

    for (let step = 0; step < 10; step += 1) press('j');
    expect(document.activeElement).toBe(article(10));
    press('j');
    expect(announced()).toBe('Last hunk');
    expect(document.activeElement).toBe(article(10));
  });

  it('KB-NP walks pending hunks, wraps and announces the result', () => {
    loadSampleOne();

    press('a');
    expect(document.activeElement).toBe(article(1));
    press('p');
    expect(document.activeElement).toBe(article(10));
    expect(announced()).toBe('Wrapped to pending hunk 11 of 11.');
    press('n');
    expect(document.activeElement).toBe(article(1));
    expect(announced()).toBe('Wrapped to pending hunk 2 of 11.');
    press('n');
    expect(document.activeElement).toBe(article(2));
    expect(announced()).toBe('Moved to pending hunk 3 of 11.');
  });

  it('KB-BRACKETS walks files with ] and [ and announces the ends', () => {
    loadSampleOne();
    const firstFile = heading(article(0));

    press(']');
    expect(heading(article(4))).not.toBe(firstFile);
    expect(document.activeElement).toBe(article(4));
    press('[');
    expect(document.activeElement).toBe(article(0));
    press('[');
    expect(announced()).toBe('First file');
  });

  it('KB-SCROLL scrolls the target into view without smooth behaviour', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      loadSampleOne();
      press('j');
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', behavior: 'auto' });
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
});

describe('decision keys', () => {
  it('KB-ARU sets with a and r, never toggles, and clears with u without advancing', () => {
    loadSampleOne();

    press('a');
    press('k');
    press('a');
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(1));

    press('k');
    press('u');
    expect(within(article(0)).getByText('Pending')).toBeTruthy();
    expect(screen.getByText('0 of 11 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(0));
    expect(announced()).toBe('Hunk 1 cleared. 11 pending.');
  });

  it('KB-REJECT opens the comment editor on r without advancing, and typed letters are not shortcuts', () => {
    loadSampleOne();

    press('r');
    const editor = screen.getByLabelText(/^Comment for the AI agent on hunk 1 of 11 in /);
    expect(document.activeElement).toBe(editor);
    expect(
      within(article(0)).getByRole('button', { name: 'Reject' }).getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.change(editor, { target: { value: 'jkna' } });
    for (const key of ['j', 'k', 'n', 'a', 'r', 'u', 'e']) press(key, {}, editor);
    expect(article(0).getAttribute('aria-current')).toBe('true');
    expect(screen.queryByRole('heading', { name: 'Export review' })).toBeNull();
    expect((editor as HTMLTextAreaElement).value).toBe('jkna');
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
  });

  it('KB-COMMIT commits the comment on Ctrl+Enter and advances to the next pending hunk', () => {
    loadSampleOne();

    press('r');
    const editor = screen.getByLabelText(/^Comment for the AI agent on hunk 1 of 11 in /);
    fireEvent.change(editor, { target: { value: 'Restore the guard' } });
    press('Enter', { ctrlKey: true }, editor);

    expect(screen.queryByLabelText(/^Comment for the AI agent/)).toBeNull();
    expect(within(article(0)).getByText('Restore the guard')).toBeTruthy();
    expect(document.activeElement).toBe(article(1));
  });

  it('KB-ESC-EDITOR keeps the comment on Esc and returns focus to that hunk Comment button', () => {
    loadSampleOne();

    press('c');
    const editor = screen.getByLabelText(/^Comment for the AI agent on hunk 1 of 11 in /);
    fireEvent.change(editor, { target: { value: 'Check this' } });
    press('Escape', {}, editor);

    expect(within(article(0)).getByText('Check this')).toBeTruthy();
    expect(document.activeElement).toBe(
      within(article(0)).getByRole('button', { name: /^Comment/ }),
    );
  });

  it('KB-DONE-BUTTON commits through Done and advances like Ctrl+Enter', () => {
    loadSampleOne();

    press('c');
    fireEvent.change(screen.getByLabelText(/^Comment for the AI agent/), {
      target: { value: 'Needs a test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(within(article(0)).getByText('Needs a test')).toBeTruthy();
    expect(document.activeElement).toBe(article(1));
  });

  it('KB-COLLAPSE collapses and expands the current hunk with o', () => {
    loadSampleOne();
    const before = screen.getAllByRole('table').length;

    press('o');
    expect(screen.getAllByRole('table')).toHaveLength(before - 1);
    expect(within(article(0)).getByRole('button', { name: /^Expand hunk/ })).toBeTruthy();
    press('o');
    expect(screen.getAllByRole('table')).toHaveLength(before);
  });
});

describe('undo and redo', () => {
  it('KB-UNDO-REDO undoes and redoes with Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y and focuses the hunk', () => {
    loadSampleOne();
    press('a');
    expect(document.activeElement).toBe(article(1));

    press('z', { ctrlKey: true });
    expect(screen.getByText('0 of 11 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(0));
    expect(announced()).toBe('Undid a change to hunk 1. It is now pending.');

    press('Z', { ctrlKey: true, shiftKey: true });
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(0));

    press('z', { metaKey: true });
    press('y', { ctrlKey: true });
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    press('y', { ctrlKey: true });
    expect(announced()).toBe('Nothing to redo.');
  });

  it('KB-UNDO-BUTTONS exposes Undo and Redo in the header that work with the same history', () => {
    loadSampleOne();
    press('a');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('0 of 11 hunks decided')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(announced()).toBe('Nothing to redo.');
  });

  it('KB-UNDO-TEXT leaves Ctrl+Z to the text field while the comment editor is focused', () => {
    loadSampleOne();
    press('a');
    press('c');
    const editor = screen.getByLabelText(/^Comment for the AI agent on hunk 2 of 11/);

    press('z', { ctrlKey: true }, editor);

    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
  });
});

describe('dialogs', () => {
  it('KB-DIALOGS opens Export, Help, Load and Settings with e ? l s and returns focus to the hunk', () => {
    loadSampleOne();
    const cases: readonly (readonly [string, string])[] = [
      ['e', 'Export review'],
      ['?', 'Shortcuts and help'],
      ['l', 'Load a diff'],
      ['s', 'Settings'],
    ];

    for (const [key, title] of cases) {
      press(key);
      expect(within(openDialog()).getByRole('heading', { level: 2, name: title })).toBeTruthy();
      nativeEscape();
      expect(document.querySelector('dialog[open]')).toBeNull();
      expect(document.activeElement).toBe(article(0));
    }
  });

  it('KB-DIALOG-OPEN ignores shortcuts while a dialog is open and works again after Esc', () => {
    loadSampleOne();

    press('e');
    expect(document.querySelector('dialog[open]')).not.toBeNull();
    press('j', {}, article(0));
    press('a', {}, article(0));
    expect(article(0).getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('0 of 11 hunks decided')).toBeTruthy();

    nativeEscape();
    press('j');
    expect(document.activeElement).toBe(article(1));
  });

  it('KB-DIALOG-FOCUS returns focus to the header button that opened the dialog', () => {
    loadSampleOne();
    const settings = screen.getByRole('button', { name: 'Settings' });
    settings.focus();

    fireEvent.click(settings);
    expect(document.activeElement?.tagName).toBe('H2');
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Close' }));

    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(settings);
  });

  it('KB-HELP-TABLE renders every KEYMAP row in the help dialog', () => {
    loadSampleOne();
    press('?');

    const dialog = openDialog();
    for (const row of KEYMAP) {
      expect(within(dialog).getByText(row.help)).toBeTruthy();
    }
  });
});

describe('demo script', () => {
  it('DEMO-SCRIPT runs the j a r comment Ctrl+Enter n e l path from docs/DEMO.md in the real app', () => {
    loadSampleOne();

    for (const key of ['j', 'a', 'j', 'a', 'j', 'j', 'a']) press(key);
    expect(screen.getByText('3 of 11 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(7));

    press('r');
    const editor = screen.getByLabelText(/^Comment for the AI agent on hunk 8 of 11 in /);
    fireEvent.change(editor, { target: { value: 'Restore the failing assertion' } });
    press('Enter', { ctrlKey: true }, editor);
    expect(document.activeElement).toBe(article(8));
    press('n');
    expect(document.activeElement).toBe(article(9));
    expect(screen.getByText('4 of 11 hunks decided')).toBeTruthy();

    press('e');
    const preview = within(openDialog()).getByLabelText('Export preview');
    expect((preview as HTMLTextAreaElement).value).toContain('Restore the failing assertion');
    nativeEscape();

    press('l');
    const samples = within(openDialog()).getAllByRole('button', {
      name: 'Sample: agent run 2, after fixes',
    });
    fireEvent.click(samples[samples.length - 1] as HTMLElement);
    // Decided hunks are byte-identical in sample 2, so the load asks what to do with them.
    fireEvent.click(within(openDialog()).getByRole('radio', { name: 'Start new review' }));
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Start new review' }));
    expect(screen.getByText('0 of 9 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(0));
  });
});

describe('keymap coverage', () => {
  it('KB-ROW-BUTTONS gives every non-contextual KEYMAP row a labelled control in the UI', () => {
    loadSampleOne();
    press('a');

    for (const row of KEYMAP.filter((candidate) => !candidate.contextual)) {
      const label = row.buttonLabel ?? '';
      const control =
        row.id === 'path-filter'
          ? screen.queryAllByLabelText(label)
          : screen.queryAllByRole('button', { name: label });
      expect(control.length, `${row.id} needs a control labelled ${label}`).toBeGreaterThan(0);
    }
  });
});

describe('guards', () => {
  it('RV-HELD-KEY ignores a repeated a, r, u and c but lets j repeat', () => {
    loadSampleOne();

    press('a', { repeat: true });
    press('r', { repeat: true });
    press('c', { repeat: true });
    expect(screen.getByText('0 of 11 hunks decided')).toBeTruthy();
    expect(screen.queryByLabelText(/^Comment for the AI agent/)).toBeNull();

    press('j', { repeat: true });
    press('j', { repeat: true });
    expect(document.activeElement).toBe(article(2));
  });

  it('KB-PREVENT-DEFAULT prevents the browser default only for handled keys', () => {
    loadSampleOne();

    expect(fireEvent.keyDown(document.activeElement ?? document.body, { key: 'j' })).toBe(false);
    expect(fireEvent.keyDown(document.activeElement ?? document.body, { key: 'x' })).toBe(true);
    expect(
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'j', ctrlKey: true }),
    ).toBe(true);
  });

  it('KB-SCOPE ignores keys when focus is in the header, outside nav and main', () => {
    loadSampleOne();
    const header = screen.getByRole('button', { name: 'Undo' });
    header.focus();

    press('j', {}, header);

    expect(article(0).getAttribute('aria-current')).toBe('true');
  });

  it('KB-HINTS shows key hints beside buttons only while shortcuts are on', () => {
    loadSampleOne();
    expect(document.querySelectorAll('kbd.key-hint').length).toBeGreaterThan(10);
    expect(within(article(0)).getByRole('button', { name: 'Approve' })).toBeTruthy();
  });
});

describe('filters and empty states', () => {
  it('RV-NO-PENDING announces when nothing is pending and shows the all-decided panel with Export', () => {
    loadSampleOne();

    for (let count = 0; count < 11; count += 1) press('a');
    expect(announced()).toBe('Hunk 11 approved. All 11 hunks decided.');
    expect(screen.getByText('11 of 11 hunks decided')).toBeTruthy();
    const panel = screen.getByRole('region', { name: 'Review complete' });
    expect(within(panel).getByText('All 11 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(10));

    press('n');
    expect(announced()).toBe('No pending hunks. All 11 hunks are decided.');
    expect(document.activeElement).toBe(article(10));
    expect(document.activeElement).not.toBe(document.body);

    fireEvent.click(within(panel).getByRole('button', { name: 'Export review' }));
    expect(within(openDialog()).getByRole('heading', { name: 'Export review' })).toBeTruthy();
  });

  it('RV-FILTER-EMPTY announces hidden pending hunks, offers Clear filters and refocuses the path field', () => {
    loadSampleOne();

    const path = screen.getByLabelText('Path');
    fireEvent.change(path, { target: { value: 'zzz-no-such-file' } });
    const notice = screen.getByRole('region', { name: 'No matching hunks' });
    expect(within(notice).getByText('No hunks match the current filters.')).toBeTruthy();
    expect(articles()).toHaveLength(1);

    press('n', {}, article(0));
    expect(announced()).toBe('11 pending hunks are hidden by the current filters.');
    expect(document.activeElement).toBe(article(0));

    fireEvent.click(within(notice).getByRole('button', { name: 'Clear filters' }));
    expect(articles()).toHaveLength(11);
    expect(screen.queryByRole('region', { name: 'No matching hunks' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Path'));
  });

  it('KB-FILTER-APPLIES renders only matching hunks and pins the current one until you navigate away', () => {
    loadSampleOne();
    press('j');
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'package.json' } });

    const names = articles().map(heading);
    expect(names.some((name) => name === 'package.json')).toBe(true);
    expect(articles().some((card) => card.getAttribute('aria-current') === 'true')).toBe(true);
    const pinnedCount = articles().length;

    press('j', {}, articles()[0]);
    expect(articles().length).toBeLessThanOrEqual(pinnedCount);
    expect(document.activeElement?.getAttribute('aria-current')).toBe('true');
  });

  it('KB-SLASH focuses the path filter, first Esc clears it and the second Esc returns to the hunk', () => {
    loadSampleOne();

    press('/');
    const path = screen.getByLabelText('Path');
    expect(document.activeElement).toBe(path);
    fireEvent.change(path, { target: { value: 'src' } });
    press('Escape', {}, path);
    expect((path as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(path);
    press('Escape', {}, path);
    expect(document.activeElement).toBe(article(0));
  });
});

describe('shortcuts off', () => {
  function turnShortcutsOff(): void {
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(within(openDialog()).getByRole('checkbox', { name: 'Single-key shortcuts' }));
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Close' }));
  }

  it('SC-2-1-4 drives open, navigate, approve, reject with comment and export with buttons only', () => {
    loadSampleOne();
    turnShortcutsOff();
    expect(document.querySelectorAll('kbd.key-hint')).toHaveLength(0);

    press('j', {}, article(0));
    expect(article(0).getAttribute('aria-current')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Next hunk' }));
    expect(document.activeElement).toBe(article(1));
    fireEvent.click(within(article(1)).getByRole('button', { name: 'Approve' }));
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(article(1).getAttribute('aria-current')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Next pending' }));
    expect(document.activeElement).toBe(article(2));
    fireEvent.click(within(article(2)).getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText(/^Comment for the AI agent on hunk 3 of 11/), {
      target: { value: 'Rework this' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(within(article(2)).getByText('Rework this')).toBeTruthy();
    expect(screen.getByText('2 of 11 hunks decided')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(document.activeElement).toBe(article(4));
    fireEvent.click(screen.getByRole('button', { name: 'Previous file' }));
    expect(document.activeElement).toBe(article(0));

    const exportButton = screen.getByRole('button', { name: 'Export' });
    exportButton.focus();
    fireEvent.click(exportButton);
    expect(within(openDialog()).getByRole('heading', { name: 'Export review' })).toBeTruthy();
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(exportButton);
  });

  it('KB-AUTO-ADVANCE-OFF keeps focus on the approved hunk when advance after decision is off', () => {
    loadSampleOne();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(
      within(openDialog()).getByRole('checkbox', { name: 'Advance after each decision' }),
    );
    nativeEscape();

    press('a', {}, article(0));

    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(0));
  });

  it('KB-FILE-LIST selects a file and a hunk from the rail', () => {
    loadSampleOne();
    const list = screen.getByRole('navigation', { name: 'Changed files' });

    fireEvent.click(
      within(list).getAllByRole('button', { name: /package\.json/ })[0] as HTMLElement,
    );

    expect(document.activeElement).toBe(article(4));
  });
});
