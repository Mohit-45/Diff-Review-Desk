import type { DiffFile, Hunk } from '../types';
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
  const usable = numbers.filter((number): number is number => number !== null);
  if (usable.length === 0) {
    return fallback === 1 ? 'line 1' : `lines ${fallback}-${fallback}`;
  }
  const first = usable[0] ?? fallback;
  const last = usable[usable.length - 1] ?? first;
  return first === last ? `line ${first}` : `lines ${first}-${last}`;
}

function safeOldPath(path: string): string {
  return sanitizeSingleLine(path).text.replace(/[\\`*_{}\[\]()#+.!|<>~-]/gu, '\\$&');
}

/** Return the stable, human-readable range label used by both exporters. */
export function rangeLabel(hunk: Hunk, file: DiffFile | null = null): string {
  const meta = new Set(hunk.meta);
  if (file?.binary === true || meta.has('binary')) {
    return '(binary file)';
  }
  if (file?.status === 'deleted') {
    return '(file deleted)';
  }
  if (meta.has('unparsed')) {
    return '(unparsed lines)';
  }
  if (meta.has('empty-file')) {
    return '(empty file)';
  }
  if (meta.has('mode-change') || (hunk.kind === 'meta' && file?.oldMode !== file?.newMode)) {
    const oldMode = file?.oldMode ?? 'unknown';
    const newMode = file?.newMode ?? 'unknown';
    return `(mode ${oldMode} -> ${newMode})`;
  }
  if (meta.has('rename') || (hunk.kind === 'meta' && file?.status === 'renamed')) {
    const oldPath = file?.oldPath;
    return oldPath === null || oldPath === undefined
      ? '(renamed)'
      : `(renamed from ${safeOldPath(oldPath)})`;
  }

  const additions = changedNumbers(hunk, 'add');
  if (additions.length > 0) {
    return numberLabel(additions, hunk.newStart);
  }
  const removals = changedNumbers(hunk, 'remove');
  if (removals.length > 0) {
    return `${numberLabel(removals, hunk.oldStart)} (removed)`;
  }
  if (hunk.kind === 'meta' && meta.size > 0) {
    return `(${[...meta].join(', ')})`;
  }
  return numberLabel([], hunk.newStart);
}

export const getRangeLabel = rangeLabel;
