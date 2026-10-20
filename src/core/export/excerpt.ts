import { LIMITS } from '../limits';
import type { DiffFile, Hunk } from '../types';
import { longestBacktickRun } from './escape';
import { redactHunkLines } from './redact';

export type ExcerptOptions = {
  readonly maxLines?: number;
  readonly maxChars?: number;
};

export type ExcerptResult = {
  readonly text: string;
  readonly fence: string;
  readonly omitted: number;
  readonly redactions: number;
};

export function fenceForExcerpt(value: string): string {
  const length = Math.min(200, Math.max(3, longestBacktickRun(value) + 1));
  return '`'.repeat(length);
}

function selectedIndexes(hunk: Hunk): number[] {
  const changed = hunk.lines.flatMap((line, index) =>
    line.kind === 'add' || line.kind === 'remove' ? [index] : [],
  );
  if (changed.length === 0) {
    return hunk.lines.map((_line, index) => index);
  }
  const first = changed[0] ?? 0;
  const last = changed[changed.length - 1] ?? first;
  return Array.from({ length: last - first + 1 }, (_unused, offset) => first + offset);
}

export function excerptDetails(
  hunk: Hunk,
  file: DiffFile | null = null,
  options: ExcerptOptions = {},
): ExcerptResult {
  const maxChars = options.maxChars ?? LIMITS.maxExcerptChars;
  const prepared = redactHunkLines(file, hunk, Math.max(0, maxChars - 1));
  const indexes = selectedIndexes(hunk);
  const maxLines = options.maxLines ?? LIMITS.maxExcerptLines;
  const selected = indexes.slice(0, Math.max(0, maxLines));
  const body = selected.map((index) => {
    const line = hunk.lines[index];
    const text = prepared.lines[index] ?? '';
    if (line === undefined) {
      return '';
    }
    const marker = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' ';
    const carriageReturn = line.cr === true ? '\\u{000D}' : '';
    return `${marker}${text}${carriageReturn}${line.noEol === true ? ' \\ No newline at end of file' : ''}`;
  });
  const omitted = Math.max(0, indexes.length - selected.length);
  if (omitted > 0) {
    body.push(`... ${String(omitted)} more lines`);
  }
  const text = body.join('\n');
  return {
    text,
    fence: fenceForExcerpt(text),
    omitted,
    redactions: prepared.count,
  };
}

export function excerptForHunk(
  hunk: Hunk,
  file: DiffFile | null = null,
  options: ExcerptOptions = {},
): string {
  return excerptDetails(hunk, file, options).text;
}

export const buildExcerpt = excerptForHunk;
export const makeExcerpt = excerptForHunk;
export const excerpt = excerptForHunk;
