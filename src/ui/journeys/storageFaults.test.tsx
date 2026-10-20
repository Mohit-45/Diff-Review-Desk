import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parsedFiles } from '../../app/appFixtures';
import { OPEN_KEY, PREFS_KEY, createStorageAdapter } from '../../storage/adapter';
import {
  ScriptedArea,
  always,
  onlyForKeys,
  quotaError,
  reviewRecord,
} from '../../storage/areaFixtures';
import { securityError } from '../../storage/areaFixtures';
import { DIFF_KEY_PREFIX, REVIEW_KEY_PREFIX, reviewKeyFor } from '../../storage/keys';
import {
  BANNER,
  adapterOver,
  approveFirst,
  keysOf,
  newAreas,
  openSettings,
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
});

const TOKEN = `${['ghp', '_'].join('')}abcdefghijklmnopqrstuvwxyz0123456789`;

function bannerCount(): number {
  return screen.queryAllByText(BANNER).length;
}

function blockedAdapter() {
  const blocked = new ScriptedArea().failWhen(
    'get',
    always(() => securityError()),
  );
  return createStorageAdapter({ local: blocked, session: blocked });
}

describe('storage faults: denied', () => {
  it('ST-DENIED shows the banner once on the landing screen', () => {
    renderApp(blockedAdapter());
    expect(bannerCount()).toBe(1);
  });

  it('ST-DENIED keeps the review working, shows Not saved as an alert and never doubles the banner', () => {
    renderApp(blockedAdapter());
    pasteAndLoad(smallDiff());
    expect(bannerCount()).toBe(1);
    approveFirst();
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(bannerCount()).toBe(1);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Not saved');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows Saved as plain text, with no alert, while storage works', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(bannerCount()).toBe(0);
  });
});

describe('storage faults: quota', () => {
  it('ST-QUOTA falls back to memory with one banner and keeps the decision', () => {
    const areas = newAreas();
    areas.local.failWhen(
      'set',
      onlyForKeys(
        REVIEW_KEY_PREFIX,
        always(() => quotaError()),
      ),
    );
    renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(bannerCount()).toBe(1);
    expect(screen.getByRole('alert').textContent).toBe('Not saved');
  });
});

describe('storage faults: corrupt and newer data', () => {
  it('ST-CORRUPT resets corrupt preferences with one visible notice', () => {
    const areas = newAreas();
    areas.local.seed(PREFS_KEY, '{ nope');
    renderApp(adapterOver(areas));
    expect(screen.getAllByText('Saved preferences were corrupt and were reset.')).toHaveLength(1);
  });

  it('ST-CORRUPT treats a corrupt review record as absent with one notice and overwrites it', () => {
    const areas = newAreas();
    const { fingerprint } = parsedFiles(smallDiff());
    areas.local.seed(reviewKeyFor(fingerprint), '{ nope');
    renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    expect(screen.getAllByText('Saved review data was corrupt and was not restored.')).toHaveLength(
      1,
    );
    expect(screen.getByText('0 of 2 hunks decided')).toBeTruthy();
    approveFirst();
    expect(areas.local.getItem(reviewKeyFor(fingerprint))).toContain('"schemaVersion":1');
  });

  it('ST-CORRUPT ignores a corrupt record for the open review on reload', () => {
    const areas = newAreas();
    const { fingerprint } = parsedFiles(smallDiff());
    areas.local.seed(reviewKeyFor(fingerprint), '[1,2');
    areas.session.seed(OPEN_KEY, fingerprint);
    renderApp(adapterOver(areas));
    expect(
      screen.getByRole('heading', { level: 2, name: /^Review what your AI agent changed/ }),
    ).toBeTruthy();
    expect(screen.getAllByText('Saved review data was corrupt and was not restored.')).toHaveLength(
      1,
    );
  });

  it('ST-FUTURE leaves a newer-version record untouched and keeps working in memory', () => {
    const areas = newAreas();
    const { fingerprint } = parsedFiles(smallDiff());
    const future = JSON.stringify({ ...reviewRecord(fingerprint), schemaVersion: 2 });
    areas.local.seed(reviewKeyFor(fingerprint), future);
    renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    expect(
      screen.getAllByText('Saved review data is from a newer version and was not restored.'),
    ).toHaveLength(1);
    approveFirst();
    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(areas.local.getItem(reviewKeyFor(fingerprint))).toBe(future);
    expect(bannerCount()).toBe(0);
  });
});

describe('storage faults: secrets', () => {
  const secretDiff = `${smallDiff()}diff --git a/src/k.ts b/src/k.ts\n--- a/src/k.ts\n+++ b/src/k.ts\n@@ -1 +1 @@\n-const k = 1;\n+const k = '${TOKEN}';\n`;

  it('IN-SECRET-DIFF stores decisions only and says so when the diff holds a secret', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas));
    pasteAndLoad(secretDiff);
    approveFirst();
    expect(
      screen.getByText(
        'Your diff text was not saved because it contains a secret-like string. 1 decisions are stored. Paste the same diff to restore them.',
      ),
    ).toBeTruthy();
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toEqual([]);
    const [reviewKey] = keysOf(areas.local, REVIEW_KEY_PREFIX);
    expect(reviewKey).toBeDefined();
    for (const area of [areas.local, areas.session]) {
      for (let index = 0; index < area.length; index += 1) {
        const key = area.key(index) ?? '';
        expect(area.getItem(key)).not.toContain(TOKEN);
      }
    }
  });

  it('withholds the diff of a sensitive file and keeps the decisions', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff().replaceAll('src/a.ts', '.env'));
    approveFirst();
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toEqual([]);
    expect(keysOf(areas.local, REVIEW_KEY_PREFIX)).toHaveLength(1);
  });

  it('redacts a secret typed into a comment before it is stored', () => {
    const areas = newAreas();
    renderApp(rememberingAdapter(areas));
    pasteAndLoad(smallDiff());
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0] as HTMLElement);
    const editor = screen.getByLabelText(/^Comment for the AI agent on hunk 1/);
    fireEvent.change(editor, { target: { value: `rotate ${TOKEN}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    for (const key of keysOf(areas.local, 'drd:')) {
      expect(areas.local.getItem(key)).not.toContain(TOKEN);
    }
    const [reviewKey] = keysOf(areas.local, REVIEW_KEY_PREFIX);
    expect(areas.local.getItem(reviewKey ?? '')).toContain('rotate [REDACTED:');
  });

  it('keeps the settings dialog usable after a withheld diff', () => {
    renderApp(rememberingAdapter(newAreas()));
    pasteAndLoad(secretDiff);
    const dialog = openSettings();
    expect(
      within(dialog).getByRole('checkbox', { name: 'Remember diff text in this browser' }),
    ).toBeTruthy();
  });
});
