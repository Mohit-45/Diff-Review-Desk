import type { ParseResult } from '../types';
import { errorResult, notADiff } from './errors';
import { cleanHeaderLine, isBodyLike } from './line-tests';

const WORD_DIFF_SCAN_LINES = 300;

function firstNonWhitespace(text: string): string {
  for (let index = 0; index < text.length; index += 1) {
    const value = text[index] ?? '';
    if (
      value !== ' ' &&
      value !== '\t' &&
      value !== '\r' &&
      value !== '\n' &&
      value !== '\u{00A0}' &&
      value !== '\u{FEFF}'
    ) {
      return value;
    }
  }
  return '';
}

function commitHeadersOnly(): ParseResult {
  return notADiff(
    'Commit headers were found but no file changes. Merge commits show no diff by default; use `git show -m <sha>` or `git diff <base>...<head>`.',
    'generic',
    'Run `git show -m <sha>` or `git diff <base>...<head>`.',
  );
}

function webPageResult(text: string): ParseResult | null {
  const first = firstNonWhitespace(text);
  if (first !== '<' && first !== '{' && first !== '[') {
    return null;
  }
  return notADiff(
    'This looks like a web page or API response, not a unified diff.',
    'web-page',
    'Open the pull request, append `.diff` to its URL, or run `gh pr diff <number>`.',
  );
}

function otherPatchFormatResult(lines: readonly string[]): ParseResult | null {
  if (
    lines.some((line) => line.startsWith('*** Begin Patch') || line.startsWith('*** End Patch'))
  ) {
    return notADiff(
      'This looks like another patch format, not a unified diff.',
      'other-format',
      'Run `git diff HEAD` or `diff -u`.',
    );
  }
  if (lines.some((line) => /^\*\*\* [0-9]/.test(line))) {
    return notADiff(
      'This looks like a context diff, not a unified diff.',
      'other-format',
      'Run `git diff HEAD` or `diff -u`.',
    );
  }
  return null;
}

function summaryResult(lines: readonly string[]): ParseResult | null {
  const summary = lines.find((line) =>
    /^--(?:stat|numstat|name-only|name-status|raw)(?:\s|$)/.test(cleanHeaderLine(line)),
  );
  if (summary === undefined) {
    return null;
  }
  return errorResult({
    code: 'not-a-diff',
    title: 'This is a summary and has no changed lines.',
    detail: 'Summary output has no changed lines to review.',
    hint: 'summary',
    suggestion: 'Re-run without the summary option.',
  });
}

function looksLikeWordDiff(lines: readonly string[]): boolean {
  let special = false;
  let nonEmpty = 0;
  let withoutMarker = 0;
  for (const line of lines.slice(0, WORD_DIFF_SCAN_LINES)) {
    const clean = cleanHeaderLine(line);
    if (clean === '~' || clean.includes('[-') || clean.includes('{+')) {
      special = true;
    }
    if (clean.length > 0) {
      nonEmpty += 1;
      if (!isBodyLike(clean)) {
        withoutMarker += 1;
      }
    }
  }
  return special && nonEmpty > 0 && withoutMarker * 2 >= nonEmpty;
}

function wordDiffResult(lines: readonly string[]): ParseResult | null {
  if (!looksLikeWordDiff(lines)) {
    return null;
  }
  return errorResult({
    code: 'word-diff',
    title: 'This is a word diff',
    detail: 'Re-run without `--word-diff` or `--color-words`.',
    hint: 'other-format',
    suggestion: 'Re-run without `--word-diff` or `--color-words`.',
  });
}

/** Pick the blocking error for input in which the scan found no file; the first match wins. */
export function classifyNoDiff(
  text: string,
  lines: readonly string[],
  sawCommitHeader: boolean,
): ParseResult {
  if (sawCommitHeader) {
    return commitHeadersOnly();
  }
  return (
    webPageResult(text) ??
    otherPatchFormatResult(lines) ??
    summaryResult(lines) ??
    wordDiffResult(lines) ??
    notADiff('No file or hunk headers were found.', 'generic', 'Run `git diff HEAD`.')
  );
}
