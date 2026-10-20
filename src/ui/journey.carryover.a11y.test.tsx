import axe from 'axe-core';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  adapterOver,
  newAreas,
  renderApp,
  resetBrowserState,
  stubDialogs,
} from './journeys/journeyHelpers';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  resetBrowserState();
});

async function violations(): Promise<string[]> {
  const results = await axe.run(document.body, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'],
    // jsdom has no layout: contrast, target size and scroll regions cannot be measured here.
    rules: {
      'color-contrast': { enabled: false },
      'scrollable-region-focusable': { enabled: false },
      'target-size': { enabled: false },
    },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

function approveFirst(): void {
  const button = screen.getAllByRole('button', { name: 'Approve' })[0];
  if (button === undefined) throw new Error('No Approve button rendered.');
  fireEvent.click(button);
}

function chooseSampleTwo(): void {
  fireEvent.click(screen.getAllByRole('button', { name: /^Load diff/ })[0] as HTMLElement);
  const samples = screen.getAllByRole('button', { name: 'Sample: agent run 2, after fixes' });
  fireEvent.click(samples[samples.length - 1] as HTMLElement);
}

describe('CARRY-A11Y the re-review screens pass axe', () => {
  it('CARRY-A11Y has no violations on step 2 of the Load dialog', async () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveFirst();
    chooseSampleTwo();

    expect(screen.getByRole('radio', { name: 'Continue as round 2' })).toBeTruthy();
    expect(await violations()).toEqual([]);
  });

  it('CARRY-A11Y has no violations on round 2 with the banner and badges', async () => {
    renderApp(adapterOver(newAreas()));
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    approveFirst();
    chooseSampleTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Continue as round 2' }));

    expect(screen.getByRole('region', { name: 'Round 2 carry-over' })).toBeTruthy();
    expect(await violations()).toEqual([]);
  });
});
