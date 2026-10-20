import type { StorageAreaLike } from './areas';
import { diffKeyFor, reviewKeyFor } from './keys';
import { listReviews, oldestFirst } from './reviews';
import type { AreaName, StorageState } from './state';
import {
  errorResult,
  isQuotaError,
  isStorageError,
  plainError,
  success,
  type StorageRead,
} from './storageErrors';

export type WriteRequest = {
  readonly area: AreaName;
  readonly key: string;
  readonly value: string;
  readonly openFingerprint: string | null;
};

type SetAttempt = { readonly stored: true } | { readonly stored: false; readonly caught: unknown };

function attemptSet(area: StorageAreaLike, key: string, value: string): SetAttempt {
  try {
    area.setItem(key, value);
    return { stored: true };
  } catch (caught: unknown) {
    return { stored: false, caught };
  }
}

export function removeValue(
  state: StorageState,
  areaName: AreaName,
  key: string,
): StorageRead<void> {
  const area = state.area(areaName);
  state.memoryArea(areaName).removeItem(key);
  if (state.mode === 'memory') {
    return success(undefined);
  }
  try {
    area.removeItem(key);
  } catch (caught: unknown) {
    state.setMemoryMode(isQuotaError(caught) ? 'quota' : 'degraded');
  }
  return success(undefined);
}

export function removePersistentDiff(state: StorageState, fingerprint: string): void {
  const key = diffKeyFor(fingerprint);
  state.memoryArea('session').removeItem(key);
  if (state.mode === 'memory') {
    return;
  }
  try {
    state.area('session').removeItem(key);
  } catch (caught: unknown) {
    if (isStorageError(caught)) {
      state.setMemoryMode();
    }
  }
}

function evictOldReviews(
  state: StorageState,
  openFingerprint: string | null,
  currentKey: string,
): void {
  const records = listReviews(state);
  if (!records.ok) {
    return;
  }
  const candidates = oldestFirst(
    records.value.filter(
      (record) =>
        record.fingerprint !== openFingerprint && reviewKeyFor(record.fingerprint) !== currentKey,
    ),
  );
  const excess = Math.max(1, records.value.length - state.maxRecords + 1);
  for (const record of candidates.slice(0, excess)) {
    removeValue(state, 'local', reviewKeyFor(record.fingerprint));
  }
}

/** Quota order from the spec: evict old reviews and retry, drop the open diff and retry, then memory. */
function recoverLocalQuota(
  state: StorageState,
  area: StorageAreaLike,
  request: WriteRequest,
): StorageRead<void> {
  const { key, value, openFingerprint } = request;
  evictOldReviews(state, openFingerprint, key);
  const second = attemptSet(area, key, value);
  if (second.stored) {
    return success(undefined);
  }
  if (!isQuotaError(second.caught)) {
    state.setMemoryMode();
    return success(undefined);
  }
  if (openFingerprint !== null) {
    removePersistentDiff(state, openFingerprint);
  }
  const third = attemptSet(area, key, value);
  if (!third.stored) {
    state.setMemoryMode(isStorageError(third.caught) ? 'degraded' : 'quota');
  }
  return success(undefined);
}

function failSessionQuota(state: StorageState, openFingerprint: string | null): StorageRead<void> {
  if (openFingerprint !== null) {
    removePersistentDiff(state, openFingerprint);
  }
  state.setMemoryMode('quota');
  return errorResult(
    plainError('quota', 'The diff text could not be saved after the browser quota was reached.'),
  );
}

/**
 * Writes to the live area while always keeping the memory copy current, so an in-memory state is
 * never rolled back whatever the browser does.
 */
export function writeWithRecovery(state: StorageState, request: WriteRequest): StorageRead<void> {
  const { key, value } = request;
  const area = state.area(request.area);
  state.memoryArea(request.area).setItem(key, value);
  if (state.mode === 'memory') {
    return success(undefined);
  }
  const first = attemptSet(area, key, value);
  if (first.stored) {
    return success(undefined);
  }
  if (!isQuotaError(first.caught)) {
    state.setMemoryMode();
    return success(undefined);
  }
  state.addNotice({
    code: 'quota',
    key,
    message: 'Browser storage quota was reached; older reviews were removed.',
  });
  return request.area === 'local'
    ? recoverLocalQuota(state, area, request)
    : failSessionQuota(state, request.openFingerprint);
}
