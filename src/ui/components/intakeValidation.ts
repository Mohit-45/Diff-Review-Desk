import type { ParseError } from '../../core/types';
import { LIMITS } from '../../core/limits';

export function emptyError(detail = 'Paste a unified diff or try a sample.'): ParseError {
  return {
    code: 'empty',
    title: 'Nothing to review',
    detail,
    hint: null,
    suggestion: 'Paste a unified diff or try a sample.',
  };
}

export function clipboardEmptyError(): ParseError {
  return {
    code: 'empty',
    title: 'Clipboard has no text',
    detail: 'Paste plain text from a unified diff, or choose a file.',
    hint: null,
    suggestion: 'Paste a unified diff or try a sample.',
  };
}

function tooLargeError(size: number): ParseError {
  return {
    code: 'too-large',
    title: 'This diff is too large',
    detail: `The input is ${String(size)} bytes; the limit is ${String(LIMITS.maxInputBytes)} bytes.`,
    hint: 'generic',
    suggestion: 'Review a narrower change with `git diff -- src/`.',
  };
}

export function unreadableFileError(): ParseError {
  return {
    code: 'internal',
    title: "That file isn't text",
    detail: 'The dropped item could not be read as a text diff.',
    hint: 'generic',
    suggestion: 'Choose a text diff or paste the diff text.',
  };
}

/** Size checks that run before a file is read; null means the file may be loaded. */
export function fileError(file: File): ParseError | null {
  if (file.size === 0) {
    return emptyError(`The selected file ${file.name || 'this file'} is empty.`);
  }
  if (file.size > LIMITS.maxInputBytes) {
    return tooLargeError(file.size);
  }
  return null;
}

export function isBlank(value: string): boolean {
  return /^\s*$/u.test(value);
}

export function loadedStatus(file: File, ignoredFileCount: number): string {
  const name = file.name || 'the selected file';
  return ignoredFileCount > 0
    ? `Loaded ${name}. Ignored ${String(ignoredFileCount)} other files.`
    : `Loaded ${name}.`;
}

/** The error for a file whose bytes could not be read; only that one offers Retry. */
export function isReadFailure(error: ParseError): boolean {
  return error.code === 'internal' && error.title.startsWith('Could not read ');
}
