import { LIMITS } from '../core/limits';
import type { ParseError } from '../core/types';

const NARROWER_CHANGE = 'Review a narrower change with `git diff -- src/`.';

export function tooLargeError(byteCount: number): ParseError {
  return {
    code: 'too-large',
    title: 'This diff is too large',
    detail: `The input is ${String(byteCount)} bytes; the limit is ${String(LIMITS.maxInputBytes)} bytes.`,
    hint: 'generic',
    suggestion: NARROWER_CHANGE,
  };
}

export function binaryInputError(): ParseError {
  return {
    code: 'binary-input',
    title: 'This looks like a binary file, not text',
    detail: 'A NUL byte appeared near the start of the input.',
    hint: 'generic',
    suggestion: 'Choose a text diff or run `git diff --no-ext-diff --no-color`.',
  };
}

export function utf16Error(): ParseError {
  return {
    code: 'not-a-diff',
    title: 'This looks like UTF-16 text',
    detail:
      'PowerShell `>` writes UTF-16. Re-run with `| Out-File -Encoding utf8`, or paste the text.',
    hint: 'utf16',
    suggestion: 'Re-run the command with UTF-8 output, or paste the text directly.',
  };
}

export function emptyDiffError(): ParseError {
  return {
    code: 'empty',
    title: 'Nothing to review',
    detail: 'The diff is empty or contains only whitespace.',
    hint: null,
    suggestion: 'Paste a unified diff or try a sample.',
  };
}

export function emptyFileError(): ParseError {
  return {
    code: 'empty',
    title: 'Nothing to review',
    detail: 'The selected file is empty.',
    hint: null,
    suggestion: 'Choose a diff file or paste the diff text.',
  };
}

export function unreadableFileError(name: string | undefined): ParseError {
  return {
    code: 'internal',
    title: `Could not read ${name ?? 'this file'}`,
    detail: `The file ${name ?? 'could not be read'} could not be read from this browser.`,
    hint: 'generic',
    suggestion: 'Choose the file again or paste the diff text. Retry.',
  };
}
