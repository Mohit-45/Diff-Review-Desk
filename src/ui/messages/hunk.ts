import type { MetaReason } from '../../core/types';

/** Copy for the hunk card and the large-diff controls. Numbers only, never diff text. */
export const hunkMessages = {
  revealSecrets: 'Reveal secrets',
  hideSecrets: 'Hide secrets',
  noCommentYet: 'No comment yet. The agent will be told to revert or rework this hunk.',
  noFlags: 'No heuristic flags matched. This is not a security assessment.',
  footer:
    'Heuristic review aid. A flag is not a finding, and no flags does not mean the change is correct.',
} as const;

function count(value: number): string {
  return String(value);
}

function plural(value: number, noun: string): string {
  return `${count(value)} ${noun}${value === 1 ? '' : 's'}`;
}

export function showDiff(lines: number): string {
  return `Show diff (${plural(lines, 'line')})`;
}

export function showMoreCharacters(hidden: number): string {
  return `Show ${count(hidden)} more ${hidden === 1 ? 'character' : 'characters'}`;
}

export function showNextLines(next: number, remaining: number): string {
  return `Show next ${plural(next, 'line')} (${count(remaining)} remaining)`;
}

export function showAllLines(remaining: number): string {
  return `Show all ${plural(remaining, 'remaining line')}`;
}

export function linesShown(shown: number, total: number): string {
  return `Showing ${count(shown)} of ${plural(total, 'line')}.`;
}

export function showNextHunks(next: number, remaining: number): string {
  return `Show next ${plural(next, 'hunk')} (${count(remaining)} remaining)`;
}

export function hunksShown(shown: number, total: number): string {
  return `Showing ${count(shown)} of ${plural(total, 'hunk')} in this file.`;
}

const META_HEADINGS: Readonly<Record<MetaReason, string>> = {
  rename: 'renamed file',
  copy: 'copied file',
  'mode-change': 'mode change',
  'type-change': 'file type change',
  binary: 'binary file',
  'empty-file': 'empty file',
  'no-hunks': 'no text hunks',
  'content-omitted': 'content omitted',
  combined: 'combined diff',
  unparsed: 'unparsed lines',
};

/** What a meta hunk is, in place of a line range it does not have. */
export function metaHeading(reason: MetaReason | undefined): string {
  return META_HEADINGS[reason ?? 'unparsed'];
}
