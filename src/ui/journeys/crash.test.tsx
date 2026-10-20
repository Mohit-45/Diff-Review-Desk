import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { REVIEW_KEY_PREFIX } from '../../storage/keys';
import type { UnexpectedPayload } from '../reportUnexpected';
import {
  adapterOver,
  keysOf,
  newAreas,
  pasteAndLoad,
  renderApp,
  resetBrowserState,
  smallDiff,
  stubDialogs,
} from './journeyHelpers';

const crash = vi.hoisted(() => ({ on: false }));

vi.mock('../components/HunkCard', async (importOriginal) => {
  const real = await importOriginal<typeof import('../components/HunkCard')>();
  function HunkCard(props: ComponentProps<typeof real.HunkCard>) {
    if (crash.on) {
      throw new RangeError('hunk data quoting src/a.ts');
    }
    return createElement(real.HunkCard, props);
  }
  return { ...real, HunkCard };
});

beforeAll(stubDialogs);

afterEach(() => {
  crash.on = false;
  cleanup();
  resetBrowserState();
  vi.restoreAllMocks();
});

const REPORT_TITLE = 'Diff Review Desk hit an unexpected error.';

function captureReports(): UnexpectedPayload[] {
  const reports: UnexpectedPayload[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (args[0] === REPORT_TITLE) reports.push(args[1] as UnexpectedPayload);
  });
  return reports;
}

describe('RV-RENDER-CRASH a failing hunk card leaves the rest of the review standing', () => {
  it('shows the crash screen in the main pane, focused, with the header and rail intact', () => {
    captureReports();
    renderApp(adapterOver(newAreas()));
    crash.on = true;
    pasteAndLoad(smallDiff());

    const main = document.getElementById('main');
    if (main === null) throw new Error('No main landmark.');
    const heading = within(main).getByRole('heading', { name: 'Something went wrong' });
    expect(document.activeElement).toBe(heading);
    expect(within(main).getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(within(main).getByRole('button', { name: 'Clear saved data' })).toBeTruthy();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Diff Review Desk' })).toBeTruthy();
    expect(screen.getByText('Review progress')).toBeTruthy();
    expect(document.body.textContent).not.toContain('hunk data quoting');
  });

  it('reports the crash with counts and the storage mode, never the message or a path', () => {
    const reports = captureReports();
    renderApp(adapterOver(newAreas()));
    crash.on = true;
    pasteAndLoad(smallDiff());

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      code: 'render-crash',
      error: 'RangeError',
      storage: 'persistent',
      files: 2,
      hunks: 2,
    });
    expect(reports[0]?.components).toContain('HunkCard');
    expect(JSON.stringify(reports)).not.toContain('src/a.ts');
    expect(JSON.stringify(reports)).not.toContain('quoting');
  });

  it('Clear saved data wipes the storage and returns to the landing page', () => {
    captureReports();
    const areas = newAreas();
    renderApp(adapterOver(areas));
    crash.on = true;
    pasteAndLoad(smallDiff());
    expect(keysOf(areas.local, REVIEW_KEY_PREFIX)).toHaveLength(1);
    crash.on = false;

    fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));

    expect(keysOf(areas.local, 'drd:')).toEqual([]);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Review what your AI agent changed, one hunk at a time',
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).toBeNull();
  });
});
