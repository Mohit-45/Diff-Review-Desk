import type { DiffFile, Hunk } from '../types';
import { mdInline } from './escape';
import { sanitizeSingleLine } from './redact';

function changedNumbers(hunk: Hunk, kind: 'add' | 'remove'): number[] {
  return hunk.lines.flatMap((line) => {
    if (line.kind !== kind) {
      return [];
    }
    const number = kind === 'add' ? line.newNo : line.oldNo;
    return number === null ? [] : [number];
  });
}

function numberLabel(numbers: readonly number[], fallback: number): string {
  if (numbers.length === 0) {
    return fallback === 1 ? 'line 1' : `lines ${String(fallback)}-${String(fallback)}`;
  }
  const first = numbers[0] ?? fallback;
  const last = numbers[numbers.length - 1] ?? first;
  return first === last ? `line ${String(first)}` : `lines ${String(first)}-${String(last)}`;
}

const MODE_PATTERN = /^[0-7]{6}$/;

/** A real git mode stays as git prints it; anything else is hostile text and goes in a code span. */
function modeText(mode: string | null | undefined): string {
  if (mode === null || mode === undefined) {
    return 'unknown';
  }
  return MODE_PATTERN.test(mode) ? mode : mdInline(sanitizeSingleLine(mode).text);
}

function safeOldPath(path: string): string {
  return sanitizeSingleLine(path).text.replace(/[\\`*_{}[\]()#+.!|<>~-]/gu, '\\$&');
}

/** Labels for files whose change has no reviewable line range. */
function wholeFileLabel(hunk: Hunk, file: DiffFile | null): string | null {
  if (file?.binary === true || hunk.meta.includes('binary')) {
    return '(binary file)';
  }
  if (file?.status === 'deleted') {
    return '(file deleted)';
  }
  if (hunk.meta.includes('unparsed')) {
    return '(unparsed lines)';
  }
  return hunk.meta.includes('empty-file') ? '(empty file)' : null;
}

function isModeChange(hunk: Hunk, file: DiffFile | null): boolean {
  return (
    hunk.meta.includes('mode-change') || (hunk.kind === 'meta' && file?.oldMode !== file?.newMode)
  );
}

function isRename(hunk: Hunk, file: DiffFile | null): boolean {
  return hunk.meta.includes('rename') || (hunk.kind === 'meta' && file?.status === 'renamed');
}

function renameLabel(oldPath: string | null | undefined): string {
  return oldPath === null || oldPath === undefined
    ? '(renamed)'
    : `(renamed from ${safeOldPath(oldPath)})`;
}

/** Mode and rename labels; a meta hunk without a better reason falls through to the later ones. */
function fileChangeLabel(hunk: Hunk, file: DiffFile | null): string | null {
  if (isModeChange(hunk, file)) {
    return `(mode ${modeText(file?.oldMode)} -> ${modeText(file?.newMode)})`;
  }
  return isRename(hunk, file) ? renameLabel(file?.oldPath) : null;
}

/** Return the stable, human-readable range label used by both exporters. */
export function rangeLabel(hunk: Hunk, file: DiffFile | null = null): string {
  const special = wholeFileLabel(hunk, file) ?? fileChangeLabel(hunk, file);
  if (special !== null) {
    return special;
  }

  const additions = changedNumbers(hunk, 'add');
  if (additions.length > 0) {
    return numberLabel(additions, hunk.newStart);
  }
  const removals = changedNumbers(hunk, 'remove');
  if (removals.length > 0) {
    return `${numberLabel(removals, hunk.oldStart)} (removed)`;
  }
  const meta = new Set(hunk.meta);
  if (hunk.kind === 'meta' && meta.size > 0) {
    return `(${[...meta].join(', ')})`;
  }
  return numberLabel([], hunk.newStart);
}

export const getRangeLabel = rangeLabel;
