import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseDiff } from '../core/parser/parse';
import { AGENT_RUN_1_DIFF, AGENT_RUN_2_DIFF } from '../samples';
import {
  adapterOver,
  articles,
  newAreas,
  renderApp,
  resetBrowserState,
  statusLine,
  stubDialogs,
  type Areas,
} from './journeys/journeyHelpers';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  resetBrowserState();
});

/** One row of the demo script: the key that decides the hunk the cursor is on. */
type Row = {
  readonly row: number;
  readonly hunk: number;
  readonly key: 'a' | 'r';
  /** Typed into the editor that `r` opens, then committed with Ctrl+Enter. */
  readonly comment?: string;
};

// Eleven rows, one per hunk of sample 1, top to bottom. `a` and Ctrl+Enter both advance to the
// next pending hunk, so no navigation key is needed. Result: 6 approved, 5 rejected; among the six
// hunks that sample 2 repeats byte for byte (1, 3, 5, 6, 7, 9): 5 approved, 1 rejected.
const DEMO_ROWS: readonly Row[] = [
  { row: 1, hunk: 1, key: 'a' },
  { row: 2, hunk: 2, key: 'r', comment: 'Remove the hard-coded key' },
  { row: 3, hunk: 3, key: 'a' },
  { row: 4, hunk: 4, key: 'r', comment: 'This flips the failure path' },
  { row: 5, hunk: 5, key: 'a' },
  { row: 6, hunk: 6, key: 'a' },
  { row: 7, hunk: 7, key: 'a' },
  { row: 8, hunk: 8, key: 'r', comment: 'Keep the legacy test' },
  { row: 9, hunk: 9, key: 'r', comment: 'Do not pipe a download into sh' },
  { row: 10, hunk: 10, key: 'r', comment: 'Explain the binary change' },
  { row: 11, hunk: 11, key: 'a' },
];

const BANNER =
  'Round 2. 6 decisions carried over (5 approved, 1 rejected). 3 hunks are new or changed. 5 hunks from round 1 no longer appear (4 were rejected, likely addressed). 1 hunk you rejected is unchanged.';

const STEP_TWO =
  '6 of 9 hunks are unchanged: 5 approved and 1 rejected carry over. 3 are new or changed, 5 no longer present (4 were rejected).';

function press(key: string, init: KeyboardEventInit = {}, target?: Element): void {
  fireEvent.keyDown(target ?? document.activeElement ?? document.body, { key, ...init });
}

function openDialog(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  if (dialog === null) throw new Error('No dialog is open');
  return dialog;
}

function article(index: number): HTMLElement {
  const found = articles()[index];
  if (found === undefined) throw new Error(`No article ${String(index)}`);
  return found;
}

function runRow(row: Row): void {
  press(row.key);
  if (row.comment === undefined) return;
  const editor = screen.getByLabelText(
    new RegExp(`^Comment for the AI agent on hunk ${String(row.hunk)} of 11 in `),
  );
  fireEvent.change(editor, { target: { value: row.comment } });
  press('Enter', { ctrlKey: true }, editor);
}

function startRoundOne(areas: Areas): void {
  renderApp(adapterOver(areas));
  fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
  for (const row of DEMO_ROWS) {
    runRow(row);
    expect(screen.getByText(`${String(row.row)} of 11 hunks decided`)).toBeTruthy();
  }
}

/** The Load dialog (key `l`), with sample 2 chosen from inside it. */
function loadSampleTwoFromDialog(): void {
  press('l');
  const samples = within(openDialog()).getAllByRole('button', {
    name: 'Sample: agent run 2, after fixes',
  });
  fireEvent.click(samples[samples.length - 1] as HTMLElement);
}

function continueAsRoundTwo(): void {
  fireEvent.click(within(openDialog()).getByRole('button', { name: 'Continue as round 2' }));
}

function badgesIn(card: HTMLElement): string {
  return card.querySelector('.carry-badges')?.textContent ?? '';
}

describe('CARRY-REPLAY the demo script, round 1 then round 2', () => {
  it('CARRY-ROUND1 eleven rows leave 6 approved and 5 rejected, 5 and 1 among the 6 repeated hunks', () => {
    const areas = newAreas();
    startRoundOne(areas);

    expect(DEMO_ROWS).toHaveLength(11);
    expect(screen.getByText('Approved 6 · Rejected 5 · Pending 0')).toBeTruthy();
    expect(screen.getByText('All 11 hunks decided')).toBeTruthy();

    const first = parseDiff(AGENT_RUN_1_DIFF);
    const second = parseDiff(AGENT_RUN_2_DIFF);
    if (!first.ok || !second.ok) throw new Error('A sample did not parse.');
    const secondIds = new Set(second.files.flatMap((file) => file.hunks.map((hunk) => hunk.id)));
    const stored = adapterOver(areas).getReview(first.fingerprint);
    if (!stored.ok || stored.value === null) throw new Error('Round 1 was not saved.');
    const repeated = Object.entries(stored.value.decisions).filter(([id]) => secondIds.has(id));
    expect(repeated.filter(([, review]) => review.decision === 'approved')).toHaveLength(5);
    expect(repeated.filter(([, review]) => review.decision === 'rejected')).toHaveLength(1);
  });

  it('CARRY-STEP2 asks before replacing a decided review and offers round 2 first', () => {
    startRoundOne(newAreas());
    loadSampleTwoFromDialog();

    const dialog = openDialog();
    expect(within(dialog).getByText(STEP_TWO)).toBeTruthy();
    const keep = within(dialog).getByRole('radio', { name: 'Continue as round 2' });
    expect((keep as HTMLInputElement).checked).toBe(true);
    expect(within(dialog).getByRole('radio', { name: 'Start new review' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Continue as round 2' })).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('heading', { name: 'Another round of this review?' }),
    );
    // The review behind the dialog is untouched until the user answers.
    expect(screen.getByText('11 of 11 hunks decided')).toBeTruthy();
  });

  it('CARRY-ROUND2 carries 6 decisions, flags 3 new hunks and reports 5 gone', () => {
    const areas = newAreas();
    startRoundOne(areas);
    loadSampleTwoFromDialog();
    continueAsRoundTwo();

    expect(articles()).toHaveLength(9);
    expect(screen.getByText('6 of 9 hunks decided')).toBeTruthy();
    expect(screen.getByText('Approved 5 · Rejected 1 · Pending 3')).toBeTruthy();
    const banner = screen.getByRole('region', { name: 'Round 2 carry-over' });
    expect(within(banner).getByText(BANNER)).toBeTruthy();
    // Focus goes to the first pending hunk, never into the banner.
    expect(document.activeElement).toBe(article(2));
    expect(banner.contains(document.activeElement)).toBe(false);
    // The live region carries the leading sentences that fit its 120 characters, once.
    expect(statusLine()).toBe(
      'Round 2. 6 decisions carried over (5 approved, 1 rejected). 3 hunks are new or changed.',
    );
    // The record that survives a reload says the same thing: round 2, the label, prior, no note.
    const second = parseDiff(AGENT_RUN_2_DIFF);
    if (!second.ok) throw new Error('Sample 2 did not parse.');
    const stored = adapterOver(areas).getReview(second.fingerprint);
    if (!stored.ok || stored.value === null) throw new Error('Round 2 was not saved.');
    expect(stored.value.round).toBe(2);
    expect(stored.value.label).toBe('Sample: agent run 1');
    expect(stored.value.overallNote).toBe('');
    expect(stored.value.prior?.unchangedIds).toHaveLength(6);
    expect(stored.value.prior?.goneCount).toBe(5);
    expect(stored.value.prior?.goneRejected).toBe(4);
    expect(Object.keys(stored.value.prior?.carried ?? {})).toHaveLength(6);
  });

  it('CARRY-BADGES marks 5 hunks approved in round 1, 1 still rejected and 3 new or changed', () => {
    startRoundOne(newAreas());
    loadSampleTwoFromDialog();
    continueAsRoundTwo();

    const badges = articles().map(badgesIn);
    expect(badges.filter((text) => text.includes('Approved in round 1'))).toHaveLength(5);
    expect(badges.filter((text) => text.includes('Unchanged since you rejected it'))).toHaveLength(
      1,
    );
    expect(badges.filter((text) => text === 'New or changed')).toHaveLength(3);
    expect(badges[6]).toBe('UnchangedUnchanged since you rejected it');
    expect(badges[2]).toBe('New or changed');
  });

  it('CARRY-FILTER Review new and changed sets the status filter and moves to the first such hunk', () => {
    startRoundOne(newAreas());
    loadSampleTwoFromDialog();
    continueAsRoundTwo();

    fireEvent.click(screen.getByRole('button', { name: 'Review new and changed' }));

    const radio = screen.getByRole('radio', { name: 'New or changed' });
    expect((radio as HTMLInputElement).checked).toBe(true);
    expect(articles()).toHaveLength(3);
    expect(document.activeElement).toBe(article(0));
    expect(article(0).getAttribute('aria-current')).toBe('true');
  });

  it('CARRY-UNDO Undo carry-over returns to round 1, clears prior and hands focus to the current hunk', () => {
    startRoundOne(newAreas());
    loadSampleTwoFromDialog();
    continueAsRoundTwo();

    fireEvent.click(screen.getByRole('button', { name: 'Undo carry-over' }));

    expect(screen.queryByRole('region', { name: 'Round 2 carry-over' })).toBeNull();
    expect(articles().filter((card) => badgesIn(card) !== '')).toHaveLength(0);
    expect(screen.getByText('0 of 9 hunks decided')).toBeTruthy();
    expect(document.activeElement).toBe(article(2));
    // One undo step: Ctrl+Z brings the carried round back.
    press('z', { ctrlKey: true });
    expect(screen.getByText('6 of 9 hunks decided')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Round 2 carry-over' })).toBeTruthy();
  });

  it('CARRY-RELOAD RV-RESTORE-FOCUS keeps the banner and badges after a reload without moving focus', () => {
    const areas = newAreas();
    startRoundOne(areas);
    loadSampleTwoFromDialog();
    continueAsRoundTwo();
    cleanup();

    renderApp(adapterOver(areas));

    expect(articles()).toHaveLength(9);
    const banner = screen.getByRole('region', { name: 'Round 2 carry-over' });
    expect(within(banner).getByText(BANNER)).toBeTruthy();
    expect(articles().filter((card) => badgesIn(card) !== '')).toHaveLength(9);
    expect(document.activeElement).toBe(document.body);
    expect(statusLine()).toBe('Restored review: 6 of 9 hunks decided.');
    expect(articles().filter((card) => card.tabIndex === 0)).toHaveLength(1);
  });

  it('CARRY-DISMISS Dismiss hides the banner for good, keeps the badges and focuses the current hunk', () => {
    const areas = newAreas();
    startRoundOne(areas);
    loadSampleTwoFromDialog();
    continueAsRoundTwo();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Round 2 carry-over' })).toBeNull();
    expect(document.activeElement).toBe(article(2));
    expect(articles().filter((card) => badgesIn(card) !== '')).toHaveLength(9);
    cleanup();

    renderApp(adapterOver(areas));
    expect(screen.queryByRole('region', { name: 'Round 2 carry-over' })).toBeNull();
    expect(articles().filter((card) => badgesIn(card) !== '')).toHaveLength(9);
  });

  it('CARRY-SAME Nothing to load. This diff is already open. changes nothing', () => {
    startRoundOne(newAreas());
    loadSampleTwoFromDialog();
    continueAsRoundTwo();
    const before = articles().length;

    loadSampleTwoFromDialog();

    expect(
      within(openDialog()).getByText('Nothing to load. This diff is already open.'),
    ).toBeTruthy();
    expect(within(openDialog()).queryByRole('radio')).toBeNull();
    expect(articles()).toHaveLength(before);
    expect(screen.getByText('6 of 9 hunks decided')).toBeTruthy();
    act(() => {
      openDialog().close();
    });
  });
});
