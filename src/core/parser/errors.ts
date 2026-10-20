import type { ParseError, ParseResult } from '../types';

export type LimitUnit = 'bytes' | 'files' | 'lines';

const TOO_LARGE_CODES: Record<LimitUnit, ParseError['code']> = {
  bytes: 'too-large',
  files: 'too-many-files',
  lines: 'too-many-lines',
};

const NOT_A_DIFF_TITLE = 'This does not look like a diff';

export function errorResult(error: ParseError): ParseResult {
  return { ok: false, error, warnings: [] };
}

export function notADiff(
  detail: string,
  hint: ParseError['hint'],
  suggestion: string,
): ParseResult {
  return errorResult({ code: 'not-a-diff', title: NOT_A_DIFF_TITLE, detail, hint, suggestion });
}

export function tooLargeResult(observed: number, limit: number, unit: LimitUnit): ParseResult {
  return errorResult({
    code: TOO_LARGE_CODES[unit],
    title: 'Diff is too large',
    detail: `Observed ${String(observed)} ${unit}; the limit is ${String(limit)}.`,
    hint: 'generic',
    suggestion: 'Run `git diff -- src/` or load a smaller diff.',
  });
}

export function emptyResult(): ParseResult {
  return errorResult({
    code: 'empty',
    title: 'Nothing to review',
    detail: 'The input is empty or contains only whitespace.',
    hint: null,
    suggestion: 'Paste or drop a unified diff.',
  });
}

export function binaryInputResult(): ParseResult {
  return errorResult({
    code: 'binary-input',
    title: 'This looks like a binary file, not text.',
    detail: 'A NUL byte appeared near the start of the input.',
    hint: null,
    suggestion: 'Provide a text unified diff.',
  });
}

export function utf16Result(): ParseResult {
  return notADiff(
    'PowerShell `>` writes UTF-16. Re-run with `| Out-File -Encoding utf8`, or paste the text.',
    'utf16',
    'Re-run with `| Out-File -Encoding utf8`, or paste the text.',
  );
}

export function internalResult(): ParseResult {
  return errorResult({
    code: 'internal',
    title: 'Unexpected parser error',
    detail:
      'Unexpected parser error. Nothing left your browser; copy the diff and report the problem.',
    hint: null,
    suggestion: 'Copy the diff and report the problem.',
  });
}
