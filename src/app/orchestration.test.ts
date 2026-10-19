import { describe, expect, it } from 'vitest';
import type { DiffFile, ParseResult } from '../core/types';
import { createReviewState, reviewReducer } from '../core/review/reducer';
import { createMemoryStorageAdapter } from '../storage/adapter';
import { clearAll } from './clear';
import { createLoadGeneration, latestOnly } from './generation';
import { openDiff, restoreReview } from './open';
import { persistReview } from './persist';

const firstId = 'f00000000001:00000000001';
const secondId = 'f00000000001:00000000002';

function files(ids: readonly string[]): readonly DiffFile[] {
  return [
    {
      id: 'f00000000001',
      displayPath: 'src/a.ts',
      oldPath: 'src/a.ts',
      newPath: 'src/a.ts',
      status: 'modified',
      similarity: null,
      oldMode: null,
      newMode: null,
      kind: 'regular',
      binary: false,
      generated: false,
      hunks: ids.map((id, index) => ({
        id,
        fileId: 'f00000000001',
        index,
        kind: 'text' as const,
        meta: [],
        header: '@@ -1 +1 @@',
        section: '',
        oldStart: 1,
        oldCount: 1,
        newStart: 1,
        newCount: 1,
        lines: [],
        added: 1,
        removed: 0,
        truncated: false,
        countMismatch: false,
        hash: '00000000001',
      })),
      added: ids.length,
      removed: 0,
      incomplete: false,
    },
  ];
}

function parser(fingerprint: string, ids: readonly string[]): ParseResult {
  return {
    ok: true,
    fingerprint,
    files: files(ids),
    warnings: [],
    stats: {
      inputBytes: 1,
      totalLines: 1,
      lineClasses: {
        preamble: 0,
        fileHeader: 0,
        hunkHeader: 1,
        hunkBody: 0,
        separator: 0,
        trailer: 0,
        binaryPayload: 0,
        unknown: 0,
      },
      orphanLines: 0,
      warningsDropped: 0,
      workUnits: 1,
    },
  };
}

describe('app orchestration', () => {
  it('opens a new review, restores same-fingerprint storage, and carries over explicitly', () => {
    const adapter = createMemoryStorageAdapter();
    const first = openDiff('diff --git a/a b/a', {
      parser: () => parser('00000000001', [firstId]),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const reviewed = reviewReducer(first.value.state, {
      type: 'decide',
      id: firstId,
      decision: 'approved',
    });
    expect(persistReview(reviewed, { adapter, updatedAt: '2026-10-19T00:00:00.000Z' }).ok).toBe(
      true,
    );
    const saved = adapter.getReview('00000000001');
    const restored = openDiff('same', {
      parser: () => parser('00000000001', [firstId]),
      stored: saved.ok ? saved.value : null,
    });
    expect(restored.ok && restored.value.outcome).toBe('restored');
    const next = openDiff('next', {
      parser: () => parser('00000000002', [firstId, secondId]),
      current: reviewed,
      choice: 'carry-over',
    });
    expect(next.ok && next.value.outcome).toBe('carry-over');
    expect(next.ok && next.value.state.hunks[firstId]?.decision).toBe('approved');
  });

  it('withholds IN-SECRET-DIFF text and remembers decisions only', () => {
    const adapter = createMemoryStorageAdapter();
    const state = createReviewState('00000000001', [firstId]);
    const result = persistReview(state, {
      adapter,
      updatedAt: '2026-10-19T00:00:00.000Z',
      diffText: 'api_key = "not for storage"',
      rememberDiff: true,
      findSecretSpans: () => ['secret-span'],
    });
    expect(result.ok && result.value.diff).toBe('withheld');
    const withheld = adapter.getDiff('00000000001');
    expect(withheld.ok && withheld.value).toBeNull();
    expect(result.ok && result.value.notices.join(' ')).toContain('Your diff text was not saved');
  });

  it('ST-REMEMBER-OFF deletes the diff key and clearAll leaves the adapter ready', () => {
    const adapter = createMemoryStorageAdapter();
    const state = createReviewState('00000000001', [firstId]);
    persistReview(state, {
      adapter,
      updatedAt: '2026-10-19T00:00:00.000Z',
      diffText: 'diff',
      rememberDiff: true,
    });
    persistReview(state, {
      adapter,
      updatedAt: '2026-10-19T00:00:01.000Z',
      diffText: 'diff',
      rememberDiff: false,
    });
    const removed = adapter.getDiff('00000000001');
    expect(removed.ok && removed.value).toBeNull();
    expect(clearAll(adapter).ok).toBe(true);
  });

  it('reload restore reruns the parser and keeps decisions when the stored diff key no longer matches', () => {
    const adapter = createMemoryStorageAdapter();
    let state = createReviewState('00000000001', [firstId]);
    state = reviewReducer(state, { type: 'decide', id: firstId, decision: 'approved' });
    expect(
      persistReview(state, {
        adapter,
        updatedAt: '2026-10-19T00:00:00.000Z',
        diffText: 'saved',
        rememberDiff: true,
      }).ok,
    ).toBe(true);
    const restored = restoreReview('00000000001', {
      adapter,
      parser: () => parser('00000000001', [firstId]),
    });
    expect(restored.ok && restored.value.restoredDiff).toBe(true);
    adapter.setDiff('00000000001', 'changed');
    const decisionsOnly = restoreReview('00000000001', {
      adapter,
      parser: () => parser('00000000002', [firstId]),
    });
    expect(decisionsOnly.ok && decisionsOnly.value.restoredDiff).toBe(false);
    expect(decisionsOnly.ok && decisionsOnly.value.state.hunks[firstId]?.decision).toBe('approved');
  });

  it('IN-RACE returns a stale Result for an older asynchronous load', async () => {
    const generation = createLoadGeneration();
    const first = latestOnly(generation, async () => {
      await Promise.resolve();
      return { ok: true as const, value: 'first' };
    });
    const second = latestOnly(generation, async () => ({ ok: true as const, value: 'second' }));
    expect(await second).toEqual({ ok: true, value: 'second' });
    expect(await first).toMatchObject({ ok: false, error: { code: 'stale-load' } });
  });
});
