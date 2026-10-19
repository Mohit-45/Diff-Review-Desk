import type { Result } from '../core/types';
import type { ReviewStorageAdapter, StorageRead } from '../storage/adapter';

export type ClearAllError = {
  readonly code: 'storage';
  readonly message: string;
};

export function clearAll(adapter: ReviewStorageAdapter): Result<void, ClearAllError> {
  const result: StorageRead<void> = adapter.clearAll();
  return result.ok
    ? result
    : { ok: false, error: { code: 'storage', message: result.error.detail } };
}

export const clearSavedData = clearAll;
export const clear = clearAll;
