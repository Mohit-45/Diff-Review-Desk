import type { ParseWarning } from '../../core/types';

/** Copy for the parse-report banner, the rule notices and the export link that opens them. */
export const warningMessages = {
  reportSummary: 'Parse report',
  reportRegion: 'Parse warnings',
  warningLevel: 'Warning',
  noteLevel: 'Note',
  bannerHint: 'The review still works. The parse report says what was affected.',
  ruleRegion: 'Risk checks that did not run',
  ruleNotStored:
    'The diff text is not being saved for this review. Your decisions and comments still are.',
} as const;

/** How many reports are serious enough to count: info items are only listed in the report. */
export function warnLevelCount(warnings: readonly ParseWarning[]): number {
  return warnings.filter((warning) => warning.level === 'warn').length;
}

export function warningsBanner(count: number): string {
  return count === 1 ? '1 warning in this diff.' : `${String(count)} warnings in this diff.`;
}

/** The announcement tail: "2 warnings." after the load line, and nothing when there are none. */
export function warningsAnnouncement(count: number): string {
  if (count === 0) {
    return '';
  }
  return count === 1 ? ' 1 warning.' : ` ${String(count)} warnings.`;
}

export function reportLine(line: number | null): string {
  return line === null ? '' : `Line ${String(line)}`;
}

export function reportCount(count: number): string {
  return count > 1 ? `${String(count)} times` : '';
}

export function ruleNotice(ruleId: string): string {
  return `Rule ${ruleId} could not run on`;
}

/** " and 3 more files" after the first file a rule failed on; nothing when it was only one. */
export function moreFiles(others: number): string {
  if (others < 1) {
    return '';
  }
  return others === 1 ? ' and 1 more file' : ` and ${String(others)} more files`;
}
