import { readKeys } from './areas';
import { DIFF_KEY_PREFIX, OPEN_KEY } from './keys';
import { FINGERPRINT_PATTERN } from './recordGuards';
import type { StorageState } from './state';
import { success, type StorageRead } from './storageErrors';
import { removeValue, writeWithRecovery } from './writes';

/** The review this tab has open. A stale or malformed value reads as "none". */
export function readOpenFingerprint(state: StorageState): StorageRead<string | null> {
  return state.read<string | null>(() => {
    const raw = state.area('session').getItem(OPEN_KEY);
    return success(raw !== null && FINGERPRINT_PATTERN.test(raw) ? raw : null);
  }, 'The open review could not be read.');
}

export function saveOpenFingerprint(
  state: StorageState,
  fingerprint: string | null,
): StorageRead<void> {
  if (fingerprint === null) {
    return removeValue(state, 'session', OPEN_KEY);
  }
  return writeWithRecovery(state, {
    area: 'session',
    key: OPEN_KEY,
    value: fingerprint,
    openFingerprint: fingerprint,
  });
}

/** Every remembered diff text of this tab, whichever review it belongs to. */
export function removeAllDiffs(state: StorageState): StorageRead<void> {
  const keys = state.read(
    () => success(readKeys(state.area('session'), DIFF_KEY_PREFIX)),
    'Saved diffs could not be listed.',
  );
  if (!keys.ok) {
    return keys;
  }
  for (const key of keys.value) {
    removeValue(state, 'session', key);
  }
  return success(undefined);
}
