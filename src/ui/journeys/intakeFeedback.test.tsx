import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../App';
import { manualFrames } from '../frameFixtures';
import {
  adapterOver,
  approveFirst,
  articles,
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

function openDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('dialog[open]');
  if (dialog === null) throw new Error('No dialog is open.');
  return dialog;
}

function loadSmall(): void {
  renderApp(adapterOver(newAreas()));
  pasteAndLoad(smallDiff());
}

function opener(name: RegExp): HTMLElement {
  return screen.getAllByRole('button', { name })[0] as HTMLElement;
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('IN-IMAGE-PASTE a stray paste or drop with nothing to load says so', () => {
  it.each([
    ['an image only', ''],
    ['only whitespace', ' \n\t '],
  ])('announces "Clipboard has no text." for a paste of %s and opens nothing', (_name, text) => {
    loadSmall();
    fireEvent.paste(document.body, { clipboardData: { getData: () => text } });
    expect(statusLine()).toBe('Clipboard has no text.');
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(articles()).toHaveLength(2);
  });

  it('announces it again for a second empty paste', () => {
    loadSmall();
    fireEvent.paste(document.body, { clipboardData: { getData: () => '' } });
    const first = document.querySelector('main .status-line span');
    fireEvent.paste(document.body, { clipboardData: { getData: () => '' } });
    expect(statusLine()).toBe('Clipboard has no text.');
    expect(document.querySelector('main .status-line span')).not.toBe(first);
  });

  it('announces it for a drop that carries no file, and still cancels the drop', () => {
    loadSmall();
    const notCancelled = fireEvent.drop(document.body, { dataTransfer: { files: [] } });
    expect(notCancelled).toBe(false);
    expect(statusLine()).toBe('Clipboard has no text.');
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('says "Close the dialog to load a diff." inside the open dialog, and loads nothing', () => {
    loadSmall();
    fireEvent.click(opener(/^Settings/));
    fireEvent.paste(document.body, { clipboardData: { getData: () => smallDiff('other') } });
    const notice = within(openDialog()).getByRole('status');
    expect(notice.textContent).toBe('Close the dialog to load a diff.');
    expect(within(openDialog()).getByRole('heading', { level: 2 }).textContent).toBe('Settings');
    expect(screen.queryByLabelText('Paste a unified diff')).toBeNull();
  });

  it('says it for a dropped file too, cancels the drop, and the line does not outlive the dialog', () => {
    loadSmall();
    fireEvent.click(opener(/^Export/));
    const file = new File(['x'], 'later.diff', { type: 'text/plain' });
    expect(fireEvent.drop(document.body, { dataTransfer: { files: [file] } })).toBe(false);
    expect(within(openDialog()).getByRole('status').textContent).toBe(
      'Close the dialog to load a diff.',
    );
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Close' }));
    fireEvent.click(opener(/^Export/));
    expect(within(openDialog()).getByRole('status').textContent).toBe('');
  });

  it('IN-DROP-MISSED cancels dragover and drop on the review screen in every state', () => {
    loadSmall();
    expect(fireEvent.dragOver(document.body)).toBe(false);
    expect(fireEvent.drop(document.body, { dataTransfer: { files: [] } })).toBe(false);
    fireEvent.click(opener(/^Settings/));
    expect(fireEvent.dragOver(document.body)).toBe(false);
    expect(fireEvent.drop(document.body, { dataTransfer: { files: [] } })).toBe(false);
  });

  it('leaves a paste beside the Load dialog alone, since that dialog takes input itself', () => {
    loadSmall();
    fireEvent.click(opener(/^Load diff/));
    const dialog = openDialog();
    fireEvent.paste(within(dialog).getByRole('button', { name: 'Close' }), {
      clipboardData: { getData: () => smallDiff('other') },
    });
    expect(within(dialog).getByRole('status').textContent).toBe('');
    expect(statusLine()).not.toBe('Close the dialog to load a diff.');
  });

  it('still opens the Load dialog with a real paste', () => {
    loadSmall();
    fireEvent.paste(document.body, { clipboardData: { getData: () => smallDiff('other') } });
    const field = within(openDialog()).getByLabelText('Paste a unified diff');
    expect((field as HTMLTextAreaElement).value).toBe(smallDiff('other'));
  });
});

describe('IN-READING a static Reading diff… frame comes before a paste is parsed', () => {
  function renderWithFrames() {
    const frames = manualFrames();
    render(
      <StrictMode>
        <App storage={adapterOver(newAreas())} frame={frames.schedule} />
      </StrictMode>,
    );
    return frames;
  }

  it('shows an aria-busy page and the line first, and parses only after the frame is painted', () => {
    const frames = renderWithFrames();
    pasteAndLoad(smallDiff());
    expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Reading diff…')).toBeTruthy();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    // Nothing else can start while the frame is pending.
    expect(screen.getByRole('button', { name: 'Load diff' })).toHaveProperty('disabled', true);
    act(() => {
      frames.paint();
    });
    expect(articles()).toHaveLength(2);
    expect(document.querySelector('main')?.getAttribute('aria-busy')).toBeNull();
    expect(screen.queryByText('Reading diff…')).toBeNull();
  });

  it('shows the same line for a sample, and an error replaces it once parsed', () => {
    const frames = renderWithFrames();
    fireEvent.change(screen.getByLabelText('Paste a unified diff'), {
      target: { value: 'just some prose' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load diff' }));
    expect(screen.getByText('Reading diff…')).toBeTruthy();
    act(() => {
      frames.paint();
    });
    expect(screen.queryByText('Reading diff…')).toBeNull();
    expect(screen.getByRole('heading', { name: 'This does not look like a diff' })).toBeTruthy();
    expect(document.querySelector('main')?.getAttribute('aria-busy')).toBeNull();
  });

  it('keeps the review open and its shortcuts off until the frame is painted', () => {
    const frames = manualFrames();
    renderApp(adapterOver(newAreas()), undefined, frames.schedule);
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    act(() => {
      frames.paint();
    });
    approveFirst();
    fireEvent.click(opener(/^Load diff/));
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText('Paste a unified diff'), {
      target: { value: smallDiff() },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Load diff' }));
    expect(within(dialog).getByText('Reading diff…')).toBeTruthy();
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
    act(() => {
      frames.paint();
    });
    expect(within(openDialog()).getByRole('radio', { name: /Start new review/ })).toBeTruthy();
  });
});

function failingFile(name: string): { file: File; reads: () => number; fixIt: () => void } {
  let reads = 0;
  let broken = true;
  const bytes = new TextEncoder().encode(smallDiff('file'));
  const file = new File(['x'], name);
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => {
      reads += 1;
      return broken ? Promise.reject(new Error('disk')) : Promise.resolve(bytes.slice().buffer);
    },
  });
  return {
    file,
    reads: () => reads,
    fixIt: () => {
      broken = false;
    },
  };
}

function chooseFile(file: File, scope: HTMLElement = document.body): void {
  const input = scope.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('No file input.');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('IN-READ-FAIL a file that cannot be read offers Retry', () => {
  it('shows "Could not read {name}" with Retry on the landing screen, and Retry reads the same file', async () => {
    renderApp(adapterOver(newAreas()));
    const broken = failingFile('broken.diff');
    chooseFile(broken.file);
    await settle();
    expect(screen.getByRole('heading', { name: 'Could not read broken.diff' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settle();
    expect(broken.reads()).toBe(2);
    expect(screen.getByRole('heading', { name: 'Could not read broken.diff' })).toBeTruthy();

    broken.fixIt();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settle();
    expect(broken.reads()).toBe(3);
    expect(articles()).toHaveLength(2);
    expect(document.querySelector('header span')?.textContent).toBe('broken.diff');
  });

  it('offers no Retry for an error that is not a read failure', () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.change(screen.getByLabelText('Paste a unified diff'), { target: { value: 'prose' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load diff' }));
    expect(screen.getByRole('heading', { name: 'This does not look like a diff' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('keeps the open review untouched while the Load dialog shows the failure and Retry', async () => {
    loadSmall();
    approveFirst();
    const label = document.querySelector('header span')?.textContent;
    fireEvent.click(opener(/^Load diff/));
    const dialog = openDialog();
    const broken = failingFile('later.diff');
    chooseFile(broken.file, dialog);
    await settle();
    expect(within(dialog).getByRole('heading', { name: 'Could not read later.diff' })).toBe(
      document.activeElement,
    );
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    await settle();
    expect(broken.reads()).toBe(2);
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(document.querySelector('header span')?.textContent).toBe(label);
  });
});
