import { describe, expect, it } from 'vitest';
import type { StoredReview } from '../core/types';
import {
  DIFF_KEY_PREFIX,
  MemoryStorageArea,
  REVIEW_KEY_PREFIX,
  createStorageAdapter,
  type StorageAreaLike,
} from './adapter';
import { throwForeign } from './areaFixtures';

const id = 'f00000000001:00000000001';

function review(fingerprint: string, updatedAt: string): StoredReview {
  return {
    schemaVersion: 1,
    hashVersion: 1,
    updatedAt,
    fingerprint,
    round: 1,
    label: 'Review',
    overallNote: '',
    decisions: { [id]: { decision: 'approved', comment: '' } },
    hunkIds: [id],
    prior: null,
  };
}

class ThrowingArea extends MemoryStorageArea {
  constructor(private readonly failure: 'security' | 'quota') {
    super();
  }

  override getItem(key: string): string | null {
    if (this.failure === 'security') {
      throwForeign({ name: 'SecurityError' });
    }
    return super.getItem(key);
  }

  override setItem(key: string, value: string): void {
    if (this.failure === 'security') {
      throwForeign({ name: 'SecurityError' });
    }
    if (key.startsWith(DIFF_KEY_PREFIX)) {
      throwForeign({ name: 'QuotaExceededError' });
    }
    super.setItem(key, value);
  }
}

class QuotaEveryWriteArea extends MemoryStorageArea {
  readonly calls: string[] = [];

  override setItem(key: string): void {
    this.calls.push(`set:${key}`);
    throwForeign({ name: 'QuotaExceededError' });
  }

  override removeItem(key: string): void {
    this.calls.push(`remove:${key}`);
    super.removeItem(key);
  }
}

describe('storage adapter', () => {
  it('ST-DENIED falls back to memory and keeps decisions writable', () => {
    const denied = new ThrowingArea('security');
    const adapter = createStorageAdapter({ local: denied, session: denied });
    expect(adapter.mode).toBe('memory');
    expect(adapter.degraded).toBe(true);
    expect(adapter.setReview(review('00000000001', '2026-10-19T00:00:00.000Z')).ok).toBe(true);
    expect(adapter.getReview('00000000001').ok).toBe(true);
  });

  it('ST-QUOTA never lets a diff-key failure block the review record', () => {
    const local = new MemoryStorageArea();
    const session = new ThrowingArea('quota');
    const adapter = createStorageAdapter({ local, session });
    expect(adapter.setReview(review('00000000001', '2026-10-19T00:00:00.000Z')).ok).toBe(true);
    expect(adapter.setDiff('00000000001', 'diff').ok).toBe(false);
    const stored = adapter.getReview('00000000001');
    expect(stored.ok).toBe(true);
    expect(stored.ok && stored.value?.fingerprint).toBe('00000000001');
    expect(adapter.notices.some((notice) => notice.code === 'quota')).toBe(true);
  });

  it('ST-QUOTA-ORDER evicts an old review, drops the open diff, then enters memory mode', () => {
    const local = new QuotaEveryWriteArea();
    const session = new MemoryStorageArea();
    superSet(
      local,
      `${REVIEW_KEY_PREFIX}00000000002`,
      JSON.stringify(review('00000000002', '2026-10-18T00:00:00.000Z')),
    );
    session.setItem(`${DIFF_KEY_PREFIX}00000000001`, 'open diff');
    const adapter = createStorageAdapter({ local, session });
    const result = adapter.setReview(
      review('00000000001', '2026-10-19T00:00:00.000Z'),
      '00000000001',
    );
    expect(result.ok).toBe(true);
    expect(adapter.mode).toBe('memory');
    expect(local.calls).toEqual([
      `set:${REVIEW_KEY_PREFIX}00000000001`,
      `remove:${REVIEW_KEY_PREFIX}00000000002`,
      `set:${REVIEW_KEY_PREFIX}00000000001`,
      `set:${REVIEW_KEY_PREFIX}00000000001`,
    ]);
    expect(session.getItem(`${DIFF_KEY_PREFIX}00000000001`)).toBeNull();
  });

  it('keeps at most the configured records and evicts the oldest non-open review', () => {
    const local: StorageAreaLike = new MemoryStorageArea();
    const session = new MemoryStorageArea();
    const adapter = createStorageAdapter({ local, session, maxReviewRecords: 2 });
    adapter.setReview(review('00000000001', '2026-10-19T00:00:00.000Z'));
    adapter.setReview(review('00000000002', '2026-10-19T01:00:00.000Z'));
    adapter.setReview(review('00000000003', '2026-10-19T02:00:00.000Z'), '00000000003');
    const oldest = adapter.getReview('00000000001');
    expect(oldest.ok && oldest.value).toBeNull();
    expect(adapter.getReview('00000000003').ok).toBe(true);
    expect(local.getItem(`${REVIEW_KEY_PREFIX}00000000002`)).not.toBeNull();
  });

  it('ST-CLEAR-FOREIGN removes only drd keys from both areas', () => {
    const local = new MemoryStorageArea();
    const session = new MemoryStorageArea();
    local.setItem('foreign', 'keep');
    session.setItem('foreign', 'keep');
    local.setItem('drd:theme', 'dark');
    session.setItem(`${DIFF_KEY_PREFIX}00000000001`, 'diff');
    const adapter = createStorageAdapter({ local, session });
    expect(adapter.clearAll().ok).toBe(true);
    expect(local.getItem('foreign')).toBe('keep');
    expect(session.getItem('foreign')).toBe('keep');
    expect(local.getItem('drd:theme')).toBeNull();
    expect(session.getItem(`${DIFF_KEY_PREFIX}00000000001`)).toBeNull();
  });
});

function superSet(area: MemoryStorageArea, key: string, value: string): void {
  MemoryStorageArea.prototype.setItem.call(area, key, value);
}
