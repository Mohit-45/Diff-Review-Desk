import type { DiffFile, Flag, ParseWarning, ReviewState } from '../../core/types';
import { exportEntries, hasComment, type NormalizedExportInput } from '../../core/export/model';
import { isSensitivePath, redactTextWithCount } from '../../core/export/redact';
import { selectReviewStats } from '../../core/review/selectors';
import type { ExportWarning } from './exportTypes';

function countFileRedactions(file: DiffFile): number {
  const sensitiveFile = isSensitivePath(file.displayPath);
  let count = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      count += redactTextWithCount(line.text, { sensitiveFile }).count;
    }
  }
  return count;
}

/**
 * Counts what the exporter will redact, from every text source it scans:
 * label, notes, paths, hunk headers, lines, flag text, warnings and comments.
 */
export function countRedactions(
  state: ReviewState,
  files: readonly DiffFile[],
  flags: readonly Flag[],
  warnings: readonly ParseWarning[] | readonly string[],
): number {
  let count = 0;
  const add = (value: string | null | undefined) => {
    if (value !== null && value !== undefined && value.length > 0) {
      count += redactTextWithCount(value).count;
    }
  };

  add(state.label);
  add(state.overallNote);
  for (const file of files) {
    add(file.displayPath);
    add(file.oldPath);
    add(file.newPath);
    for (const hunk of file.hunks) {
      add(hunk.header);
      add(hunk.section);
    }
    count += countFileRedactions(file);
  }
  for (const flag of flags) {
    add(flag.title);
    add(flag.why);
    add(flag.evidence);
  }
  for (const warning of warnings) {
    add(typeof warning === 'string' ? warning : warning.message);
  }
  for (const review of Object.values(state.hunks)) {
    add(review.comment);
  }
  return count;
}

/** Only a warning is a parse note; the informational items stay in the parse report. */
function parseNoteCount(warnings: readonly ParseWarning[] | readonly string[]): number {
  let count = 0;
  for (const warning of warnings) {
    if (typeof warning === 'string' || warning.level === 'warn') {
      count += 1;
    }
  }
  return count;
}

/** The non-blocking notes shown under the preview; zero-count notes are left out. */
export function buildExportWarnings(input: NormalizedExportInput): readonly ExportWarning[] {
  const stats = selectReviewStats(input.files, input.state);
  const rejectedWithoutComment = exportEntries(input).filter(
    (entry) => entry.review.decision === 'rejected' && !hasComment(entry.review),
  ).length;
  const allWarnings: readonly ExportWarning[] = [
    { target: 'pending', label: 'Pending hunks', count: stats.pending },
    {
      target: 'rejected-comment',
      label: 'Rejected hunks without a comment',
      count: rejectedWithoutComment,
    },
    { target: 'parse-notes', label: 'Parse notes', count: parseNoteCount(input.warnings) },
    {
      target: 'redactions',
      label: 'Redactions applied',
      count: countRedactions(input.state, input.files, input.flags, input.warnings),
    },
  ];
  return allWarnings.filter((warning) => warning.count > 0);
}
