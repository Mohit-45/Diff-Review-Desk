// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStorageAdapter } from './adapter';
import { reviewKey, reviewRecord } from './areaFixtures';

const QUOTA_CHARS = 5_000_000;
const QUOTA_MESSAGE = 'Browser storage quota was reached; older reviews were removed.';

function usedChars(): number {
  let total = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) ?? '';
    total += key.length + (localStorage.getItem(key) ?? '').length;
  }
  return total;
}

/** Leaves exactly `room` characters free in localStorage. */
function fillExcept(room: number): void {
  const used = usedChars();
  const filler = 'f'.repeat(QUOTA_CHARS - used - room - 'filler'.length);
  localStorage.setItem('filler', filler);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('adapter on real browser storage', () => {
  it('uses the browser areas by default and keeps data under drd keys', () => {
    const adapter = createStorageAdapter();
    expect(adapter.mode).toBe('persistent');
    expect(adapter.notices).toEqual([]);
    adapter.setReview(reviewRecord('00000000001'));
    adapter.setDiff('00000000001', 'diff text');
    adapter.setTheme('dark');
    expect(localStorage.getItem(reviewKey('00000000001'))).not.toBeNull();
    expect(localStorage.getItem('drd:theme')).toBe('dark');
    expect(sessionStorage.getItem('drd:diff:00000000001')).toBe('diff text');
    expect(localStorage.getItem('drd:diff:00000000001')).toBeNull();
    const reloaded = createStorageAdapter();
    const stored = reloaded.getReview('00000000001');
    expect(stored.ok && stored.value?.fingerprint).toBe('00000000001');
    expect(reloaded.getDiff('00000000001')).toEqual({ ok: true, value: 'diff text' });
  });

  it('ST-CLEAR-FOREIGN removes only drd keys and never calls clear', () => {
    const clear = vi.spyOn(Storage.prototype, 'clear');
    localStorage.setItem('foreign', 'keep');
    sessionStorage.setItem('foreign', 'keep');
    const adapter = createStorageAdapter();
    adapter.setReview(reviewRecord('00000000001'));
    adapter.setPrefs({
      theme: 'light',
      shortcutsEnabled: true,
      autoAdvance: true,
      rememberDiff: false,
    });
    adapter.setDiff('00000000001', 'diff text');
    expect(adapter.clearAll()).toEqual({ ok: true, value: undefined });
    expect(clear).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('foreign')).toBe('keep');
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem('foreign')).toBe('keep');
    expect(adapter.mode).toBe('persistent');
  });

  it('ST-QUOTA evicts the oldest review and retries when the browser reports a full quota', () => {
    const adapter = createStorageAdapter();
    for (const [fingerprint, day] of [
      ['00000000001', '10'],
      ['00000000002', '11'],
      ['00000000003', '12'],
    ] as const) {
      adapter.setReview(reviewRecord(fingerprint, `2026-10-${day}T00:00:00.000Z`));
    }
    const recordChars =
      reviewKey('00000000001').length +
      (localStorage.getItem(reviewKey('00000000001')) ?? '').length;
    fillExcept(recordChars - 1);
    const result = adapter.setReview(reviewRecord('00000000004', '2026-10-19T00:00:00.000Z'));
    expect(result).toEqual({ ok: true, value: undefined });
    expect(adapter.mode).toBe('persistent');
    expect(adapter.notices).toEqual([
      { code: 'quota', key: reviewKey('00000000004'), message: QUOTA_MESSAGE },
    ]);
    expect(localStorage.getItem(reviewKey('00000000001'))).toBeNull();
    expect(localStorage.getItem(reviewKey('00000000002'))).not.toBeNull();
    expect(localStorage.getItem(reviewKey('00000000004'))).not.toBeNull();
  });

  it('ST-QUOTA drops the open diff and then falls back to memory when nothing more can be freed', () => {
    const adapter = createStorageAdapter();
    adapter.setDiff('00000000004', 'open diff');
    fillExcept(10);
    const result = adapter.setReview(reviewRecord('00000000004'));
    expect(result).toEqual({ ok: true, value: undefined });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices.map((notice) => notice.code)).toEqual(['quota', 'quota']);
    expect(sessionStorage.getItem('drd:diff:00000000004')).toBeNull();
    expect(localStorage.getItem(reviewKey('00000000004'))).toBeNull();
    const kept = adapter.getReview('00000000004');
    expect(kept.ok && kept.value?.fingerprint).toBe('00000000004');
  });
});
