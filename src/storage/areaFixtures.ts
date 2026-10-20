import type { StoredReview } from '../core/types';
import { MemoryStorageArea } from './adapter';
import { reviewKeyFor } from './keys';

export type AreaOperation = 'get' | 'set' | 'remove' | 'key' | 'length';

/** Returns a value to throw, or undefined to let the call through. */
export type AreaFault = (key: string) => unknown;

const hunkId = 'f00000000001:00000000001';

export function throwForeign(thrown: unknown): never {
  // Browsers throw DOMException, but the adapter must also classify look-alikes from other realms.
  throw thrown;
}

export function securityError(): DOMException {
  return new DOMException('blocked', 'SecurityError');
}

export function quotaError(): DOMException {
  return new DOMException('full', 'QuotaExceededError');
}

export function failTimes(times: number, thrown: () => unknown): AreaFault {
  let remaining = times;
  return () => {
    if (remaining <= 0) {
      return undefined;
    }
    remaining -= 1;
    return thrown();
  };
}

export function always(thrown: () => unknown): AreaFault {
  return () => thrown();
}

export function onlyForKeys(prefix: string, fault: AreaFault): AreaFault {
  return (key) => (key.startsWith(prefix) ? fault(key) : undefined);
}

/** An in-memory area whose operations can be made to throw, recording writes and removals. */
export class ScriptedArea extends MemoryStorageArea {
  readonly calls: string[] = [];
  private readonly faults = new Map<AreaOperation, AreaFault>();

  failWhen(operation: AreaOperation, fault: AreaFault): this {
    this.faults.set(operation, fault);
    return this;
  }

  seed(key: string, value: string): void {
    super.setItem(key, value);
  }

  override get length(): number {
    this.check('length', '');
    return super.length;
  }

  override getItem(key: string): string | null {
    this.check('get', key);
    return super.getItem(key);
  }

  override setItem(key: string, value: string): void {
    this.calls.push(`set:${key}`);
    this.check('set', key);
    super.setItem(key, value);
  }

  override removeItem(key: string): void {
    this.calls.push(`remove:${key}`);
    this.check('remove', key);
    super.removeItem(key);
  }

  override key(index: number): string | null {
    this.check('key', String(index));
    return super.key(index);
  }

  private check(operation: AreaOperation, key: string): void {
    const thrown = this.faults.get(operation)?.(key);
    if (thrown !== undefined) {
      throwForeign(thrown);
    }
  }
}

export const reviewKey = reviewKeyFor;

export function reviewRecord(
  fingerprint: string,
  updatedAt = '2026-10-19T00:00:00.000Z',
  overrides: Partial<StoredReview> = {},
): StoredReview {
  return {
    schemaVersion: 1,
    hashVersion: 1,
    updatedAt,
    fingerprint,
    round: 1,
    label: 'Review',
    overallNote: '',
    decisions: { [hunkId]: { decision: 'approved', comment: '' } },
    hunkIds: [hunkId],
    prior: null,
    ...overrides,
  };
}

export function seedReview(area: ScriptedArea, record: StoredReview): void {
  area.seed(reviewKey(record.fingerprint), JSON.stringify(record));
}
