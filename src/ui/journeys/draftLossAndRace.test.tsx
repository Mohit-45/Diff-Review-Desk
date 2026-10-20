import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createStorageAdapter } from '../../storage/adapter';
import { ScriptedArea, always, securityError } from '../../storage/areaFixtures';
import {
  adapterOver,
  approveFirst,
  forgetfulAdapter,
  newAreas,
  pasteAndLoad,
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
});

type UnloadCounter = { active: () => number };

function countBeforeUnload(): UnloadCounter {
  let added = 0;
  let removed = 0;
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((...args: Parameters<typeof add>) => {
    if (args[0] === 'beforeunload') added += 1;
    add(...args);
  });
  vi.spyOn(window, 'removeEventListener').mockImplementation(
    (...args: Parameters<typeof remove>) => {
      if (args[0] === 'beforeunload') removed += 1;
      remove(...args);
    },
  );
  return { active: () => added - removed };
}

function blockedAdapter() {
  const blocked = new ScriptedArea().failWhen(
    'get',
    always(() => securityError()),
  );
  return createStorageAdapter({ local: blocked, session: blocked });
}

describe('RV-DRAFT-LOSS beforeunload guard', () => {
  it('installs no listener while storage works and nothing is being typed', () => {
    const unload = countBeforeUnload();
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(unload.active()).toBe(0);
  });

  it('installs exactly one listener when storage is degraded and a decision exists, then removes it', () => {
    const unload = countBeforeUnload();
    renderApp(blockedAdapter());
    pasteAndLoad(smallDiff());
    expect(unload.active()).toBe(0);
    approveFirst();
    expect(unload.active()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(unload.active()).toBe(0);
  });

  it('prevents the unload while the listener is installed', () => {
    renderApp(blockedAdapter());
    pasteAndLoad(smallDiff());
    approveFirst();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('installs one listener while the open comment editor holds unsaved text and removes it on commit', () => {
    const unload = countBeforeUnload();
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(smallDiff());
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0] as HTMLElement);
    const editor = screen.getByLabelText(/^Comment for the AI agent on hunk 1/);
    expect(unload.active()).toBe(0);
    fireEvent.change(editor, { target: { value: 'needs a test' } });
    expect(unload.active()).toBe(1);
    fireEvent.change(editor, { target: { value: '   ' } });
    expect(unload.active()).toBe(0);
    fireEvent.change(editor, { target: { value: 'needs a test' } });
    expect(unload.active()).toBe(1);
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    expect(unload.active()).toBe(0);
  });

  it('removes the listener when the review is cleared away', () => {
    const unload = countBeforeUnload();
    const view = renderApp(blockedAdapter());
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(unload.active()).toBe(1);
    view.unmount();
    expect(unload.active()).toBe(0);
  });
});

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

function chooseFile(file: File): void {
  const input = screen.getByLabelText('Choose a text diff file');
  fireEvent.change(input, { target: { files: [file] } });
}

function headerLabel(): string {
  return document.querySelector('.review-header > span')?.textContent ?? '';
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('IN-RACE a stale file load never replaces a newer one', () => {
  it('ignores an older file that finishes after a newer one', async () => {
    renderApp(adapterOver(newAreas()));
    const older = fileWith('older.diff', smallDiff('older'));
    const newer = fileWith('newer.diff', smallDiff('newer'));
    chooseFile(older.file);
    chooseFile(newer.file);
    newer.resolve();
    await settle();
    expect(headerLabel()).toBe('newer.diff');
    older.resolve();
    await settle();
    expect(headerLabel()).toBe('newer.diff');
    expect(screen.getByText('0 of 2 hunks decided')).toBeTruthy();
  });

  it('ignores an older file that finishes before a newer one', async () => {
    renderApp(adapterOver(newAreas()));
    const older = fileWith('older.diff', smallDiff('older'));
    const newer = fileWith('newer.diff', smallDiff('newer'));
    chooseFile(older.file);
    chooseFile(newer.file);
    older.resolve();
    await settle();
    expect(screen.queryByRole('article')).toBeNull();
    newer.resolve();
    await settle();
    expect(headerLabel()).toBe('newer.diff');
  });

  it('labels a file load with the file name and restores a stored review for it', async () => {
    const areas = newAreas();
    const first = renderApp(forgetfulAdapter(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    first.unmount();
    renderApp(forgetfulAdapter(areas));
    const file = fileWith('again.diff', smallDiff());
    chooseFile(file.file);
    file.resolve();
    await settle();
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
  });

  it('reports an unreadable file and keeps the landing screen', async () => {
    renderApp(adapterOver(newAreas()));
    const file = new File(['x'], 'broken.diff');
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.reject(new Error('disk')) });
    chooseFile(file);
    await settle();
    expect(screen.getByRole('heading', { name: 'Could not read broken.diff' })).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
  });
});
