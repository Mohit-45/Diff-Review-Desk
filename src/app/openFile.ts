import { LIMITS } from '../core/limits';
import { fail } from '../core/result';
import type { Result } from '../core/types';
import { emptyFileError, tooLargeError, unreadableFileError } from './decodeErrors';
import type { OpenDiffError, OpenDiffValue } from './open';
import { openWithStored, type OpenWithStoredOptions } from './openStored';

export type FileSource = Pick<Blob, 'size' | 'arrayBuffer'> & { readonly name: string };

/**
 * Size is judged before any byte is read. The file name is the review label unless the caller
 * names one, and the bytes go through decode() so BOM, UTF-16 and NUL handling apply.
 */
export async function openFile(
  file: FileSource,
  options: OpenWithStoredOptions,
): Promise<Result<OpenDiffValue, OpenDiffError>> {
  if (file.size === 0) {
    return fail(emptyFileError());
  }
  if (file.size > LIMITS.maxInputBytes) {
    return fail(tooLargeError(file.size));
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return fail(unreadableFileError(file.name));
  }
  const label = options.label ?? (file.name === '' ? undefined : file.name);
  return openWithStored(bytes, label === undefined ? options : { ...options, label });
}
