import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  adapterOver,
  articles,
  newAreas,
  renderApp,
  resetBrowserState,
  statusLine,
  stubDialogs,
} from './journeyHelpers';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  resetBrowserState();
  document.querySelectorAll('[data-test-skip]').forEach((node) => {
    node.remove();
  });
});

function loadSampleOne(): void {
  renderApp(adapterOver(newAreas()));
  fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
}

function openDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('dialog[open]');
  if (dialog === null) throw new Error('No dialog is open.');
  return dialog;
}

function closeDialog(): void {
  fireEvent.click(within(openDialog()).getByRole('button', { name: 'Close' }));
}

describe('UI-DIALOG-NAME every native dialog is named by its h2', () => {
  it.each([
    [/^Load diff/, 'Load a diff'],
    [/^Export/, 'Export review'],
    [/^Settings/, 'Settings'],
    [/^Shortcuts and help/, 'Shortcuts and help'],
  ] as const)('opens %s as a dialog named %s', (opener, title) => {
    loadSampleOne();
    fireEvent.click(screen.getAllByRole('button', { name: opener })[0] as HTMLElement);
    const dialog = screen.getByRole('dialog', { name: title });
    const heading = within(dialog).getByRole('heading', { level: 2, name: title });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(dialog.getAttribute('aria-label')).toBeNull();
    // The name lives on the dialog; a second labelled region inside it would be a stray landmark.
    expect(within(dialog).queryByRole('region', { name: title })).toBeNull();
    expect(within(dialog).queryByRole('banner')).toBeNull();
  });
});

describe('UI-SKIP review skip links', () => {
  function addStaticSkipLink(): HTMLAnchorElement {
    const link = document.createElement('a');
    link.className = 'skip-link';
    link.setAttribute('href', '#main');
    link.dataset['testSkip'] = 'true';
    link.textContent = 'Skip to main content';
    document.body.prepend(link);
    return link;
  }

  function firstStops(count: number): string[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('button:not([hidden]), a[href]:not([hidden])'),
    )
      .slice(0, count)
      .map((element) => element.textContent);
  }

  it('makes Skip to changed files and Skip to diff the first two stops, as real controls', () => {
    const staticLink = addStaticSkipLink();
    loadSampleOne();
    expect(firstStops(2)).toEqual(['Skip to changed files', 'Skip to diff']);
    expect(staticLink.hidden).toBe(true);
    // Buttons, so activating one never writes a hash or a history entry.
    expect(document.querySelectorAll('a[href]:not([hidden])')).toHaveLength(0);
    for (const name of ['Skip to changed files', 'Skip to diff']) {
      expect(screen.getByRole('button', { name }).className).toContain('skip-link');
    }
  });

  it('puts the generic link back when the review screen goes away', () => {
    const staticLink = addStaticSkipLink();
    loadSampleOne();
    expect(staticLink.hidden).toBe(true);
    cleanup();
    expect(staticLink.hidden).toBe(false);
  });

  it('moves focus to the Changed files landmark without touching the URL', () => {
    loadSampleOne();
    const entries = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Skip to changed files' }));
    expect(document.activeElement).toBe(screen.getByRole('navigation', { name: 'Changed files' }));
    expect(window.location.hash).toBe('');
    expect(window.history.length).toBe(entries);
  });

  it('moves focus to the current hunk, and follows the current hunk after navigation', () => {
    loadSampleOne();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to diff' }));
    expect(document.activeElement).toBe(articles()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Next hunk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip to changed files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip to diff' }));
    expect(document.activeElement).toBe(articles()[1]);
    expect(window.location.hash).toBe('');
  });

  it('is the landing screen that keeps the generic Skip to main content link', () => {
    const staticLink = addStaticSkipLink();
    renderApp(adapterOver(newAreas()));
    expect(staticLink.hidden).toBe(false);
    expect(screen.queryByRole('button', { name: 'Skip to diff' })).toBeNull();
  });
});

describe('UI-CLEAR-CANCEL cancelling the clear-data confirmation hands focus on', () => {
  it('lands on the Clear all saved data button, not on body', () => {
    loadSampleOne();
    fireEvent.click(screen.getAllByRole('button', { name: /^Settings/ })[0] as HTMLElement);
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all saved data' }));
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Clear all saved data' }),
    );
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('UI-LOAD-DIALOG the Load dialog inside a review', () => {
  it('has a padded body with a header row holding the title and Close', () => {
    loadSampleOne();
    fireEvent.click(screen.getAllByRole('button', { name: /^Load diff/ })[0] as HTMLElement);
    const dialog = openDialog();
    const body = dialog.querySelector('.load-dialog');
    expect(body).not.toBeNull();
    const header = body?.querySelector('.dialog-header');
    expect(header?.querySelector('h2')?.textContent).toBe('Load a diff');
    expect(within(header as HTMLElement).getByRole('button', { name: 'Close' })).toBeTruthy();
    // The title is focused when the dialog opens, like the other dialogs.
    expect(document.activeElement).toBe(within(dialog).getByRole('heading', { level: 2 }));
  });

  it('does not show the status of an earlier load when it opens', () => {
    loadSampleOne();
    expect(statusLine()).toContain('Loaded 8 files, 11 hunks.');
    fireEvent.click(screen.getAllByRole('button', { name: /^Load diff/ })[0] as HTMLElement);
    expect(within(openDialog()).queryByText(/Loaded 8 files/)).toBeNull();
    closeDialog();
    fireEvent.click(screen.getAllByRole('button', { name: /^Load diff/ })[0] as HTMLElement);
    expect(within(openDialog()).queryByText(/Loaded 8 files/)).toBeNull();
  });

  it('shows a parse error inside the dialog and moves focus to its heading', () => {
    loadSampleOne();
    fireEvent.click(screen.getAllByRole('button', { name: /^Load diff/ })[0] as HTMLElement);
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText('Paste a unified diff'), {
      target: { value: 'not a diff at all' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Load diff' }));
    expect(within(dialog).getByRole('heading', { name: 'This does not look like a diff' })).toBe(
      document.activeElement,
    );
  });
});
