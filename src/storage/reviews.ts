import type { StoredReview } from '../core/types';
import { readKeys } from './areas';
import { REVIEW_KEY_PREFIX, reviewKeyFor } from './keys';
import { noticeForValidation } from './notices';
import type { StorageState } from './state';
import { success, type StorageRead } from './storageErrors';
import { parseReviewRecord } from './validator';

export function oldestFirst(records: readonly StoredReview[]): StoredReview[] {
  return [...records].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

export function readReview(
  state: StorageState,
  fingerprint: string,
): StorageRead<StoredReview | null> {
  const key = reviewKeyFor(fingerprint);
  return state.read<StoredReview | null>(() => {
    const raw = state.area('local').getItem(key);
    if (raw === null) {
      return success(null);
    }
    const parsed = parseReviewRecord(raw);
    if (!parsed.ok) {
      state.addNotice(noticeForValidation(key, parsed.error.code));
      return success(null);
    }
    if (parsed.value.fingerprint !== fingerprint) {
      state.addNotice(noticeForValidation(key, 'corrupt'));
      return success(null);
    }
    return success(parsed.value);
  }, 'A saved review could not be read.');
}

export function listReviews(state: StorageState): StorageRead<readonly StoredReview[]> {
  const keys = state.read(
    () => success(readKeys(state.area('local'), REVIEW_KEY_PREFIX)),
    'Saved reviews could not be listed.',
  );
  if (!keys.ok) {
    return keys;
  }
  const records: StoredReview[] = [];
  for (const key of keys.value) {
    const review = readReview(state, key.slice(REVIEW_KEY_PREFIX.length));
    if (!review.ok) {
      return review;
    }
    if (review.value !== null) {
      records.push(review.value);
    }
  }
  return success(records);
}
