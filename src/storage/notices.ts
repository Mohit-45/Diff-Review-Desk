import type { ValidationError } from '../core/types';

export type StorageNotice = {
  readonly code: 'degraded' | 'corrupt' | 'future-schema' | 'hash-version' | 'quota';
  readonly message: string;
  readonly key: string | null;
};

export const DEGRADED_MESSAGE =
  "Progress isn't being saved in this browser. Export your review to keep it.";

/** The follow-up when a quota failure arrives after storage already fell back to memory. */
export const MEMORY_MESSAGE = 'Browser storage is unavailable; progress remains in memory.';

/** Maps a validator failure to the one notice shown for it: only versions are told apart. */
export function noticeForValidation(key: string, code: ValidationError['code']): StorageNotice {
  if (code === 'future-schema') {
    return {
      code,
      key,
      message: 'Saved review data is from a newer version and was not restored.',
    };
  }
  if (code === 'hash-version') {
    return {
      code,
      key,
      message: 'Saved review data uses an unsupported hash and was not restored.',
    };
  }
  return { code: 'corrupt', key, message: 'Saved review data was corrupt and was not restored.' };
}
