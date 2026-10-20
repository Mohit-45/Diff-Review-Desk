import { describe, expect, it } from 'vitest';
import type { StorageError } from '../core/types';
import {
  DIFF_KEY_PREFIX,
  PREFS_KEY,
  THEME_KEY,
  createStorageAdapter,
  type ReviewStorageAdapter,
  type StorageNotice,
} from './adapter';
import {
  ScriptedArea,
  always,
  failTimes,
  onlyForKeys,
  quotaError,
  reviewKey,
  reviewRecord,
  securityError,
  seedReview,
} from './areaFixtures';
import { DEFAULT_PREFS } from './validator';

const BANNER = "Progress isn't being saved in this browser. Export your review to keep it.";
const QUOTA_MESSAGE = 'Browser storage quota was reached; older reviews were removed.';
const open = '00000000009';
const key = reviewKey(open);
const diffKey = `${DIFF_KEY_PREFIX}${open}`;
const quotaNotice: StorageNotice = { code: 'quota', key, message: QUOTA_MESSAGE };
const bannerFor = (code: StorageNotice['code']): StorageNotice => ({
  code,
  key: null,
  message: BANNER,
});

function oldReviews(local: ScriptedArea, count: number): void {
  for (let index = 1; index <= count; index += 1) {
    const fingerprint = `0000000000${String(index)}`;
    seedReview(local, reviewRecord(fingerprint, `2026-10-1${String(index)}T00:00:00.000Z`));
  }
}

function adapterFor(
  local: ScriptedArea,
  session = new ScriptedArea(),
  maxReviewRecords = 20,
): ReviewStorageAdapter {
  return createStorageAdapter({ local, session, maxReviewRecords });
}

function saveOpen(adapter: ReviewStorageAdapter, openFingerprint?: string | null): void {
  const result = adapter.setReview(reviewRecord(open, '2026-10-19T00:00:00.000Z'), openFingerprint);
  expect(result).toEqual({ ok: true, value: undefined });
}

function unavailable(detail: string): StorageError {
  return {
    code: 'unavailable',
    title: 'Browser storage is unavailable',
    detail,
    suggestion: 'Keep this tab open or export your review to keep it.',
  };
}

describe('adapter first write failure', () => {
  it.each([
    ['a SecurityError', securityError],
    ['a foreign SecurityError', () => ({ name: 'SecurityError' })],
    ['a generic error', () => new Error('boom')],
    ['a thrown string', () => 'denied'],
    ['a thrown null', () => null],
  ])('ST-DENIED switches to memory on %s and keeps the data', (_label, thrown) => {
    const local = new ScriptedArea().failWhen('set', always(thrown));
    const adapter = adapterFor(local);
    saveOpen(adapter);
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([bannerFor('degraded')]);
    expect(local.calls).toEqual([`set:${key}`]);
    const stored = adapter.getReview(open);
    expect(stored.ok && stored.value?.fingerprint).toBe(open);
  });

  it.each([
    ['QuotaExceededError', () => ({ name: 'QuotaExceededError' })],
    ['NS_ERROR_DOM_QUOTA_REACHED', () => ({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })],
    ['legacy code 22', () => ({ code: 22 })],
    ['legacy code 1014', () => ({ code: 1014 })],
    ['a DOMException', quotaError],
  ])('ST-QUOTA recognises %s as a quota failure', (_label, thrown) => {
    const local = new ScriptedArea().failWhen('set', failTimes(1, thrown));
    const adapter = adapterFor(local);
    saveOpen(adapter);
    expect(adapter.mode).toBe('persistent');
    expect(adapter.notices).toEqual([quotaNotice]);
    expect(local.calls).toEqual([`set:${key}`, `set:${key}`]);
  });

  it('does not take a quota look-alike with a text code for a quota failure', () => {
    const local = new ScriptedArea().failWhen(
      'set',
      always(() => ({ code: '22' })),
    );
    const adapter = adapterFor(local);
    saveOpen(adapter);
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([bannerFor('degraded')]);
  });
});

describe('adapter quota recovery order', () => {
  it('ST-QUOTA retries once after evicting the oldest review that is not open', () => {
    const local = new ScriptedArea();
    oldReviews(local, 3);
    local.failWhen('set', failTimes(1, quotaError));
    const adapter = adapterFor(local, new ScriptedArea(), 3);
    saveOpen(adapter);
    expect(adapter.mode).toBe('persistent');
    expect(adapter.notices).toEqual([quotaNotice]);
    expect(local.calls).toEqual([`set:${key}`, `remove:${reviewKey('00000000001')}`, `set:${key}`]);
    expect(local.getItem(reviewKey('00000000001'))).toBeNull();
    expect(local.getItem(reviewKey('00000000002'))).not.toBeNull();
    expect(local.getItem(key)).not.toBeNull();
  });

  it('ST-QUOTA evicts at least one review even when under the cap', () => {
    const local = new ScriptedArea();
    oldReviews(local, 2);
    local.failWhen('set', failTimes(1, quotaError));
    saveOpen(adapterFor(local));
    expect(local.getItem(reviewKey('00000000001'))).toBeNull();
    expect(local.getItem(reviewKey('00000000002'))).not.toBeNull();
  });

  it('ST-QUOTA never evicts the open review or the review being written', () => {
    const local = new ScriptedArea();
    oldReviews(local, 2);
    local.failWhen('set', failTimes(1, quotaError));
    saveOpen(adapterFor(local), '00000000001');
    expect(local.getItem(reviewKey('00000000001'))).not.toBeNull();
    expect(local.getItem(reviewKey('00000000002'))).toBeNull();
  });

  it('ST-QUOTA drops the open diff before the last attempt and then succeeds', () => {
    const local = new ScriptedArea();
    oldReviews(local, 1);
    local.failWhen('set', failTimes(2, quotaError));
    const session = new ScriptedArea();
    session.seed(diffKey, 'open diff');
    const adapter = adapterFor(local, session);
    saveOpen(adapter);
    expect(adapter.mode).toBe('persistent');
    expect(adapter.notices).toEqual([quotaNotice]);
    expect(session.getItem(diffKey)).toBeNull();
    expect(session.calls).toEqual([`remove:${diffKey}`]);
    expect(local.calls).toEqual([
      `set:${key}`,
      `remove:${reviewKey('00000000001')}`,
      `set:${key}`,
      `set:${key}`,
    ]);
  });

  it('ST-QUOTA leaves the diff key alone when no review is open', () => {
    const local = new ScriptedArea().failWhen('set', failTimes(2, quotaError));
    const session = new ScriptedArea();
    session.seed(diffKey, 'open diff');
    const adapter = adapterFor(local, session);
    saveOpen(adapter, null);
    expect(adapter.mode).toBe('persistent');
    expect(session.getItem(diffKey)).toBe('open diff');
    expect(session.calls).toEqual([]);
  });

  it('ST-QUOTA enters memory mode with a quota notice after the third failure', () => {
    const local = new ScriptedArea().failWhen('set', always(quotaError));
    oldReviews(local, 1);
    const adapter = adapterFor(local);
    saveOpen(adapter);
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([quotaNotice, bannerFor('quota')]);
    expect(local.calls).toEqual([
      `set:${key}`,
      `remove:${reviewKey('00000000001')}`,
      `set:${key}`,
      `set:${key}`,
    ]);
    const stored = adapter.getReview(open);
    expect(stored.ok && stored.value?.fingerprint).toBe(open);
  });

  it('enters memory mode quietly when the last attempt hits a SecurityError', () => {
    const attempts = [quotaError, quotaError, securityError];
    let calls = 0;
    const local = new ScriptedArea().failWhen('set', () => {
      const next = attempts[calls];
      calls += 1;
      return next?.();
    });
    const adapter = adapterFor(local);
    saveOpen(adapter);
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([quotaNotice, bannerFor('degraded')]);
  });

  it('counts any other last-attempt failure as quota', () => {
    const attempts = [quotaError, quotaError, () => new Error('boom')];
    let calls = 0;
    const local = new ScriptedArea().failWhen('set', () => {
      const next = attempts[calls];
      calls += 1;
      return next?.();
    });
    const adapter = adapterFor(local);
    saveOpen(adapter);
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([quotaNotice, bannerFor('quota')]);
  });

  it('enters memory mode without a quota notice when the second attempt fails differently', () => {
    const attempts = [quotaError, () => new Error('boom')];
    let calls = 0;
    const local = new ScriptedArea().failWhen('set', () => {
      const next = attempts[calls];
      calls += 1;
      return next?.();
    });
    const adapter = adapterFor(local);
    saveOpen(adapter);
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([quotaNotice, bannerFor('degraded')]);
    expect(local.calls).toEqual([`set:${key}`, `set:${key}`]);
  });

  it('retries on the area it started with even if eviction switched to memory', () => {
    const local = new ScriptedArea().failWhen('set', always(quotaError));
    oldReviews(local, 1);
    const adapter = adapterFor(local);
    local.failWhen('key', failTimes(1, securityError));
    saveOpen(adapter);
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([
      quotaNotice,
      bannerFor('degraded'),
      {
        code: 'quota',
        key: null,
        message: 'Browser storage is unavailable; progress remains in memory.',
      },
    ]);
    expect(local.calls).toEqual([`set:${key}`, `set:${key}`, `set:${key}`]);
  });
});

describe('adapter session write failures', () => {
  const failure: StorageError = {
    code: 'quota',
    title: 'Browser storage is full',
    detail: 'The diff text could not be saved after the browser quota was reached.',
    suggestion: 'Export your review and clear saved data before trying again.',
  };

  it('ST-QUOTA reports a diff the session cannot hold and drops the open diff key', () => {
    const session = new ScriptedArea().failWhen('set', always(quotaError));
    const adapter = adapterFor(new ScriptedArea(), session);
    expect(adapter.setDiff(open, 'diff text')).toEqual({ ok: false, error: failure });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([
      { code: 'quota', key: diffKey, message: QUOTA_MESSAGE },
      bannerFor('quota'),
    ]);
    expect(session.calls).toEqual([`set:${diffKey}`, `remove:${diffKey}`]);
    expect(adapter.getDiff(open)).toEqual({ ok: true, value: null });
  });

  it('ST-QUOTA leaves other diff keys alone when a different review is open', () => {
    const session = new ScriptedArea().failWhen('set', always(quotaError));
    const adapter = adapterFor(new ScriptedArea(), session);
    expect(adapter.setDiff(open, 'diff text', '00000000001')).toEqual({
      ok: false,
      error: failure,
    });
    expect(session.calls).toEqual([`set:${diffKey}`, `remove:${DIFF_KEY_PREFIX}00000000001`]);
    expect(adapter.getDiff(open)).toEqual({ ok: true, value: 'diff text' });
  });

  it('ST-QUOTA does not remove anything when no review is open', () => {
    const session = new ScriptedArea().failWhen('set', always(quotaError));
    const adapter = adapterFor(new ScriptedArea(), session);
    expect(adapter.setDiff(open, 'diff text', null)).toEqual({ ok: false, error: failure });
    expect(session.calls).toEqual([`set:${diffKey}`]);
    expect(adapter.getDiff(open)).toEqual({ ok: true, value: 'diff text' });
  });

  it.each([
    ['a SecurityError', securityError],
    ['a generic error', () => new Error('boom')],
  ])('ST-DENIED keeps the diff in memory after %s', (_label, thrown) => {
    const session = new ScriptedArea().failWhen('set', always(thrown));
    const adapter = adapterFor(new ScriptedArea(), session);
    expect(adapter.setDiff(open, 'diff text')).toEqual({ ok: true, value: undefined });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([bannerFor('degraded')]);
    expect(adapter.getDiff(open)).toEqual({ ok: true, value: 'diff text' });
  });

  it('never lets a diff failure block the review record', () => {
    const session = new ScriptedArea().failWhen('set', always(quotaError));
    const local = new ScriptedArea();
    const adapter = adapterFor(local, session);
    expect(adapter.setDiff(open, 'diff text').ok).toBe(false);
    saveOpen(adapter);
    expect(adapter.mode).toBe('memory');
    const stored = adapter.getReview(open);
    expect(stored.ok && stored.value?.fingerprint).toBe(open);
  });

  it('writes preferences and theme without touching diff keys on quota', () => {
    const local = new ScriptedArea().failWhen(
      'set',
      onlyForKeys('drd:p', failTimes(2, quotaError)),
    );
    const session = new ScriptedArea();
    session.seed(diffKey, 'open diff');
    const adapter = adapterFor(local, session);
    expect(adapter.setPrefs(DEFAULT_PREFS).ok).toBe(true);
    expect(adapter.mode).toBe('persistent');
    expect(session.getItem(diffKey)).toBe('open diff');
    expect(local.getItem(PREFS_KEY)).not.toBeNull();
    const themeLocal = new ScriptedArea().failWhen(
      'set',
      onlyForKeys(THEME_KEY, always(quotaError)),
    );
    const themed = adapterFor(themeLocal);
    expect(themed.setTheme('dark').ok).toBe(true);
    expect(themed.mode).toBe('memory');
    expect(themed.notices).toEqual([
      { code: 'quota', key: THEME_KEY, message: QUOTA_MESSAGE },
      bannerFor('quota'),
    ]);
    expect(themed.getTheme()).toEqual({ ok: true, value: 'dark' });
  });
});

describe('adapter review pruning', () => {
  it('keeps at most the configured records and protects the open and written reviews', () => {
    const local = new ScriptedArea();
    oldReviews(local, 3);
    const adapter = adapterFor(local, new ScriptedArea(), 3);
    saveOpen(adapter, '00000000001');
    const kept = [1, 2, 3].map(
      (index) => local.getItem(reviewKey(`0000000000${String(index)}`)) !== null,
    );
    expect(kept).toEqual([true, false, true]);
    expect(local.getItem(key)).not.toBeNull();
  });

  it('removes several reviews when far over the cap', () => {
    const local = new ScriptedArea();
    oldReviews(local, 5);
    const adapter = adapterFor(local, new ScriptedArea(), 2);
    saveOpen(adapter, null);
    const removed = local.calls.filter((call) => call.startsWith('remove:'));
    expect(removed).toEqual(
      [1, 2, 3, 4].map((index) => `remove:${reviewKey(`0000000000${String(index)}`)}`),
    );
    expect(local.getItem(reviewKey('00000000005'))).not.toBeNull();
    expect(local.getItem(key)).not.toBeNull();
  });

  it('does not prune when the write fell back to memory', () => {
    const local = new ScriptedArea();
    oldReviews(local, 3);
    local.failWhen('set', always(securityError));
    const adapter = adapterFor(local, new ScriptedArea(), 2);
    saveOpen(adapter, null);
    expect(local.calls.filter((call) => call.startsWith('remove:'))).toEqual([]);
  });

  it('removeReview deletes one record and tolerates a blocked area', () => {
    const local = new ScriptedArea();
    oldReviews(local, 2);
    const adapter = adapterFor(local);
    expect(adapter.removeReview('00000000001')).toEqual({ ok: true, value: undefined });
    expect(local.getItem(reviewKey('00000000001'))).toBeNull();
    local.failWhen('remove', always(securityError));
    expect(adapter.removeReview('00000000002')).toEqual({ ok: true, value: undefined });
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([bannerFor('degraded')]);
    expect(adapter.getReview('00000000002')).toEqual({ ok: true, value: null });
  });

  it('removeValue treats a quota failure on removal as a quota fallback', () => {
    const local = new ScriptedArea();
    oldReviews(local, 1);
    const adapter = adapterFor(local);
    local.failWhen('remove', always(quotaError));
    expect(adapter.removeReview('00000000001')).toEqual({ ok: true, value: undefined });
    expect(adapter.notices).toEqual([bannerFor('quota')]);
  });

  it('removeDiff tolerates a blocked session', () => {
    const session = new ScriptedArea();
    session.seed(diffKey, 'diff text');
    const adapter = adapterFor(new ScriptedArea(), session);
    session.failWhen('remove', always(securityError));
    expect(adapter.removeDiff(open)).toEqual({ ok: true, value: undefined });
    expect(adapter.mode).toBe('memory');
    expect(adapter.getDiff(open)).toEqual({ ok: true, value: null });
  });
});

describe('adapter read failures', () => {
  it('switches to memory on a SecurityError and answers from the copied data', () => {
    const local = new ScriptedArea();
    seedReview(local, reviewRecord('00000000001'));
    local.seed(
      PREFS_KEY,
      '{"theme":"dark","shortcutsEnabled":true,"autoAdvance":true,"rememberDiff":false}',
    );
    local.seed(THEME_KEY, 'light');
    const session = new ScriptedArea();
    session.seed(diffKey, 'diff text');
    const adapter = adapterFor(local, session);
    local.failWhen('get', always(securityError));
    session.failWhen('get', always(securityError));
    expect(adapter.getReview('00000000001').ok).toBe(true);
    expect(adapter.mode).toBe('memory');
    expect(adapter.notices).toEqual([bannerFor('degraded')]);
    expect(adapter.getDiff(open)).toEqual({ ok: true, value: 'diff text' });
    expect(adapter.getTheme()).toEqual({ ok: true, value: 'light' });
    const prefs = adapter.getPrefs();
    expect(prefs.ok && prefs.value.theme).toBe('dark');
    const listed = adapter.listReviews();
    expect(listed.ok && listed.value.map((record) => record.fingerprint)).toEqual(['00000000001']);
  });

  it.each([
    ['getDiff', (adapter: ReviewStorageAdapter) => adapter.getDiff(open)],
    ['getTheme', (adapter: ReviewStorageAdapter) => adapter.getTheme()],
    ['getPrefs', (adapter: ReviewStorageAdapter) => adapter.getPrefs()],
    ['listReviews', (adapter: ReviewStorageAdapter) => adapter.listReviews()],
    ['getReview', (adapter: ReviewStorageAdapter) => adapter.getReview(open)],
  ])('%s switches to memory when the first read is blocked', (_name, read) => {
    const local = new ScriptedArea();
    const session = new ScriptedArea();
    const adapter = adapterFor(local, session);
    local.failWhen('get', failTimes(1, securityError));
    session.failWhen('get', failTimes(1, securityError));
    local.failWhen('length', failTimes(1, securityError));
    expect(read(adapter).ok).toBe(true);
    expect(adapter.mode).toBe('memory');
  });

  it.each([
    [
      'getDiff',
      (adapter: ReviewStorageAdapter) => adapter.getDiff(open),
      'The saved diff could not be read.',
    ],
    [
      'getTheme',
      (adapter: ReviewStorageAdapter) => adapter.getTheme(),
      'Saved theme could not be read.',
    ],
    [
      'getPrefs',
      (adapter: ReviewStorageAdapter) => adapter.getPrefs(),
      'Saved preferences could not be read.',
    ],
    [
      'getReview',
      (adapter: ReviewStorageAdapter) => adapter.getReview(open),
      'A saved review could not be read.',
    ],
    [
      'listReviews',
      (adapter: ReviewStorageAdapter) => adapter.listReviews(),
      'Saved reviews could not be listed.',
    ],
  ])(
    '%s reports other failures as unavailable without leaving persistent mode',
    (_name, read, detail) => {
      const local = new ScriptedArea();
      const session = new ScriptedArea();
      const adapter = adapterFor(local, session);
      seedReview(local, reviewRecord(open));
      local.failWhen(
        'get',
        always(() => new Error('boom')),
      );
      session.failWhen(
        'get',
        always(() => new Error('boom')),
      );
      local.failWhen(
        'key',
        always(() => new Error('boom')),
      );
      expect(read(adapter)).toEqual({ ok: false, error: unavailable(detail) });
      expect(adapter.mode).toBe('persistent');
      expect(adapter.notices).toEqual([]);
    },
  );

  it('listReviews stops at the first review that cannot be read', () => {
    const local = new ScriptedArea();
    seedReview(local, reviewRecord('00000000001'));
    seedReview(local, reviewRecord('00000000002'));
    const adapter = adapterFor(local);
    local.failWhen(
      'get',
      onlyForKeys(
        reviewKey('00000000002'),
        always(() => new Error('boom')),
      ),
    );
    expect(adapter.listReviews()).toEqual({
      ok: false,
      error: unavailable('A saved review could not be read.'),
    });
  });

  it('does not loop when a foreign value keeps throwing', () => {
    const local = new ScriptedArea();
    const adapter = adapterFor(local);
    local.failWhen(
      'get',
      always(() => ({ name: 'SecurityError' })),
    );
    expect(adapter.getTheme().ok).toBe(true);
    expect(adapter.mode).toBe('memory');
  });
});
