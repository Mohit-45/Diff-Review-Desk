import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { OPEN_KEY, PREFS_KEY, THEME_KEY } from '../../storage/adapter';
import { DIFF_KEY_PREFIX, REVIEW_KEY_PREFIX } from '../../storage/keys';
import { App } from '../App';
import { immediateFrame } from '../frameFixtures';
import {
  adapterOver,
  approveFirst,
  articles,
  forgetfulAdapter,
  keysOf,
  newAreas,
  openSettings,
  pasteAndLoad,
  rememberingAdapter,
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

function pressedFirstApprove(): string | null {
  return (
    screen.getAllByRole('button', { name: 'Approve' })[0]?.getAttribute('aria-pressed') ?? null
  );
}

describe('persistence journey: a decision survives a reload', () => {
  it('ST-RESTORE saves a decision and brings it back after a remount', () => {
    const areas = newAreas();
    const first = renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    first.unmount();

    renderApp(adapterOver(areas));
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(pressedFirstApprove()).toBe('true');
    expect(screen.getByRole('heading', { level: 3, name: /^Hunk 1 of 2, / })).toBeTruthy();
  });

  it('RV-RESTORE-FOCUS restores without moving focus, keeps one tab stop and announces once', () => {
    const areas = newAreas();
    const first = renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    first.unmount();

    renderApp(adapterOver(areas));
    expect(document.activeElement).toBe(document.body);
    const stops = articles().filter((card) => card.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.getAttribute('aria-current')).toBe('true');
    expect(statusLine()).toBe('Restored review: 1 of 2 hunks decided.');
  });

  it('RV-RESTORE-FOCUS puts the current hunk on the first pending hunk after a restore', () => {
    const areas = newAreas();
    const first = renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    first.unmount();

    renderApp(adapterOver(areas));
    expect(articles()[1]?.getAttribute('aria-current')).toBe('true');
    expect(articles()[0]?.tabIndex).toBe(-1);
  });

  it('writes nothing on the first render of an unchanged restored review', () => {
    const areas = newAreas();
    const first = renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    first.unmount();
    areas.local.calls.length = 0;
    areas.session.calls.length = 0;

    renderApp(adapterOver(areas));
    expect(areas.local.calls).toEqual([]);
    expect(areas.session.calls).toEqual([]);
  });

  it('writes the review once per change, immediately', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    areas.local.calls.length = 0;
    approveFirst();
    const writes = areas.local.calls.filter((call) => call.startsWith(`set:${REVIEW_KEY_PREFIX}`));
    expect(writes).toHaveLength(1);
  });

  it('keeps the diff text in session storage and out of local storage', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toHaveLength(1);
    expect(keysOf(areas.local, DIFF_KEY_PREFIX)).toEqual([]);
    expect(areas.session.getItem(OPEN_KEY)).not.toBeNull();
    for (const key of keysOf(areas.local, 'drd:')) {
      expect(areas.local.getItem(key)).not.toContain('const b =');
    }
  });

  it('restores a built-in sample from its bundled text even when no diff text is remembered', () => {
    const areas = newAreas();
    const first = renderApp(adapterOver(areas));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveFirst();
    first.unmount();

    renderApp(adapterOver(areas));
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(statusLine()).toBe('Restored review: 1 of 11 hunks decided.');
  });

  it('restores a pasted secret-free diff after a reload with the default settings', () => {
    const areas = newAreas();
    const first = renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toHaveLength(1);
    first.unmount();

    renderApp(adapterOver(areas));
    expect(articles()).toHaveLength(2);
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(pressedFirstApprove()).toBe('true');
    expect(statusLine()).toBe('Restored review: 1 of 2 hunks decided.');
    expect(
      screen.queryByText(/Saved decisions for 2 hunks\. Paste or drop the same diff/),
    ).toBeNull();
  });

  it('shows the landing notice when only decisions are stored, then restores them on a paste', () => {
    const areas = newAreas();
    const first = renderApp(forgetfulAdapter(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    first.unmount();

    renderApp(forgetfulAdapter(areas));
    expect(
      screen.getByText('Saved decisions for 2 hunks. Paste or drop the same diff to restore them.'),
    ).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
    pasteAndLoad(smallDiff());
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(pressedFirstApprove()).toBe('true');
    expect(statusLine()).toBe('Loaded 2 files, 2 hunks. Restored 1 saved decision.');
  });

  it('loading a different diff does not carry the old decisions', () => {
    const areas = newAreas();
    renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff('one'));
    approveFirst();
    fireEvent.click(screen.getAllByRole('button', { name: /^Load diff/ })[0] as HTMLElement);
    const dialog = document.querySelector<HTMLElement>('dialog[open]');
    if (dialog === null) throw new Error('Load dialog did not open.');
    fireEvent.change(within(dialog).getByLabelText('Paste a unified diff'), {
      target: { value: smallDiff('two') },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Load diff' }));
    expect(screen.getByText('0 of 2 hunks decided')).toBeTruthy();
    expect(keysOf(areas.local, REVIEW_KEY_PREFIX)).toHaveLength(2);
  });

  it('uses the real browser storage when no adapter is injected', () => {
    render(
      <StrictMode>
        <App frame={immediateFrame} />
      </StrictMode>,
    );
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(
      Object.keys(window.localStorage).filter((key) => key.startsWith(REVIEW_KEY_PREFIX)),
    ).toHaveLength(1);
    expect(window.sessionStorage.getItem(OPEN_KEY)).not.toBeNull();
  });
});

describe('persistence journey: preferences', () => {
  it('saves every setting and applies them again after a remount', () => {
    const areas = newAreas();
    const first = renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    const dialog = openSettings();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Dark' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Single-key shortcuts' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Advance after each decision' }));
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Remember diff text in this browser' }),
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(areas.local.getItem(THEME_KEY)).toBe('dark');
    expect(areas.local.getItem(PREFS_KEY)).toBe(
      '{"theme":"dark","shortcutsEnabled":false,"autoAdvance":false,"rememberDiff":false}',
    );
    first.unmount();
    document.documentElement.removeAttribute('data-theme');

    renderApp(adapterOver(areas));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // Remember-diff was turned off above, so the diff comes back by pasting it again.
    pasteAndLoad(smallDiff());
    const again = openSettings();
    expect(within(again).getByRole<HTMLInputElement>('radio', { name: 'Dark' }).checked).toBe(true);
    expect(
      within(again).getByRole<HTMLInputElement>('checkbox', { name: 'Single-key shortcuts' })
        .checked,
    ).toBe(false);
    expect(
      within(again).getByRole<HTMLInputElement>('checkbox', {
        name: 'Advance after each decision',
      }).checked,
    ).toBe(false);
  });

  it('removes the theme attribute again for the system theme', () => {
    const areas = newAreas();
    renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    const dialog = openSettings();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'System' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(areas.local.getItem(THEME_KEY)).toBe('system');
  });

  it('ST-REMEMBER-OFF deletes the stored diff text the moment remembering is turned off', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toHaveLength(1);
    const dialog = openSettings();
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Remember diff text in this browser' }),
    );
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toEqual([]);
    expect(areas.local.getItem(PREFS_KEY)).toContain('"rememberDiff":false');
    act(() => {
      document.querySelector<HTMLDialogElement>('dialog[open]')?.close();
    });
    approveFirst();
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toEqual([]);
  });
});

describe('persistence journey: clear all saved data', () => {
  it('ST-CLEAR-FOREIGN returns to the landing screen and leaves foreign keys alone', () => {
    const areas = newAreas();
    areas.local.seed('other-app:key', 'keep');
    areas.session.seed('other-app:session', 'keep');
    renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    const dialog = openSettings();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Dark' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all saved data' }));
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all saved data' }));

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Review what your AI agent changed, one hunk at a time',
      }),
    ).toBeTruthy();
    expect(areas.local.getItem('other-app:key')).toBe('keep');
    expect(areas.session.getItem('other-app:session')).toBe('keep');
    expect(keysOf(areas.local, 'drd:')).toEqual([]);
    expect(keysOf(areas.session, 'drd:')).toEqual([]);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(screen.getByText('All saved data was cleared.')).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById('main'));
  });

  it('keeps the review when the confirmation is cancelled', () => {
    const areas = newAreas();
    renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    const dialog = openSettings();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all saved data' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(keysOf(areas.local, REVIEW_KEY_PREFIX)).toHaveLength(1);
  });
});
