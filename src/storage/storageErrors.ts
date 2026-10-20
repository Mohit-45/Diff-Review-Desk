import { fail, ok } from '../core/result';
import type { Result, StorageError } from '../core/types';
import type { StorageNotice } from './notices';

export type StorageRead<T> = Result<T, StorageError> & {
  readonly notices?: readonly StorageNotice[];
};

export function success<T>(value: T): StorageRead<T> {
  return ok(value);
}

export function errorResult<T>(error: StorageError): StorageRead<T> {
  return fail(error);
}

export function plainError(code: StorageError['code'], detail: string): StorageError {
  if (code === 'quota') {
    return {
      code,
      title: 'Browser storage is full',
      detail,
      suggestion: 'Export your review and clear saved data before trying again.',
    };
  }
  return {
    code,
    title: 'Browser storage is unavailable',
    detail,
    suggestion: 'Keep this tab open or export your review to keep it.',
  };
}

export function isQuotaError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const name = 'name' in value && typeof value.name === 'string' ? value.name : '';
  const code = 'code' in value && typeof value.code === 'number' ? value.code : 0;
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/** A SecurityError that is not a quota failure: the browser refuses access to the area. */
export function isStorageError(value: unknown): boolean {
  if (isQuotaError(value)) {
    return false;
  }
  return (
    typeof value === 'object' && value !== null && 'name' in value && value.name === 'SecurityError'
  );
}
