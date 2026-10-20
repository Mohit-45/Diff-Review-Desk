import { describe, expect, it } from 'vitest';
import type { StorageError } from '../core/types';
import { OPEN_KEY, createStorageAdapter, type ReviewStorageAdapter } from './adapter';
import {
  ScriptedArea,
  always,
  onlyForKeys,
  reviewKey,
  reviewRecord,
  securityError,
  seedReview,
} from './areaFixtures';
import { diffKeyFor } from './keys';

const fingerprint = '00000000001';
const otherFingerprint = '00000000002';

function persistent(): {
  adapter: ReviewStorageAdapter;
  local: ScriptedArea;
  session: ScriptedArea;
} {
  const local = new ScriptedArea();
  const session = new ScriptedArea();
  return { adapter: createStorageAdapter({ local, session }), local, session };
}

function valueOf<T>(read: { ok: true; value: T } | { ok: false; error: StorageError }): T {
  if (!read.ok) {
    throw new Error(`Expected a successful read, got ${read.error.detail}`);
  }
  return read.value;
}

describe('adapter open review pointer', () => {
  it('reads null when this tab has no open review', () => {
    const { adapter } = persistent();
    expect(valueOf(adapter.getOpenFingerprint())).toBeNull();
  });

  it('round-trips the open fingerprint through sessionStorage only', () => {
    const { adapter, local, session } = persistent();
    expect(adapter.setOpenFingerprint(fingerprint)).toEqual({ ok: true, value: undefined });
    expect(valueOf(adapter.getOpenFingerprint())).toBe(fingerprint);
    expect(session.getItem(OPEN_KEY)).toBe(fingerprint);
    expect(local.getItem(OPEN_KEY)).toBeNull();
  });

  it('removes the pointer when set to null', () => {
    const { adapter, session } = persistent();
    adapter.setOpenFingerprint(fingerprint);
    adapter.setOpenFingerprint(null);
    expect(session.getItem(OPEN_KEY)).toBeNull();
    expect(valueOf(adapter.getOpenFingerprint())).toBeNull();
  });

  it.each(['', 'short', 'UPPERCASE001', '00000000001x', '__proto__'])(
    'reads a malformed stored pointer %j as none',
    (raw) => {
      const session = new ScriptedArea();
      session.seed(OPEN_KEY, raw);
      const adapter = createStorageAdapter({ local: new ScriptedArea(), session });
      expect(valueOf(adapter.getOpenFingerprint())).toBeNull();
    },
  );

  it('ST-DENIED keeps the pointer in memory when storage is blocked', () => {
    const blocked = new ScriptedArea().failWhen(
      'get',
      always(() => securityError()),
    );
    const adapter = createStorageAdapter({ local: blocked, session: blocked });
    expect(adapter.degraded).toBe(true);
    adapter.setOpenFingerprint(fingerprint);
    expect(valueOf(adapter.getOpenFingerprint())).toBe(fingerprint);
  });

  it('is removed by clearAll with the other app keys', () => {
    const { adapter, session } = persistent();
    adapter.setOpenFingerprint(fingerprint);
    adapter.clearAll();
    expect(session.getItem(OPEN_KEY)).toBeNull();
  });
});

describe('adapter removeAllDiffs', () => {
  it('ST-REMEMBER-OFF removes every remembered diff and leaves reviews and foreign keys', () => {
    const { adapter, local, session } = persistent();
    adapter.setDiff(fingerprint, 'one');
    adapter.setDiff(otherFingerprint, 'two');
    adapter.setOpenFingerprint(fingerprint);
    session.seed('foreign-session', 'keep');
    seedReview(local, reviewRecord(fingerprint));
    expect(adapter.removeAllDiffs()).toEqual({ ok: true, value: undefined });
    expect(session.getItem(diffKeyFor(fingerprint))).toBeNull();
    expect(session.getItem(diffKeyFor(otherFingerprint))).toBeNull();
    expect(valueOf(adapter.getDiff(fingerprint))).toBeNull();
    expect(session.getItem('foreign-session')).toBe('keep');
    expect(session.getItem(OPEN_KEY)).toBe(fingerprint);
    expect(local.getItem(reviewKey(fingerprint))).not.toBeNull();
  });

  it('reports a listing failure as unavailable without throwing', () => {
    const local = new ScriptedArea();
    const session = new ScriptedArea();
    const adapter = createStorageAdapter({ local, session });
    adapter.setDiff(fingerprint, 'text');
    session.failWhen(
      'key',
      onlyForKeys('', () => new Error('boom')),
    );
    const result = adapter.removeAllDiffs();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});

describe('adapter future-schema records', () => {
  const future = JSON.stringify({ ...reviewRecord(fingerprint), schemaVersion: 2 });

  it('ST-FUTURE never overwrites a newer record and keeps the review in memory only', () => {
    const local = new ScriptedArea();
    local.seed(reviewKey(fingerprint), future);
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    const written = adapter.setReview(reviewRecord(fingerprint, '2026-10-20T00:00:00.000Z'));
    expect(written).toEqual({ ok: true, value: undefined });
    expect(local.getItem(reviewKey(fingerprint))).toBe(future);
    expect(local.calls.filter((call) => call === `set:${reviewKey(fingerprint)}`)).toEqual([]);
    expect(adapter.notices.map((notice) => notice.code)).toEqual(['future-schema']);
    expect(adapter.degraded).toBe(false);
  });

  it('ST-FUTURE still writes other fingerprints normally', () => {
    const local = new ScriptedArea();
    local.seed(reviewKey(fingerprint), future);
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    adapter.setReview(reviewRecord(otherFingerprint));
    expect(local.getItem(reviewKey(otherFingerprint))).not.toBeNull();
    expect(local.getItem(reviewKey(fingerprint))).toBe(future);
  });

  it('overwrites a corrupt record, which is not protected', () => {
    const local = new ScriptedArea();
    local.seed(reviewKey(fingerprint), '{');
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    adapter.setReview(reviewRecord(fingerprint));
    expect(local.getItem(reviewKey(fingerprint))).not.toBe('{');
    expect(valueOf(adapter.getReview(fingerprint))?.fingerprint).toBe(fingerprint);
  });
});
