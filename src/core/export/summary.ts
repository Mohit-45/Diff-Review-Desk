import type { DiffFile, Flag, ParseWarning, ReviewState } from '../types';
import { mdInline, quoteComment } from './escape';
import {
  decisionCounts,
  exportEntries,
  exportInputFromArgs,
  hasComment,
  hasHighRisk,
  warningText,
  type ExportEntry,
  type ExportInput,
  type NormalizedExportInput,
  type PositionalExportArgs,
} from './model';
import { rangeLabel } from './range';
import { sanitizeSingleLine, sanitizeText } from './redact';

// Only diff excerpt lines are cut. Comments, notes, labels and paths keep their full text.
function field(value: string): string {
  return sanitizeText(value).text;
}

function single(value: string): string {
  return sanitizeSingleLine(value).text;
}

function pathInline(entry: ExportEntry): string {
  return mdInline(single(entry.file.displayPath));
}

function flagsText(entry: ExportEntry): string {
  const ids = [...new Set(entry.flags.map((flag) => flag.ruleId))];
  return ids.length === 0 ? '' : ids.map((id) => single(id)).join(', ');
}

function commentLines(entry: ExportEntry): string[] {
  if (!hasComment(entry.review)) {
    return [];
  }
  return quoteComment(field(entry.review.comment)).split('\n');
}

function renderEntry(entry: ExportEntry, includeComment = true): string[] {
  const lines = [`- ${pathInline(entry)} (${rangeLabel(entry.hunk, entry.file)})`];
  const flags = flagsText(entry);
  if (flags.length > 0) {
    lines.push(`  Risk flags: ${flags}`);
  }
  if (includeComment) {
    lines.push(...commentLines(entry).map((line) => `  ${line}`));
  }
  return lines;
}

function verdict(counts: ReturnType<typeof decisionCounts>): string {
  if (counts.rejected > 0) {
    return 'Changes requested';
  }
  return counts.pending > 0 ? 'In progress' : 'Approved';
}

function warningLines(input: NormalizedExportInput): string[] {
  if (input.warnings.length === 0) {
    return [];
  }
  const lines = ['## Parse notes'];
  for (const warning of input.warnings) {
    const safe = field(warningText(warning)).split('\n');
    const first = safe[0] ?? '';
    lines.push(`- ${mdInline(first)}`);
    lines.push(...safe.slice(1).map((line) => `  ${mdInline(line)}`));
  }
  return lines;
}

const DISCLAIMER =
  'Heuristic review aid. A flag is not a finding, and no flags does not mean the change is correct.';

function metadataLines(input: NormalizedExportInput, entries: readonly ExportEntry[]): string[] {
  const counts = decisionCounts(entries);
  const percent = entries.length === 0 ? 0 : Math.floor((counts.reviewed * 100) / entries.length);
  const additions = input.files.reduce((sum, file) => sum + file.added, 0);
  const removals = input.files.reduce((sum, file) => sum + file.removed, 0);
  const label = single(input.label || 'Review');
  return [
    `# Diff review: ${mdInline(label)}`,
    '',
    `- Verdict: ${verdict(counts)}`,
    `- Round: ${String(input.state.round)}`,
    `- Reviewed: ${String(counts.reviewed)} of ${String(entries.length)} (${String(percent)}%)`,
    `- Approved: ${String(counts.approved)}`,
    `- Rejected: ${String(counts.rejected)}`,
    `- Pending: ${String(counts.pending)}`,
    `- Files: ${String(input.files.length)} (+${String(additions)} −${String(removals)})`,
    `- Fingerprint: ${single(input.state.fingerprint)}`,
    `- Generated: ${single(input.time || 'unspecified')}`,
  ];
}

function overallNoteLines(input: NormalizedExportInput): string[] {
  if (!/\S/u.test(input.state.overallNote)) {
    return [];
  }
  return ['', '## Overall note', quoteComment(field(input.state.overallNote))];
}

function parseNoteLines(input: NormalizedExportInput): string[] {
  const notes = warningLines(input);
  return notes.length === 0 ? [] : ['', ...notes];
}

function entrySection(
  heading: string,
  entries: readonly ExportEntry[],
  includeComment: boolean,
): string[] {
  if (entries.length === 0) {
    return [];
  }
  return ['', heading, ...entries.flatMap((entry) => renderEntry(entry, includeComment))];
}

function entrySections(entries: readonly ExportEntry[]): string[] {
  const rejected = entries.filter((entry) => entry.review.decision === 'rejected');
  const highRiskApproved = entries.filter(
    (entry) => entry.review.decision === 'approved' && hasHighRisk(entry.flags),
  );
  const pending = entries.filter((entry) => entry.review.decision === null);
  return [
    ...entrySection('## Rejected', rejected, true),
    ...entrySection('## Approved despite high-risk flags', highRiskApproved, false),
    ...entrySection('## Pending', pending, true),
  ];
}

/** Deterministic Markdown review summary export. */
export function generateMarkdownSummary(input: ExportInput): string;
export function generateMarkdownSummary(
  state: ReviewState,
  files: readonly DiffFile[],
  ...rest: [
    flags?: readonly Flag[],
    warnings?: readonly ParseWarning[] | readonly string[] | string,
    time?: string,
  ]
): string;
export function generateMarkdownSummary(
  first: ExportInput | ReviewState,
  ...parts: PositionalExportArgs
): string {
  const input = exportInputFromArgs(first, parts);
  const entries = exportEntries(input);
  return [
    ...metadataLines(input, entries),
    ...overallNoteLines(input),
    ...parseNoteLines(input),
    ...entrySections(entries),
    '',
    DISCLAIMER,
  ].join('\n');
}

export const markdownSummary = generateMarkdownSummary;
export const summary = generateMarkdownSummary;
export const buildMarkdownSummary = generateMarkdownSummary;
export const exportSummary = generateMarkdownSummary;
export const createMarkdownSummary = generateMarkdownSummary;
export const buildSummary = generateMarkdownSummary;
export const createSummary = generateMarkdownSummary;
