import { describe, expect, it } from 'vitest';
import { parseDiff } from '../core/parser/parse';
import type { ReviewState } from '../core/types';
import { AGENT_RUN_1_DIFF, AGENT_RUN_2_DIFF } from '../samples';
import { memoryAreas, smallDiff } from './appFixtures';
import { sampleOneRoundOne } from './carryFixtures';
import { planLoad, readDismissed, CARRY_SOURCES, decidedCount } from './loadPlan';
import { openWithStored } from './openStored';
import { persistReview } from './persist';

function opened(text: string, current: ReviewState | null, adapter = memoryAreas().adapter) {
  const result = openWithStored(text, { adapter, current });
  if (!result.ok) throw new Error('The fixture diff did not open.');
  return { value: result.value, adapter };
}

function save(
  state: ReviewState,
  adapter = memoryAreas().adapter,
  updatedAt = '2026-01-01T00:00:00Z',
) {
  persistReview(state, { adapter, updatedAt });
  return adapter;
}

describe('planLoad', () => {
  it('CARRY-PLAN-SAME says nothing to load for the open diff', () => {
    const current = sampleOneRoundOne();
    const { value, adapter } = opened(AGENT_RUN_1_DIFF, current);
    expect(planLoad(value, { current, adapter })).toEqual({ kind: 'same-open' });
  });

  it('CARRY-PLAN-OPEN opens a first diff straight away', () => {
    const { value, adapter } = opened(AGENT_RUN_2_DIFF, null);
    expect(planLoad(value, { current: null, adapter }).kind).toBe('open');
  });

  it('CARRY-PLAN-CARRY offers round 2 when the open review has a carried hunk', () => {
    const current = sampleOneRoundOne();
    const { value, adapter } = opened(AGENT_RUN_2_DIFF, current);
    const plan = planLoad(value, { current, adapter });
    expect(plan.kind).toBe('carry');
    if (plan.kind !== 'carry') return;
    expect(plan.previous).toBe(current);
    expect(plan.summary.carriedIds).toHaveLength(6);
    expect(plan.summary.state.round).toBe(2);
  });

  it('CARRY-PLAN-NOTE never carries the overall note into the next round', () => {
    const current = { ...sampleOneRoundOne(), overallNote: 'Fix the key first' };
    const { value, adapter } = opened(AGENT_RUN_2_DIFF, current);
    const plan = planLoad(value, { current, adapter });
    expect(plan.kind === 'carry' && plan.summary.state.overallNote).toBe('');
  });

  it('CARRY-PLAN-NONE opens a diff with no repeated hunk straight away when nothing is decided', () => {
    const { value, adapter } = opened(smallDiff(), null);
    expect(planLoad(value, { current: null, adapter }).kind).toBe('open');
  });

  it('CARRY-PLAN-START-ONLY asks, offering only a fresh start, when nothing repeats over a decided review', () => {
    const current = sampleOneRoundOne();
    const { value, adapter } = opened(smallDiff(), current);
    const plan = planLoad(value, { current, adapter });
    expect(plan.kind).toBe('carry');
    if (plan.kind === 'carry') expect(plan.summary.carriedIds).toHaveLength(0);
  });

  it('CARRY-PLAN-UNDECIDED opens straight away when repeated hunks hold no decision', () => {
    const first = parseDiff(AGENT_RUN_1_DIFF);
    if (!first.ok) throw new Error('Sample 1 did not parse.');
    const [firstId, secondId] = first.files.flatMap((file) => file.hunks.map((hunk) => hunk.id));
    if (firstId === undefined || secondId === undefined) throw new Error('No hunks.');
    const current = { ...sampleOneRoundOne(), hunks: {} };
    const decidedElsewhere = {
      ...current,
      hunks: { [secondId]: { decision: 'rejected' as const, comment: '' } },
    };
    const { value, adapter } = opened(AGENT_RUN_2_DIFF, decidedElsewhere);
    // Hunk 2 is gone from sample 2 and the repeated hunks are undecided: nothing carries.
    expect(planLoad(value, { current: decidedElsewhere, adapter }).kind).toBe('open');
  });

  it('CARRY-PLAN-STORED lets the newest stored review lend decisions when the open one cannot', () => {
    const adapter = save(sampleOneRoundOne());
    const current = opened(smallDiff(), null, adapter).value.state;
    const { value } = opened(AGENT_RUN_2_DIFF, current, adapter);
    const plan = planLoad(value, { current, adapter });
    expect(plan.kind).toBe('carry');
    if (plan.kind !== 'carry') return;
    expect(plan.previous.label).toBe('Sample: agent run 1');
    expect(plan.summary.carriedIds).toHaveLength(6);
  });

  it('CARRY-PLAN-RECENT looks only at the five newest stored reviews', () => {
    const adapter = memoryAreas().adapter;
    save(sampleOneRoundOne(), adapter, '2026-01-01T00:00:00Z');
    for (let index = 0; index < CARRY_SOURCES; index += 1) {
      const text = smallDiff(`filler-${String(index)}`).replaceAll(
        'src/a.ts',
        `src/f${String(index)}.ts`,
      );
      const state = opened(text, null, adapter).value.state;
      save(state, adapter, `2026-02-0${String(index + 1)}T00:00:00Z`);
    }
    const { value } = opened(AGENT_RUN_2_DIFF, null, adapter);
    expect(planLoad(value, { current: null, adapter }).kind).toBe('open');
  });

  it('CARRY-PLAN-RESTORE asks before replacing a review that has decisions', () => {
    const adapter = save(sampleOneRoundOne());
    const current = opened(smallDiff(), null, adapter).value.state;
    const decided = {
      ...current,
      hunks: { [current.hunkIds[0] ?? '']: { decision: 'approved' as const, comment: '' } },
    };
    const { value } = opened(AGENT_RUN_1_DIFF, decided, adapter);
    const plan = planLoad(value, { current: decided, adapter });
    expect(plan.kind).toBe('restore');
    if (plan.kind === 'restore') expect(plan.openDecisions).toBe(1);
  });

  it('CARRY-PLAN-RESTORE restores without asking when the open review has no decisions', () => {
    const adapter = save(sampleOneRoundOne());
    const current = opened(smallDiff(), null, adapter).value.state;
    const { value } = opened(AGENT_RUN_1_DIFF, current, adapter);
    expect(planLoad(value, { current, adapter }).kind).toBe('open');
  });
});

describe('readDismissed', () => {
  it('CARRY-DISMISSED reads the flag a record was saved with', () => {
    const adapter = memoryAreas().adapter;
    const state = sampleOneRoundOne();
    expect(readDismissed(adapter, state.fingerprint)).toBe(false);
    persistReview(state, { adapter, updatedAt: '2026-01-01T00:00:00Z', carryoverDismissed: true });
    expect(readDismissed(adapter, state.fingerprint)).toBe(true);
  });

  it('CARRY-DISMISSED leaves the field out of a record that was not dismissed', () => {
    const adapter = memoryAreas().adapter;
    const state = sampleOneRoundOne();
    persistReview(state, { adapter, updatedAt: '2026-01-01T00:00:00Z' });
    const stored = adapter.getReview(state.fingerprint);
    expect(stored.ok && stored.value !== null && 'carryoverDismissed' in stored.value).toBe(false);
  });
});

describe('decidedCount', () => {
  it('CARRY-COUNT counts decisions, not comments', () => {
    expect(decidedCount(sampleOneRoundOne())).toBe(11);
    expect(
      decidedCount({ ...sampleOneRoundOne(), hunks: { x: { decision: null, comment: 'c' } } }),
    ).toBe(0);
  });
});
