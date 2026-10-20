import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prefs, StorageError } from '../core/types';
import {
  DIFF_KEY_PREFIX,
  MemoryStorageArea,
  PREFS_KEY,
  THEME_KEY,
  createMemoryStorageAdapter,
  createStorageAdapter,
  type ReviewStorageAdapter,
  type StorageNotice,
} from './adapter';
import {
  ScriptedArea,
  always,
  onlyForKeys,
  reviewKey,
  reviewRecord,
  securityError,
  seedReview,
} from './areaFixtures';
import { DEFAULT_PREFS } from './validator';

const DEGRADED_MESSAGE =
  "Progress isn't being saved in this browser. Export your review to keep it.";
const degraded: StorageNotice = { code: 'degraded', key: null, message: DEGRADED_MESSAGE };
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

function unavailable(detail: string): StorageError {
  return {
    code: 'unavailable',
    title: 'Browser storage is unavailable',
    detail,
    suggestion: 'Keep this tab open or export your review to keep it.',
  };
}

function valueOf<T>(read: { ok: true; value: T } | { ok: false; error: StorageError }): T {
  if (!read.ok) {
    throw new Error(`Expected a successful read, got ${read.error.detail}`);
  }
  return read.value;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adapter initial mode', () => {
  it('uses persistent mode when both areas are usable', () => {
    const { adapter } = persistent();
    expect(adapter.mode).toBe('persistent');
    expect(adapter.degraded).toBe(false);
    expect(adapter.notices).toEqual([]);
  });

  it.each([
    ['no areas', { local: null, session: null }],
    ['no local area', { local: null, session: new MemoryStorageArea() }],
    ['no session area', { local: new MemoryStorageArea(), session: null }],
  ])('ST-DENIED falls back to memory with %s', (_label, options) => {
    const adapter = createStorageAdapter(options);
    expect(adapter.mode).toBe('memory');
    expect(adapter.degraded).toBe(true);
    expect(adapter.notices).toEqual([degraded]);
  });

  it('builds a memory adapter without touching browser storage', () => {
    const adapter = createMemoryStorageAdapter();
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([degraded]);
    expect(valueOf(adapter.getPrefs())).toEqual(DEFAULT_PREFS);
  });

  it.each([
    ['security', securityError],
    ['generic', () => new Error('boom')],
  ])('ST-DENIED falls back to memory when a %s error blocks the first read', (_label, thrown) => {
    const local = new ScriptedArea().failWhen('get', always(thrown));
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([degraded]);
    const session = new ScriptedArea().failWhen('get', always(thrown));
    expect(createStorageAdapter({ local: new ScriptedArea(), session }).mode).toBe('memory');
  });

  it('falls back to memory when the area cannot be enumerated', () => {
    const local = new ScriptedArea().failWhen(
      'length',
      always(() => new Error('length')),
    );
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([degraded]);
    const keyed = new ScriptedArea();
    keyed.seed('a', 'b');
    keyed.failWhen(
      'key',
      always(() => new Error('key')),
    );
    expect(createStorageAdapter({ local: new ScriptedArea(), session: keyed }).mode).toBe('memory');
  });

  it('falls back to memory when a stored value cannot be read while copying', () => {
    const local = new ScriptedArea();
    local.seed('drd:other', 'value');
    local.failWhen(
      'get',
      onlyForKeys(
        'drd:other',
        always(() => new Error('read')),
      ),
    );
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([degraded]);
  });

  it('keeps stored data readable after falling back to memory', () => {
    const local = new ScriptedArea();
    seedReview(local, reviewRecord(fingerprint));
    local.failWhen('set', onlyForKeys(reviewKey(otherFingerprint), always(securityError)));
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    expect(adapter.mode).toBe('persistent');
    expect(adapter.setReview(reviewRecord(otherFingerprint)).ok).toBe(true);
    expect(adapter.mode).toBe('memory');
    expect(adapter.degraded).toBe(true);
    expect(adapter.notices).toEqual([degraded]);
    expect(valueOf(adapter.getReview(fingerprint))?.fingerprint).toBe(fingerprint);
    expect(valueOf(adapter.getReview(otherFingerprint))?.fingerprint).toBe(otherFingerprint);
    expect(valueOf(adapter.listReviews()).map((record) => record.fingerprint)).toEqual([
      fingerprint,
      otherFingerprint,
    ]);
  });

  it('reads the browser areas by default and ignores unusable globals', () => {
    const local = new ScriptedArea();
    const session = new ScriptedArea();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    const adapter = createStorageAdapter();
    expect(adapter.mode).toBe('persistent');
    adapter.setTheme('dark');
    expect(local.getItem(THEME_KEY)).toBe('dark');
    vi.stubGlobal('localStorage', null);
    expect(createStorageAdapter().mode).toBe('memory');
    vi.stubGlobal('localStorage', {});
    expect(createStorageAdapter().mode).toBe('memory');
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', undefined);
    expect(createStorageAdapter().mode).toBe('memory');
  });

  it('ST-DENIED treats a throwing storage getter as unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw securityError();
      },
    });
    vi.stubGlobal('sessionStorage', new ScriptedArea());
    try {
      const adapter = createStorageAdapter();
      expect(adapter.mode).toBe('memory');
      expect(adapter.notices).toEqual([degraded]);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, 'localStorage');
      } else {
        Object.defineProperty(globalThis, 'localStorage', original);
      }
    }
  });

  it('accepts positional areas, a null local area and an options object', () => {
    const local = new ScriptedArea();
    const session = new ScriptedArea();
    const positional = createStorageAdapter(local, session);
    expect(positional.mode).toBe('persistent');
    positional.setTheme('light');
    expect(local.getItem(THEME_KEY)).toBe('light');
    expect(createStorageAdapter(null, session).mode).toBe('memory');
    expect(createStorageAdapter(null).mode).toBe('memory');
    expect(createStorageAdapter({ local, session }).mode).toBe('persistent');
    const onlySetItem = { setItem: () => undefined } as unknown as ScriptedArea;
    expect(createStorageAdapter(onlySetItem, session).mode).toBe('memory');
  });
});

describe('adapter review reads', () => {
  it('returns null for a review that was never saved', () => {
    const { adapter } = persistent();
    expect(adapter.getReview(fingerprint)).toEqual({ ok: true, value: null });
    expect(valueOf(adapter.listReviews())).toEqual([]);
    expect(adapter.notices).toEqual([]);
  });

  it('round-trips a record through setReview and getReview', () => {
    const { adapter, local } = persistent();
    const record = reviewRecord(fingerprint);
    expect(adapter.setReview(record)).toEqual({ ok: true, value: undefined });
    expect(valueOf(adapter.getReview(fingerprint))).toEqual(record);
    expect(local.getItem(reviewKey(fingerprint))).toBe(JSON.stringify(record));
  });

  it('refuses to save a record the validator rejects', () => {
    const { adapter, local } = persistent();
    expect(
      adapter.setReview(reviewRecord(fingerprint, undefined, { label: 'x'.repeat(81) })),
    ).toEqual({
      ok: false,
      error: unavailable('The review could not be saved.'),
    });
    expect(local.calls).toEqual([]);
  });

  it.each([
    [
      'text that is not JSON',
      '{',
      'corrupt',
      'Saved review data was corrupt and was not restored.',
    ],
    [
      'an unknown key',
      JSON.stringify({ ...reviewRecord(fingerprint), extra: 1 }),
      'corrupt',
      'Saved review data was corrupt and was not restored.',
    ],
    [
      'oversized text',
      'x'.repeat(1_500_001),
      'corrupt',
      'Saved review data was corrupt and was not restored.',
    ],
    [
      'a record stored under another fingerprint',
      JSON.stringify(reviewRecord(otherFingerprint)),
      'corrupt',
      'Saved review data was corrupt and was not restored.',
    ],
    [
      'a newer schema',
      JSON.stringify({ ...reviewRecord(fingerprint), schemaVersion: 2 }),
      'future-schema',
      'Saved review data is from a newer version and was not restored.',
    ],
    [
      'an unsupported hash version',
      JSON.stringify({ ...reviewRecord(fingerprint), hashVersion: 2 }),
      'hash-version',
      'Saved review data uses an unsupported hash and was not restored.',
    ],
  ])(
    'ST-CORRUPT and ST-FUTURE treat %s as absent with one notice',
    (_label, raw, code, message) => {
      const local = new ScriptedArea();
      local.seed(reviewKey(fingerprint), raw);
      const fresh = createStorageAdapter({ local, session: new ScriptedArea() });
      expect(fresh.getReview(fingerprint)).toEqual({ ok: true, value: null });
      expect(fresh.getReview(fingerprint)).toEqual({ ok: true, value: null });
      expect(fresh.notices).toEqual([{ code, key: reviewKey(fingerprint), message }]);
      expect(local.getItem(reviewKey(fingerprint))).toBe(raw);
    },
  );

  it('keeps separate notices for separate keys', () => {
    const local = new ScriptedArea();
    local.seed(reviewKey(fingerprint), '{');
    local.seed(reviewKey(otherFingerprint), '[');
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    adapter.getReview(fingerprint);
    adapter.getReview(otherFingerprint);
    adapter.getReview(fingerprint);
    expect(adapter.notices.map((notice) => notice.key)).toEqual([
      reviewKey(fingerprint),
      reviewKey(otherFingerprint),
    ]);
  });

  it('lists valid reviews, skips corrupt ones and ignores foreign keys', () => {
    const local = new ScriptedArea();
    seedReview(local, reviewRecord(fingerprint, '2026-10-18T00:00:00.000Z'));
    local.seed(reviewKey('00000000003'), '{');
    seedReview(local, reviewRecord(otherFingerprint, '2026-10-19T00:00:00.000Z'));
    local.seed('foreign', 'value');
    local.seed(PREFS_KEY, JSON.stringify(DEFAULT_PREFS));
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    expect(valueOf(adapter.listReviews()).map((record) => record.fingerprint)).toEqual([
      fingerprint,
      otherFingerprint,
    ]);
    expect(adapter.notices.map((notice) => notice.code)).toEqual(['corrupt']);
  });
});

describe('adapter preferences and theme', () => {
  const prefs: Prefs = {
    theme: 'dark',
    shortcutsEnabled: false,
    autoAdvance: false,
    rememberDiff: true,
  };

  it('returns a fresh copy of the defaults when nothing is saved', () => {
    const { adapter } = persistent();
    const read = valueOf(adapter.getPrefs());
    expect(read).toEqual(DEFAULT_PREFS);
    expect(read).not.toBe(DEFAULT_PREFS);
  });

  it('round-trips preferences with a fixed key order', () => {
    const { adapter, local } = persistent();
    expect(adapter.setPrefs(prefs)).toEqual({ ok: true, value: undefined });
    expect(local.getItem(PREFS_KEY)).toBe(
      '{"theme":"dark","shortcutsEnabled":false,"autoAdvance":false,"rememberDiff":true}',
    );
    expect(valueOf(adapter.getPrefs())).toEqual(prefs);
  });

  it('resets corrupt preferences with one notice', () => {
    const local = new ScriptedArea();
    local.seed(PREFS_KEY, '{"theme":"blue"}');
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    expect(valueOf(adapter.getPrefs())).toEqual(DEFAULT_PREFS);
    adapter.getPrefs();
    expect(adapter.notices).toEqual([
      {
        code: 'corrupt',
        key: PREFS_KEY,
        message: 'Saved preferences were corrupt and were reset.',
      },
    ]);
  });

  it('refuses invalid preferences without writing', () => {
    const { adapter, local } = persistent();
    const invalid = { ...prefs, theme: 'blue' } as unknown as Prefs;
    expect(adapter.setPrefs(invalid)).toEqual({
      ok: false,
      error: unavailable('Preferences could not be saved.'),
    });
    expect(local.calls).toEqual([]);
  });

  it('reads and writes the mirrored theme', () => {
    const { adapter, local } = persistent();
    expect(valueOf(adapter.getTheme())).toBe('system');
    for (const theme of ['light', 'dark', 'system'] as const) {
      expect(adapter.setTheme(theme)).toEqual({ ok: true, value: undefined });
      expect(local.getItem(THEME_KEY)).toBe(theme);
      expect(valueOf(adapter.getTheme())).toBe(theme);
    }
  });

  it('treats an unknown stored theme as system and refuses an unknown theme', () => {
    const { adapter, local } = persistent();
    local.seed(THEME_KEY, 'blue');
    expect(valueOf(adapter.getTheme())).toBe('system');
    local.seed(THEME_KEY, 'Dark');
    expect(valueOf(adapter.getTheme())).toBe('system');
    local.calls.length = 0;
    expect(adapter.setTheme('blue' as unknown as Prefs['theme'])).toEqual({
      ok: false,
      error: unavailable('The selected theme is invalid.'),
    });
    expect(local.calls).toEqual([]);
  });
});

describe('adapter diff text', () => {
  it('round-trips diff text through the session area', () => {
    const { adapter, session } = persistent();
    expect(adapter.getDiff(fingerprint)).toEqual({ ok: true, value: null });
    expect(adapter.setDiff(fingerprint, 'diff text')).toEqual({ ok: true, value: undefined });
    expect(session.getItem(`${DIFF_KEY_PREFIX}${fingerprint}`)).toBe('diff text');
    expect(adapter.getDiff(fingerprint)).toEqual({ ok: true, value: 'diff text' });
    expect(adapter.removeDiff(fingerprint)).toEqual({ ok: true, value: undefined });
    expect(adapter.getDiff(fingerprint)).toEqual({ ok: true, value: null });
  });

  it('drops the saved diff instead of storing text over the limit', () => {
    const { adapter, session } = persistent();
    adapter.setDiff(fingerprint, 'older');
    session.calls.length = 0;
    expect(adapter.setDiff(fingerprint, 'x'.repeat(500_001))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(adapter.getDiff(fingerprint)).toEqual({ ok: true, value: null });
    expect(session.calls).toEqual([`remove:${DIFF_KEY_PREFIX}${fingerprint}`]);
    expect(adapter.setDiff(fingerprint, 'x'.repeat(500_000)).ok).toBe(true);
    expect(valueOf(adapter.getDiff(fingerprint))).toHaveLength(500_000);
  });

  it('keeps the review and diff areas apart', () => {
    const { adapter, local, session } = persistent();
    adapter.setReview(reviewRecord(fingerprint));
    adapter.setDiff(fingerprint, 'diff text');
    expect(local.getItem(`${DIFF_KEY_PREFIX}${fingerprint}`)).toBeNull();
    expect(session.getItem(reviewKey(fingerprint))).toBeNull();
  });
});

describe('adapter clearAll', () => {
  it('ST-CLEAR-FOREIGN removes every drd key and nothing else', () => {
    const { adapter, local, session } = persistent();
    adapter.setReview(reviewRecord(fingerprint));
    adapter.setPrefs(DEFAULT_PREFS);
    adapter.setTheme('dark');
    adapter.setDiff(fingerprint, 'diff text');
    local.seed('drdx', 'foreign');
    local.seed('other:drd:review:1', 'foreign');
    session.seed('foreign', 'keep');
    expect(adapter.clearAll()).toEqual({ ok: true, value: undefined });
    expect(local.getItem('drdx')).toBe('foreign');
    expect(local.getItem('other:drd:review:1')).toBe('foreign');
    expect(session.getItem('foreign')).toBe('keep');
    expect(local.length).toBe(2);
    expect(session.length).toBe(1);
    expect(valueOf(adapter.listReviews())).toEqual([]);
    expect(adapter.mode).toBe('persistent');
  });

  it('clears the memory copies after the area stops answering', () => {
    const { adapter, local } = persistent();
    adapter.setReview(reviewRecord(fingerprint));
    adapter.setDiff(fingerprint, 'diff text');
    local.failWhen('key', always(securityError));
    expect(adapter.clearAll()).toEqual({ ok: true, value: undefined });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([degraded]);
    expect(valueOf(adapter.listReviews())).toEqual([]);
    expect(valueOf(adapter.getDiff(fingerprint))).toBeNull();
  });

  it('treats any enumeration failure as a reason to fall back to memory', () => {
    const { adapter, local } = persistent();
    local.failWhen(
      'length',
      always(() => new Error('length')),
    );
    expect(adapter.clearAll()).toEqual({ ok: true, value: undefined });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([degraded]);
  });

  it('records a quota notice when the enumeration failure was a quota error', () => {
    const { adapter, local } = persistent();
    local.failWhen(
      'length',
      always(() => new DOMException('full', 'QuotaExceededError')),
    );
    adapter.clearAll();
    expect(adapter.notices).toEqual([{ ...degraded, code: 'quota' }]);
  });

  it('falls back to memory when a removal is blocked and keeps clearing', () => {
    const { adapter, local } = persistent();
    adapter.setReview(reviewRecord(fingerprint));
    adapter.setReview(reviewRecord(otherFingerprint));
    local.failWhen('remove', always(securityError));
    expect(adapter.clearAll()).toEqual({ ok: true, value: undefined });
    expect(adapter.mode).toBe('memory');
    expect(valueOf(adapter.listReviews())).toEqual([]);
  });
});
