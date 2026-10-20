import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { materialize } from '../../samples/fakeSecrets';
import { REVIEW_KEY_PREFIX } from '../../storage/keys';
import {
  FIXED_NOW,
  adapterOver,
  articles,
  fixedClock,
  keysOf,
  newAreas,
  pasteAndLoad,
  rememberingAdapter,
  renderApp,
  resetBrowserState,
  smallDiff,
  stubDialogs,
} from './journeyHelpers';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  resetBrowserState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const SLUG = 'src-a-ts-and-1-more';

function rejectHunk(index: number, comment = ''): void {
  const button = screen.getAllByRole('button', { name: 'Reject' })[index];
  if (button === undefined) throw new Error('No Reject button.');
  fireEvent.click(button);
  if (comment !== '') {
    fireEvent.change(screen.getByRole('textbox', { name: /^Comment for the AI agent/ }), {
      target: { value: comment },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
}

function openExport(): HTMLElement {
  // The header button comes first; a finished review adds an "Export review" button below it.
  const opener = screen.getAllByRole('button', { name: /^Export/ })[0];
  if (opener === undefined) throw new Error('No Export button.');
  fireEvent.click(opener);
  const dialog = document.querySelector<HTMLElement>('dialog[open]');
  if (dialog === null) throw new Error('Export did not open.');
  return dialog;
}

function closeDialog(): void {
  act(() => {
    document.querySelector<HTMLDialogElement>('dialog[open]')?.close();
  });
}

function noteField(dialog: HTMLElement): HTMLTextAreaElement {
  return within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: 'Overall note' });
}

function previewText(dialog: HTMLElement): string {
  return within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: 'Export preview' }).value;
}

/** Records the file name each download would have. */
function captureDownloads(): string[] {
  const names: string[] = [];
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: () => undefined,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

function typeNote(dialog: HTMLElement, text: string): void {
  fireEvent.change(noteField(dialog), { target: { value: text } });
}

function storedRecord(areas: ReturnType<typeof newAreas>): { overallNote: string } {
  const [key] = keysOf(areas.local, REVIEW_KEY_PREFIX);
  const raw = key === undefined ? null : areas.local.getItem(key);
  if (raw === null) throw new Error('No stored review.');
  return JSON.parse(raw) as { overallNote: string };
}

describe('EX-FILENAME exports carry the time they were made', () => {
  it('names the downloads with the clock and writes the ISO time into the summary', () => {
    const names = captureDownloads();
    renderApp(adapterOver(newAreas()), fixedClock());
    pasteAndLoad(smallDiff());
    rejectHunk(0, 'Needs work.');
    const dialog = openExport();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Markdown summary' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download' }));

    expect(names).toEqual([
      `agent-feedback-${SLUG}-r1-20261020-0905.md`,
      `review-${SLUG}-r1-20261020-0905.md`,
    ]);
    expect(previewText(dialog)).toContain(`- Generated: ${FIXED_NOW}`);
    expect(previewText(dialog)).not.toContain('unspecified');
  });

  it('reads the clock when the dialog opens and holds it while the dialog stays open', () => {
    const names = captureDownloads();
    let now = '2026-10-20T09:05:00.000Z';
    renderApp(adapterOver(newAreas()), () => now);
    pasteAndLoad(smallDiff());
    rejectHunk(0, 'Needs work.');
    const dialog = openExport();

    now = '2026-10-20T10:07:00.000Z';
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Markdown summary' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    closeDialog();
    openExport();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download' }));

    expect(names).toEqual([
      `review-${SLUG}-r1-20261020-0905.md`,
      `review-${SLUG}-r1-20261020-1007.md`,
    ]);
  });

  it('stamps saved records with the same injected clock', () => {
    const areas = newAreas();
    renderApp(adapterOver(areas), fixedClock());
    pasteAndLoad(smallDiff());
    const [key] = keysOf(areas.local, REVIEW_KEY_PREFIX);
    expect(key).toBeDefined();
    expect(areas.local.getItem(key ?? '')).toContain(`"updatedAt":"${FIXED_NOW}"`);
  });
});

describe('EX-OVERALL-NOTE the note belongs to the review', () => {
  it('saves the note on blur, with secrets redacted, and brings it back after a reload', () => {
    const areas = newAreas();
    const first = renderApp(rememberingAdapter(areas), fixedClock());
    pasteAndLoad(smallDiff());
    rejectHunk(0, 'Needs work.');
    const dialog = openExport();
    const secret = materialize('{{FAKE:aws-key}}');
    typeNote(dialog, 'Ship after the fix.');
    expect(storedRecord(areas).overallNote).toBe('');
    fireEvent.blur(noteField(dialog));
    expect(storedRecord(areas).overallNote).toBe('Ship after the fix.');
    expect(previewText(dialog)).toContain('Ship after the fix.');

    typeNote(dialog, `Ship after the fix. Key ${secret}`);
    fireEvent.blur(noteField(dialog));
    const stored = JSON.stringify(storedRecord(areas));
    expect(stored).not.toContain(secret);
    expect(stored).toContain('[REDACTED:');
    first.unmount();

    renderApp(adapterOver(areas), fixedClock());
    const again = openExport();
    expect(noteField(again).value).toContain('Ship after the fix.');
  });

  it('commits when Esc closes the dialog and when Close is pressed', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas), fixedClock());
    pasteAndLoad(smallDiff());
    rejectHunk(0, 'Needs work.');
    const dialog = openExport();
    typeNote(dialog, 'Escaped.');
    fireEvent.keyDown(noteField(dialog), { key: 'Escape' });
    expect(storedRecord(areas).overallNote).toBe('Escaped.');
    closeDialog();

    const reopened = openExport();
    typeNote(reopened, 'Closed.');
    fireEvent.click(within(reopened).getByRole('button', { name: 'Close' }));
    expect(storedRecord(areas).overallNote).toBe('Closed.');
  });

  it('is one undo step per edit, however many keystrokes it took', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas), fixedClock());
    pasteAndLoad(smallDiff());
    rejectHunk(0, 'Needs work.');
    const dialog = openExport();
    for (const text of ['a', 'ab', 'abc']) typeNote(dialog, text);
    fireEvent.blur(noteField(dialog));
    closeDialog();

    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(storedRecord(areas).overallNote).toBe('');
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    const reopened = openExport();
    expect(noteField(reopened).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /^Redo/ }));
    expect(storedRecord(areas).overallNote).toBe('abc');
    expect(noteField(reopened).value).toBe('abc');
  });

  it('writes nothing for a note that was only focused', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas), fixedClock());
    pasteAndLoad(smallDiff());
    rejectHunk(0, 'Needs work.');
    const dialog = openExport();
    areas.local.calls.length = 0;
    fireEvent.blur(noteField(dialog));
    expect(areas.local.calls).toEqual([]);
  });
});

describe('EX-GO-TO-FIRST redactions lead somewhere real', () => {
  it('focuses the first hunk whose comment holds a redaction', () => {
    renderApp(adapterOver(newAreas()), fixedClock());
    pasteAndLoad(smallDiff());
    rejectHunk(0, 'Needs work.');
    rejectHunk(1, `Do not log ${materialize('{{FAKE:aws-key}}')}.`);
    const dialog = openExport();
    const item = within(dialog).getByText('Redactions applied: 1').closest('li');
    if (item === null) throw new Error('No redactions row.');

    fireEvent.click(within(item).getByRole('button', { name: 'Go to first' }));

    expect(document.activeElement).toBe(articles()[1]);
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('says where the text is when no hunk holds it', () => {
    renderApp(adapterOver(newAreas()), fixedClock());
    pasteAndLoad(smallDiff());
    rejectHunk(0, 'Needs work.');
    const dialog = openExport();
    typeNote(dialog, `Key ${materialize('{{FAKE:aws-key}}')}`);
    const item = within(dialog).getByText('Redactions applied: 1').closest('li');
    if (item === null) throw new Error('No redactions row.');

    fireEvent.click(within(item).getByRole('button', { name: 'Go to first' }));

    expect(
      screen.getByText(
        'No hunk holds the redacted text. It is in the review label, the overall note or a file path.',
      ),
    ).toBeTruthy();
    expect(document.activeElement).not.toBe(document.body);
  });
});
