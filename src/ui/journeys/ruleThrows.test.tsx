import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RISK_CONFIG, type RiskRule } from '../../core/risk/config';
import * as engine from '../../core/risk/engine';
import { DIFF_KEY_PREFIX, REVIEW_KEY_PREFIX } from '../../storage/keys';
import { oneLineDiff } from '../diffFixtures';
import {
  adapterOver,
  approveFirst,
  keysOf,
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

const LEAK = 'diff-text-that-must-not-appear';

/** The real engine with one rule that throws a message quoting the diff. */
function breakRule(ruleId: RiskRule['id']): void {
  const real = engine.analyze;
  const rules = DEFAULT_RISK_CONFIG.rules.map((rule) =>
    rule.id === ruleId
      ? {
          ...rule,
          evaluate: () => {
            throw new Error(LEAK);
          },
        }
      : rule,
  );
  vi.spyOn(engine, 'analyze').mockImplementation((files) => real(files, { rules }));
}

function notices(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Risk checks that did not run' });
}

describe('RV-RULE-THROWS a rule that cannot run is reported without content', () => {
  it('names the rule and the file, and never the error or the diff', () => {
    breakRule('hidden-unicode');
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(smallDiff());
    const region = notices();
    if (region === null) throw new Error('No rule notice.');
    expect(region.textContent).toContain(
      'Rule hidden-unicode could not run on src/a.ts and 1 more file.',
    );
    expect(region.textContent).toContain('The diff text is not being saved for this review.');
    expect(document.body.textContent).not.toContain(LEAK);
  });

  it('shows no notice when every rule runs', () => {
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(smallDiff());
    expect(notices()).toBeNull();
  });

  it('keeps the flags of the rules that did run', () => {
    breakRule('hidden-unicode');
    renderApp(adapterOver(newAreas()));
    pasteAndLoad(oneLineDiff('src/a.ts', `// ${['TO', 'DO'].join('')} later`));
    expect(notices()).not.toBeNull();
    const [card] = screen.getAllByRole('article');
    if (card === undefined) throw new Error('No card.');
    expect(within(card).getAllByText('Placeholder or unfinished code').length).toBeGreaterThan(0);
  });

  it('stores decisions only, with no diff text, for that review', () => {
    breakRule('hidden-unicode');
    const areas = newAreas();
    renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(keysOf(areas.local, REVIEW_KEY_PREFIX)).toHaveLength(1);
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toEqual([]);
  });

  it('still stores the diff text when every rule runs', () => {
    const areas = newAreas();
    renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    expect(keysOf(areas.session, DIFF_KEY_PREFIX)).toHaveLength(1);
  });

  it('brings the review back after a reload as decisions waiting for the diff', () => {
    breakRule('hidden-unicode');
    const areas = newAreas();
    const first = renderApp(adapterOver(areas));
    pasteAndLoad(smallDiff());
    approveFirst();
    first.unmount();
    renderApp(adapterOver(areas));
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(
      screen.getByText('Saved decisions for 2 hunks. Paste or drop the same diff to restore them.'),
    ).toBeTruthy();
  });
});
