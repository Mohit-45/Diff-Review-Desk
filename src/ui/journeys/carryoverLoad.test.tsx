import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AGENT_RUN_2_DIFF } from '../../samples';
import { REVIEW_KEY_PREFIX } from '../../storage/adapter';
import { DEFAULT_PREFS } from '../../storage/validator';
import {
  adapterOver,
  articles,
  keysOf,
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

const EXTRA_FILE = [
  'diff --git a/docs/notes.md b/docs/notes.md',
  'index 8000000..8000001 100644',
  '--- a/docs/notes.md',
  '+++ b/docs/notes.md',
  '@@ -1,1 +1,2 @@',
  ' # Notes',
  '+More notes',
  '',
].join('\n');

function openDialog(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  if (dialog === null) throw new Error('No dialog is open');
  return dialog;
}

function openLoadByButton(): HTMLElement {
  fireEvent.click(screen.getAllByRole('button', { name: /^Load diff/ })[0] as HTMLElement);
  return openDialog();
}

function loadTextInDialog(text: string): void {
  const dialog = openDialog();
  fireEvent.change(within(dialog).getByLabelText('Paste a unified diff'), {
    target: { value: text },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Load diff' }));
}

function pickSampleInDialog(title: string): void {
  const samples = within(openDialog()).getAllByRole('button', { name: title });
  fireEvent.click(samples[samples.length - 1] as HTMLElement);
}

function approveHunk(index: number): void {
  const button = screen.getAllByRole('button', { name: 'Approve' })[index];
  if (button === undefined) throw new Error('No Approve button rendered.');
  fireEvent.click(button);
}

function fileWith(name: string, text: string): { file: File; resolve: () => void } {
  const file = new File([text], name, { type: 'text/plain' });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = new TextEncoder().encode(text);
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => gate.then(() => bytes.slice().buffer),
  });
  return { file, resolve: release };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function headerLabel(): string {
  return document.querySelector('.review-header > span')?.textContent ?? '';
}

describe('CARRY-LOAD a diff loaded while a review is open', () => {
  it('CARRY-NEW Start new review opens round 1 with nothing carried and keeps the old review saved', () => {
    const areas = newAreas();
    renderApp(adapterOver(areas));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();
    pickSampleInDialog('Sample: agent run 2, after fixes');

    fireEvent.click(within(openDialog()).getByRole('radio', { name: 'Start new review' }));
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Start new review' }));

    expect(screen.getByText('0 of 9 hunks decided')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Round 2 carry-over' })).toBeNull();
    expect(document.querySelector('.carry-badges')).toBeNull();
    expect(document.activeElement).toBe(articles()[0]);
    expect(keysOf(areas.local, REVIEW_KEY_PREFIX)).toHaveLength(2);
  });

  it('CARRY-NONE nothing carries and no hunk repeats: only Start new review is offered', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();

    loadTextInDialog(smallDiff());

    const dialog = openDialog();
    expect(within(dialog).queryByRole('radio', { name: /^Continue as round/ })).toBeNull();
    expect(within(dialog).getByRole('radio', { name: 'Start new review' })).toBeTruthy();
    expect(
      within(dialog).getByText(/^0 of 2 hunks are unchanged: 0 approved and 0 rejected/u),
    ).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Start new review' })).toBeTruthy();
  });

  it('CARRY-BACK Back returns to step 1 with the text kept and focus on the dialog title', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();
    loadTextInDialog(AGENT_RUN_2_DIFF);

    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Back' }));

    const dialog = openDialog();
    expect(within(dialog).getByLabelText('Paste a unified diff')).toHaveProperty(
      'value',
      AGENT_RUN_2_DIFF,
    );
    expect(document.activeElement).toBe(
      within(dialog).getByRole('heading', { name: 'Load a diff' }),
    );
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
  });

  it('CARRY-LANDING-BACK Back on the landing screen returns focus to the page title', () => {
    const areas = newAreas();
    const seed = renderApp(adapterOver(areas));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    seed.unmount();
    adapterOver(areas).setOpenFingerprint(null);
    renderApp(adapterOver(areas));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 2, after fixes' }));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(document.activeElement).toBe(
      screen.getByRole('heading', {
        name: 'Review what your AI agent changed, one hunk at a time',
      }),
    );
    expect(screen.getByLabelText('Paste a unified diff')).toBeTruthy();
  });

  it('CARRY-CLOSE closing the dialog on step 2 drops the question and changes nothing', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();
    pickSampleInDialog('Sample: agent run 2, after fixes');

    act(() => {
      openDialog().close();
    });
    openLoadByButton();

    expect(within(openDialog()).queryByRole('radio')).toBeNull();
    expect(within(openDialog()).getByLabelText('Paste a unified diff')).toBeTruthy();
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
  });

  it('CARRY-ERROR a parse error shows the ErrorPanel in the Load dialog and leaves the review untouched', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();

    loadTextInDialog('this is not a diff at all');

    const dialog = openDialog();
    expect(within(dialog).getByRole('heading', { level: 3 })).toBeTruthy();
    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(articles()).toHaveLength(11);
  });

  it('CARRY-DRAFT an open comment editor commits before the load and the comment carries over', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'c' });
    const editor = screen.getByLabelText(/^Comment for the AI agent on hunk 1 of 11 in /);
    fireEvent.change(editor, { target: { value: 'Keep this note' } });

    openLoadByButton();
    pickSampleInDialog('Sample: agent run 2, after fixes');
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Continue as round 2' }));

    expect(screen.getByText('Comment:')).toBeTruthy();
    expect(screen.getByText('Keep this note')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Round 2 carry-over' })).toBeTruthy();
  });

  it('CARRY-RESTORE a diff reviewed before asks first when the open review has decisions', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    approveHunk(1);
    openLoadByButton();
    loadTextInDialog(smallDiff());
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Start new review' }));
    approveHunk(0);
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();

    openLoadByButton();
    pickSampleInDialog('Sample: agent run 1');

    const dialog = openDialog();
    expect(within(dialog).getByRole('heading', { name: 'Restore a saved review?' })).toBeTruthy();
    expect(
      within(dialog).getByText(
        /Restoring it replaces the review you have open, which has 1 decision\./u,
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore saved review' }));
    expect(screen.getByText('2 of 11 hunks decided')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Round 2 carry-over' })).toBeNull();
  });

  it('CARRY-RESTORE-KEEP Keep current review leaves the open review as it is', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();
    loadTextInDialog(smallDiff());
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Start new review' }));
    approveHunk(0);
    openLoadByButton();
    pickSampleInDialog('Sample: agent run 1');

    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Keep current review' }));

    expect(within(openDialog()).getByLabelText('Paste a unified diff')).toBeTruthy();
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
  });
});

describe('CARRY-STORED loads that draw on stored reviews', () => {
  it('CARRY-RECENT one of the 5 most recent stored reviews can lend its decisions', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();
    loadTextInDialog(smallDiff());
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Start new review' }));
    expect(headerLabel()).toBe('src/a.ts and 1 more');

    openLoadByButton();
    pickSampleInDialog('Sample: agent run 2, after fixes');

    const dialog = openDialog();
    expect(
      within(dialog).getByText(/^6 of 9 hunks are unchanged: 1 approved and 0 rejected/u),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue as round 2' }));
    expect(screen.getByText('1 of 9 hunks decided')).toBeTruthy();
    expect(headerLabel()).toBe('Sample: agent run 1');
  });

  it('CARRY-LANDING a stored review lends its decisions to a diff loaded on the landing screen', () => {
    const areas = newAreas();
    const seed = renderApp(adapterOver(areas));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    seed.unmount();
    // A reload with the open pointer gone: the landing screen, with the review only in storage.
    adapterOver(areas).setOpenFingerprint(null);

    renderApp(adapterOver(areas));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 2, after fixes' }));

    expect(screen.getByRole('heading', { name: 'Another round of this review?' })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Another round of this review?' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue as round 2' }));
    expect(screen.getByText('1 of 9 hunks decided')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Round 2 carry-over' })).toBeTruthy();
  });

  it('CARRY-NOKEYS works with single-key shortcuts off, using only buttons', () => {
    const areas = newAreas();
    const adapter = adapterOver(areas);
    adapter.setPrefs({ ...DEFAULT_PREFS, shortcutsEnabled: false });
    renderApp(adapter);
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();
    pickSampleInDialog('Sample: agent run 2, after fixes');
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Continue as round 2' }));

    fireEvent.click(screen.getByRole('button', { name: 'Review new and changed' }));
    expect(articles()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Undo carry-over' }));
    expect(screen.queryByRole('region', { name: 'Round 2 carry-over' })).toBeNull();
    expect(screen.getByText('0 of 9 hunks decided')).toBeTruthy();
  });
});

describe('CARRY-INTAKE strays and files while a review is open', () => {
  it('CARRY-PASTE a stray Ctrl+V opens the Load dialog with the text and replaces nothing', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);

    fireEvent.paste(document.body, { clipboardData: { getData: () => AGENT_RUN_2_DIFF } });

    const dialog = openDialog();
    expect(within(dialog).getByLabelText('Paste a unified diff')).toHaveProperty(
      'value',
      AGENT_RUN_2_DIFF,
    );
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(articles()).toHaveLength(11);
  });

  it('CARRY-PASTE-FIELD a paste into a text field is left alone', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));

    fireEvent.paste(screen.getByLabelText('Path'), { clipboardData: { getData: () => 'x' } });

    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('IN-DROP-MISSED a file dropped beside the target is cancelled and opens the Load flow', async () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    const dropped = fileWith('after.diff', AGENT_RUN_2_DIFF);

    const notCancelled = fireEvent.drop(document.body, { dataTransfer: { files: [dropped.file] } });
    dropped.resolve();
    await settle();

    expect(notCancelled).toBe(false);
    expect(within(openDialog()).getByRole('radio', { name: 'Continue as round 2' })).toBeTruthy();
    expect(fireEvent.dragOver(document.body)).toBe(false);
  });

  it('IN-DROP-MISSED an unusable file dropped beside the target shows the error in the Load dialog', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);

    fireEvent.drop(document.body, {
      dataTransfer: { files: [new File([], 'nothing.diff', { type: 'text/plain' })] },
    });

    const dialog = openDialog();
    expect(within(dialog).getByRole('heading', { name: 'Nothing to review' })).toBeTruthy();
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
  });

  it('IN-RACE while a file is read main is busy and shortcuts are off; the answer then opens the Load dialog', async () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    const slow = fileWith('slow.diff', AGENT_RUN_2_DIFF);
    openLoadByButton();
    fireEvent.change(within(openDialog()).getByLabelText('Choose a text diff file'), {
      target: { files: [slow.file] },
    });

    expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
    act(() => {
      openDialog().close();
    });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'a' });
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();

    slow.resolve();
    await settle();

    expect(document.querySelector('main')?.getAttribute('aria-busy')).toBeNull();
    expect(within(openDialog()).getByRole('radio', { name: 'Continue as round 2' })).toBeTruthy();
    expect(headerLabel()).toBe('Sample: agent run 1');
  });

  it('CARRY-FILE a file load asks the same question as a pasted diff', async () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    const file = fileWith('after.diff', AGENT_RUN_2_DIFF);
    openLoadByButton();
    fireEvent.change(within(openDialog()).getByLabelText('Choose a text diff file'), {
      target: { files: [file.file] },
    });
    file.resolve();
    await settle();

    expect(within(openDialog()).getByRole('radio', { name: 'Continue as round 2' })).toBeTruthy();
    expect(statusLine()).not.toBe('');
  });

  it('CARRY-SAMEFINGERPRINT pasting the open diff again announces it and keeps the dialog on step 1', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(smallDiff());
    approveHunk(0);
    openLoadByButton();

    loadTextInDialog(smallDiff());

    expect(
      within(openDialog()).getByText('Nothing to load. This diff is already open.'),
    ).toBeTruthy();
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
  });

  it('CARRY-ROUND3 a second carry-over builds on round 2 and counts the round up', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveHunk(0);
    openLoadByButton();
    pickSampleInDialog('Sample: agent run 2, after fixes');
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Continue as round 2' }));
    openLoadByButton();
    loadTextInDialog(`${AGENT_RUN_2_DIFF}${EXTRA_FILE}`);

    expect(within(openDialog()).getByRole('radio', { name: 'Continue as round 3' })).toBeTruthy();
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Continue as round 3' }));
    expect(screen.getByRole('region', { name: 'Round 3 carry-over' })).toBeTruthy();
    expect(screen.getByText('1 of 10 hunks decided')).toBeTruthy();
  });
});
