import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  adapterOver,
  newAreas,
  pasteAndLoad,
  renderApp,
  resetBrowserState,
  smallDiff,
  statusLine,
  stubDialogs,
} from './journeyHelpers';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  resetBrowserState();
});

const RLO = String.fromCodePoint(0x202e);

/** The first hunk header promises five old lines and the body has two. */
function truncatedDiff(): string {
  return [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,5 +1,6 @@',
    ' one',
    '-two',
    '+TWO',
    '',
  ].join('\n');
}

function fenced(text: string): string {
  return ['```diff', text.trimEnd(), '```', ''].join('\n');
}

function banner(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Parse warnings' });
}

function openExport(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /^Export/ }));
  const dialog = document.querySelector<HTMLElement>('dialog[open]');
  if (dialog === null) throw new Error('Export did not open.');
  return dialog;
}

describe('IN-WARN-BANNER parse warnings reach the screen', () => {
  it('announces the warning count after the load line', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(truncatedDiff());
    expect(statusLine()).toBe('Loaded 1 files, 1 hunks. 1 warning.');
  });

  it('adds no warning count when the diff parsed cleanly', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(smallDiff());
    expect(statusLine()).toBe('Loaded 2 files, 2 hunks.');
    expect(banner()).toBeNull();
  });

  it('shows a labelled banner with the count and a Parse report disclosure', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(truncatedDiff());
    const region = banner();
    if (region === null) throw new Error('No parse banner.');
    expect(within(region).getByText(/^1 warning in this diff\./)).toBeTruthy();
    const summary = within(region).getByText('Parse report');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.parentElement?.hasAttribute('open')).toBe(false);
    expect(region.textContent).toContain('expected 5/6, found 2/2');
    expect(region.textContent).toContain('src/a.ts');
    expect(region.textContent).toContain('Line 4');
  });

  it('keeps informational items inside the disclosure and out of the banner count', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(fenced(smallDiff()));
    expect(statusLine()).toBe('Loaded 2 files, 2 hunks.');
    const region = banner();
    if (region === null) throw new Error('No parse report.');
    expect(region.textContent).not.toMatch(/warnings? in this diff/);
    expect(within(region).getByText('Note.')).toBeTruthy();
    expect(within(region).queryByText('Warning.')).toBeNull();
  });

  it('draws warning samples through SafeText, so a bidi character becomes a visible chip', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(smallDiff().replace("'one'", `'a${RLO}b'`));
    const region = banner();
    if (region === null) throw new Error('No parse banner.');
    expect(document.body.innerHTML).not.toContain(RLO);
    expect(within(region).getAllByRole('img', { name: /U\+202E/ }).length).toBeGreaterThan(0);
  });

  it('keeps the banner after a reload, because the warnings are parsed again', () => {
    const areas = newAreas();
    const first = renderApp(adapterOver(areas));
    pasteAndLoad(truncatedDiff());
    first.unmount();
    renderApp(adapterOver(areas));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(banner()?.textContent).toContain('1 warning in this diff.');
  });
});

describe('IN-WARN-EXPORT parse notes reach the export', () => {
  it('lists Parse notes before sending and writes them into the Markdown summary', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(truncatedDiff());
    const dialog = openExport();
    expect(within(dialog).getByText('Parse notes: 1')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Markdown summary' }));
    const preview = within(dialog).getByRole<HTMLTextAreaElement>('textbox', {
      name: 'Export preview',
    });
    expect(preview.value).toContain('## Parse notes');
    expect(preview.value).toContain('expected 5/6, found 2/2');
  });

  it('leaves Parse notes out when only informational items exist', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(fenced(smallDiff()));
    const dialog = openExport();
    expect(within(dialog).queryByText(/^Parse notes/)).toBeNull();
  });

  it('Go to first for Parse notes opens the parse report and focuses it', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(truncatedDiff());
    const dialog = openExport();
    const item = within(dialog).getByText('Parse notes: 1').closest('li');
    if (item === null) throw new Error('No parse notes row.');
    fireEvent.click(within(item).getByRole('button', { name: 'Go to first' }));
    const summary = screen.getByText('Parse report');
    expect(summary.parentElement?.hasAttribute('open')).toBe(true);
    expect(document.activeElement).toBe(summary);
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});
