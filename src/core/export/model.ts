import type { DiffFile, Flag, Hunk, HunkReview, ParseWarning, ReviewState } from '../types';

export type ExportInput = {
  readonly state: ReviewState;
  readonly files: readonly DiffFile[];
  readonly flags?: readonly Flag[];
  readonly warnings?: readonly ParseWarning[] | readonly string[];
  readonly label?: string;
  readonly time?: string;
  readonly isoTime?: string;
  readonly generatedAt?: string;
};

export type ExportEntry = {
  readonly file: DiffFile;
  readonly hunk: Hunk;
  readonly review: HunkReview;
  readonly flags: readonly Flag[];
};

export type NormalizedExportInput = {
  readonly state: ReviewState;
  readonly files: readonly DiffFile[];
  readonly flags: readonly Flag[];
  readonly warnings: readonly ParseWarning[] | readonly string[];
  readonly label: string;
  readonly time: string;
};

function reviewFor(state: ReviewState, hunk: Hunk): HunkReview {
  if (Object.hasOwn(state.hunks, hunk.id)) {
    const review = state.hunks[hunk.id];
    if (review !== undefined) {
      return review;
    }
  }
  return { decision: null, comment: '' };
}

function severityRank(severity: Flag['severity']): number {
  return severity === 'high' ? 0 : severity === 'medium' ? 1 : 2;
}

export function flagsForEntry(flags: readonly Flag[], file: DiffFile, hunk: Hunk): readonly Flag[] {
  return flags
    .filter((flag) => flag.fileId === file.id && (flag.hunkId === hunk.id || flag.hunkId === null))
    .slice()
    .sort((left, right) => {
      const severity = severityRank(left.severity) - severityRank(right.severity);
      if (severity !== 0) {
        return severity;
      }
      const line =
        (left.lines[0] ?? Number.MAX_SAFE_INTEGER) - (right.lines[0] ?? Number.MAX_SAFE_INTEGER);
      if (line !== 0) {
        return line;
      }
      return left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0;
    });
}

export function exportEntries(input: NormalizedExportInput): readonly ExportEntry[] {
  const entries: ExportEntry[] = [];
  for (const file of input.files) {
    for (const hunk of file.hunks) {
      entries.push({
        file,
        hunk,
        review: reviewFor(input.state, hunk),
        flags: flagsForEntry(input.flags, file, hunk),
      });
    }
  }
  return entries;
}

function asInput(value: unknown): value is ExportInput {
  return typeof value === 'object' && value !== null && 'state' in value && 'files' in value;
}

export function normalizeExportInput(
  first: ExportInput | ReviewState,
  ...parts: [
    files?: readonly DiffFile[],
    flags?: readonly Flag[],
    warnings?: readonly ParseWarning[] | readonly string[],
    time?: string,
  ]
): NormalizedExportInput {
  const files = parts[0] ?? [];
  const flags = parts[1] ?? [];
  const warnings = parts[2] ?? [];
  const time = parts[3] ?? '';
  if (asInput(first)) {
    return {
      state: first.state,
      files: first.files,
      flags: first.flags ?? [],
      warnings: first.warnings ?? [],
      label: first.label ?? first.state.label,
      time: first.time ?? first.isoTime ?? first.generatedAt ?? '',
    };
  }
  return { state: first, files, flags, warnings, label: first.label, time };
}

/**
 * Positional arguments after the review state. A string in the warnings slot is
 * the generation time, which keeps the shorter `(state, files, flags, time)` form working.
 */
export type PositionalExportArgs = [
  files?: readonly DiffFile[],
  flags?: readonly Flag[],
  warnings?: readonly ParseWarning[] | readonly string[] | string,
  time?: string,
];

export function exportInputFromArgs(
  first: ExportInput | ReviewState,
  parts: PositionalExportArgs,
): NormalizedExportInput {
  const files = parts[0] ?? [];
  const flags = parts[1] ?? [];
  const warnings = parts[2] ?? [];
  const time = parts[3] ?? '';
  return normalizeExportInput(
    first,
    files,
    flags,
    typeof warnings === 'string' ? [] : warnings,
    typeof warnings === 'string' ? warnings : time,
  );
}

export function decisionCounts(entries: readonly ExportEntry[]): {
  readonly approved: number;
  readonly rejected: number;
  readonly pending: number;
  readonly reviewed: number;
} {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  for (const entry of entries) {
    if (entry.review.decision === 'approved') {
      approved += 1;
    } else if (entry.review.decision === 'rejected') {
      rejected += 1;
    } else {
      pending += 1;
    }
  }
  return { approved, rejected, pending, reviewed: approved + rejected };
}

export function hasComment(review: HunkReview): boolean {
  return /\S/u.test(review.comment);
}

export function hasHighRisk(flags: readonly Flag[]): boolean {
  return flags.some((flag) => flag.severity === 'high');
}

export function warningText(warning: ParseWarning | string): string {
  if (typeof warning === 'string') {
    return warning;
  }
  const count = warning.count > 1 ? ` (${String(warning.count)})` : '';
  return `${warning.code}${count}: ${warning.message}`;
}
