import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CarryFacts } from '../../app/carryFacts';
import { roundTwoSummary, sampleOneRoundOne } from '../../app/carryFixtures';
import type { PendingLoad } from '../../app/loadPlan';
import type { OpenDiffValue } from '../../app/open';
import { CarryBadges } from './CarryBadges';
import { CarryOverBanner } from './CarryOverBanner';
import { DEFAULT_REVIEW_FILTERS, Filters } from './Filters';
import { LoadDecision } from './LoadDecision';

afterEach(cleanup);

const FACTS: CarryFacts = {
  round: 2,
  priorRound: 1,
  unchanged: 6,
  total: 9,
  approved: 5,
  rejected: 1,
  newOrChanged: 3,
  gone: 5,
  goneRejected: 4,
};

/** Only the fields the step reads; the rest of a parsed diff is irrelevant to the question. */
function carryPending(withCarry: boolean): PendingLoad {
  const summary = roundTwoSummary();
  const previous = withCarry ? sampleOneRoundOne() : { ...sampleOneRoundOne(), hunks: {} };
  const empty = { ...summary, carriedIds: [], carried: {} };
  return {
    kind: 'carry',
    opened: {} as OpenDiffValue,
    previous,
    summary: withCarry ? summary : { ...empty, state: { ...summary.state, hunks: {} } },
  };
}

describe('LoadDecision step 2', () => {
  it('CARRY-STEP2 shows the summary and both radios, with round N+1 selected', () => {
    render(<LoadDecision pending={carryPending(true)} onResolve={vi.fn()} onCancel={vi.fn()} />);

    expect(
      screen.getByText(
        '6 of 9 hunks are unchanged: 5 approved and 1 rejected carry over. 3 are new or changed, 5 no longer present (4 were rejected).',
      ),
    ).toBeTruthy();
    const group = screen.getByRole('group', { name: 'What should happen to your decisions?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => (radio as HTMLInputElement).checked)).toEqual([true, false]);
    expect(
      within(group)
        .getByRole('radio', { name: 'Continue as round 2' })
        .getAttribute('aria-describedby'),
    ).not.toBeNull();
  });

  it('CARRY-STEP2 names the consequence on the primary button and sends the chosen answer', () => {
    const onResolve = vi.fn();
    render(<LoadDecision pending={carryPending(true)} onResolve={onResolve} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue as round 2' }));
    expect(onResolve).toHaveBeenLastCalledWith('carry-over');

    fireEvent.click(screen.getByRole('radio', { name: 'Start new review' }));
    expect(screen.queryByRole('button', { name: 'Continue as round 2' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start new review' }));
    expect(onResolve).toHaveBeenLastCalledWith('new');
  });

  it('CARRY-STEP2 states what Start new review discards', () => {
    render(<LoadDecision pending={carryPending(true)} onResolve={vi.fn()} onCancel={vi.fn()} />);

    const radio = screen.getByRole('radio', { name: 'Start new review' });
    const detail = document.getElementById(radio.getAttribute('aria-describedby') ?? '');
    expect(detail?.textContent).toBe(
      'Starts at round 1 with every hunk pending and discards 11 decisions from round 1. They stay saved with the old diff.',
    );
  });

  it('CARRY-STEP2 offers only Start new review when nothing carries', () => {
    const onResolve = vi.fn();
    render(<LoadDecision pending={carryPending(false)} onResolve={onResolve} onCancel={vi.fn()} />);

    expect(screen.queryByRole('radio', { name: /^Continue as round/ })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Start new review' })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('button', { name: 'Start new review' }));
    expect(onResolve).toHaveBeenCalledWith('new');
  });

  it('CARRY-STEP2 takes focus on its heading and Back reports a cancel', () => {
    const onCancel = vi.fn();
    render(<LoadDecision pending={carryPending(true)} onResolve={vi.fn()} onCancel={onCancel} />);

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Another round of this review?' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('CARRY-RESTORE asks to restore, naming what happens to the open review', () => {
    const state = sampleOneRoundOne();
    const onResolve = vi.fn();
    const pending: PendingLoad = {
      kind: 'restore',
      opened: { state } as OpenDiffValue,
      openDecisions: 3,
      dismissed: false,
    };
    render(<LoadDecision pending={pending} onResolve={onResolve} onCancel={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Restore a saved review?' })).toBeTruthy();
    expect(screen.getByText(/which has 3 decisions\./u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore saved review' }));
    expect(onResolve).toHaveBeenCalledWith('restore');
    expect(screen.getByRole('button', { name: 'Keep current review' })).toBeTruthy();
  });
});

describe('CarryOverBanner', () => {
  it('CARRY-BANNER is a labelled section with the sentence and three buttons', () => {
    const handlers = { onReviewNew: vi.fn(), onUndo: vi.fn(), onDismiss: vi.fn() };
    render(<CarryOverBanner facts={FACTS} {...handlers} />);

    const banner = screen.getByRole('region', { name: 'Round 2 carry-over' });
    expect(within(banner).getByText(/^\s*Round 2\. 6 decisions carried over/u)).toBeTruthy();
    fireEvent.click(within(banner).getByRole('button', { name: 'Review new and changed' }));
    fireEvent.click(within(banner).getByRole('button', { name: 'Undo carry-over' }));
    fireEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));
    expect(handlers.onReviewNew).toHaveBeenCalledTimes(1);
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('CARRY-BANNER leaves out Review new and changed when nothing is new or changed', () => {
    render(
      <CarryOverBanner
        facts={{ ...FACTS, newOrChanged: 0 }}
        onReviewNew={vi.fn()}
        onUndo={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Review new and changed' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('CARRY-BANNER is not a live region, so a reload stays quiet', () => {
    render(
      <CarryOverBanner facts={FACTS} onReviewNew={vi.fn()} onUndo={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(document.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
  });
});

describe('CarryBadges', () => {
  it('CARRY-BADGE shows icon and words for an unchanged hunk', () => {
    const { container } = render(
      <CarryBadges badge={{ kind: 'unchanged', carried: 'approved', round: 1 }} />,
    );

    expect(screen.getByText('Unchanged')).toBeTruthy();
    expect(screen.getByText('Approved in round 1')).toBeTruthy();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('CARRY-BADGE shows icon and words for a new or changed hunk', () => {
    const { container } = render(<CarryBadges badge={{ kind: 'new-or-changed' }} />);

    expect(screen.getByText('New or changed')).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('CARRY-BADGE renders nothing without a badge', () => {
    const { container } = render(<CarryBadges badge={null} />);

    expect(container.textContent).toBe('');
  });
});

describe('Filters in round 1', () => {
  it('CARRY-FILTER offers New or changed only from round 2', () => {
    const { rerender } = render(
      <Filters value={DEFAULT_REVIEW_FILTERS} onChange={vi.fn()} showNewOrChanged={false} />,
    );
    expect(screen.queryByRole('radio', { name: 'New or changed' })).toBeNull();

    rerender(<Filters value={DEFAULT_REVIEW_FILTERS} onChange={vi.fn()} showNewOrChanged />);
    expect(screen.getByRole('radio', { name: 'New or changed' })).toBeTruthy();
  });
});
