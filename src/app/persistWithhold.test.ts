import { describe, expect, it } from 'vitest';
import { decidedState, memoryAreas, smallDiff } from './appFixtures';
import { persistReview } from './persist';

const updatedAt = '2026-10-20T00:00:00.000Z';

describe('RV-RULE-THROWS persistence stores decisions only when a rule could not run', () => {
  it('keeps the review record and keeps the diff text out, even with remembering on', () => {
    const text = smallDiff();
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    const saved = persistReview(state, {
      adapter,
      updatedAt,
      diffText: text,
      rememberDiff: true,
      withholdDiff: true,
    });
    expect(saved.ok && saved.value.diff).toBe('withheld');
    expect(saved.ok && saved.value.diffNote).toBeNull();
    const record = adapter.getReview(state.fingerprint);
    expect(record.ok && record.value?.decisions).toBeDefined();
    const diff = adapter.getDiff(state.fingerprint);
    expect(diff.ok && diff.value).toBeNull();
  });

  it('removes a diff text that an earlier save had stored', () => {
    const text = smallDiff();
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    persistReview(state, { adapter, updatedAt, diffText: text, rememberDiff: true });
    expect(adapter.getDiff(state.fingerprint)).toEqual({ ok: true, value: text });
    persistReview(state, {
      adapter,
      updatedAt,
      diffText: text,
      rememberDiff: true,
      withholdDiff: true,
    });
    const diff = adapter.getDiff(state.fingerprint);
    expect(diff.ok && diff.value).toBeNull();
  });

  it('leaves the usual behaviour alone when nothing is withheld', () => {
    const text = smallDiff();
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    const saved = persistReview(state, {
      adapter,
      updatedAt,
      diffText: text,
      rememberDiff: true,
      withholdDiff: false,
    });
    expect(saved.ok && saved.value.diff).toBe('saved');
  });
});
