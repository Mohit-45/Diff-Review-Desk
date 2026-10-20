import type { ReviewStorageAdapter } from '../storage/adapter';
import { DEGRADED_MESSAGE, MEMORY_MESSAGE } from '../storage/notices';

/** What the screens show about storage. The adapter is not observable, so this is read on demand. */
export type StorageSnapshot = {
  /** True once progress lives in memory only; the screens then show the one persistent banner. */
  readonly degraded: boolean;
  /** Every other notice, each wording once. The banner wording is never in this list. */
  readonly notices: readonly string[];
};

export function readSnapshot(adapter: ReviewStorageAdapter): StorageSnapshot {
  const { degraded } = adapter;
  const messages = adapter.notices
    .map((notice) => notice.message)
    .filter((message) => message !== DEGRADED_MESSAGE && !(degraded && message === MEMORY_MESSAGE));
  return { degraded, notices: [...new Set(messages)] };
}

export function sameSnapshot(left: StorageSnapshot, right: StorageSnapshot): boolean {
  return (
    left.degraded === right.degraded &&
    left.notices.length === right.notices.length &&
    left.notices.every((message, index) => message === right.notices[index])
  );
}
