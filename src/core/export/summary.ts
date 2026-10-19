import { LIMITS } from '../limits';
import type { DiffFile, Flag, ParseWarning, ReviewState } from '../types';
import { mdInline, quoteComment } from './escape';
import {
  decisionCounts,
  exportEntries,
  hasComment,
  hasHighRisk,
  normalizeExportInput,
  warningText,
  type ExportInput,
  type ExportEntry,
} from './model';
import { rangeLabel } from './range';
import { sanitizeSingleLine, sanitizeText } from './redact';

function field(value: string, maxChars: number = LIMITS.maxExcerptChars): string {
  return sanitizeText(value, { maxChars }).text;
}

function single(value: string, maxChars: number = LIMITS.maxExcerptChars): string {
  return sanitizeSingleLine(value, maxChars).text;
}

function pathInline(entry: ExportEntry): string {
  return mdInline(single(entry.file.displayPath));
}

function flagsText(entry: ExportEntry): string {
  const ids = [...new Set(entry.flags.map((flag) => flag.ruleId))];
  return ids.length === 0 ? '' : ids.map((id) => single(id, 80)).join(', ');
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

function warningLines(input: ReturnType<typeof normalizeExportInput>): string[] {
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

/** Deterministic Markdown review summary export. */
export function generateMarkdownSummary(input: ExportInput): string;
export function generateMarkdownSummary(
  state: ReviewState,
  files: readonly DiffFile[],
  flags?: readonly Flag[],
  time?: string,
): string;
export function generateMarkdownSummary(
  state: ReviewState,
  files: readonly DiffFile[],
  flags?: readonly Flag[],
  warnings?: readonly ParseWarning[] | readonly string[],
  time?: string,
): string;
export function generateMarkdownSummary(
  first: ExportInput | ReviewState,
  ...parts: [
    files?: readonly DiffFile[],
    flags?: readonly Flag[],
    warnings?: readonly ParseWarning[] | readonly string[] | string,
    time?: string,
  ]
): string {
  const files = parts[0] ?? [];
  const flags = parts[1] ?? [];
  const warnings = parts[2] ?? [];
  const time = parts[3] ?? '';
  const input = normalizeExportInput(
    first,
    files,
    flags,
    typeof warnings === 'string' ? [] : warnings,
    typeof warnings === 'string' ? warnings : time,
  );
  const entries = exportEntries(input);
  const counts = decisionCounts(entries);
  const percent = entries.length === 0 ? 0 : Math.floor((counts.reviewed * 100) / entries.length);
  const additions = input.files.reduce((sum, file) => sum + file.added, 0);
  const removals = input.files.reduce((sum, file) => sum + file.removed, 0);
  const label = single(input.label || 'Review', LIMITS.maxLabelChars);
  const lines: string[] = [`# Diff review: ${mdInline(label)}`, ''];
  lines.push(
    `- Verdict: ${verdict(counts)}`,
    `- Round: ${input.state.round}`,
    `- Reviewed: ${counts.reviewed} of ${entries.length} (${percent}%)`,
    `- Approved: ${counts.approved}`,
    `- Rejected: ${counts.rejected}`,
    `- Pending: ${counts.pending}`,
    `- Files: ${input.files.length} (+${additions} −${removals})`,
    `- Fingerprint: ${single(input.state.fingerprint, 80)}`,
    `- Generated: ${single(input.time || 'unspecified', 80)}`,
  );

  if (/\S/u.test(input.state.overallNote)) {
    lines.push('', '## Overall note', quoteComment(field(input.state.overallNote)));
  }

  const notes = warningLines(input);
  if (notes.length > 0) {
    lines.push('', ...notes);
  }

  const rejected = entries.filter((entry) => entry.review.decision === 'rejected');
  if (rejected.length > 0) {
    lines.push('', '## Rejected');
    for (const entry of rejected) {
      lines.push(...renderEntry(entry));
    }
  }

  const highRiskApproved = entries.filter(
    (entry) => entry.review.decision === 'approved' && hasHighRisk(entry.flags),
  );
  if (highRiskApproved.length > 0) {
    lines.push('', '## Approved despite high-risk flags');
    for (const entry of highRiskApproved) {
      lines.push(...renderEntry(entry, false));
    }
  }

  const pending = entries.filter((entry) => entry.review.decision === null);
  if (pending.length > 0) {
    lines.push('', '## Pending');
    for (const entry of pending) {
      lines.push(...renderEntry(entry));
    }
  }

  lines.push(
    '',
    'Heuristic review aid. A flag is not a finding, and no flags does not mean the change is correct.',
  );
  return lines.join('\n');
}

export const markdownSummary = generateMarkdownSummary;
export const summary = generateMarkdownSummary;
export const buildMarkdownSummary = generateMarkdownSummary;
export const exportSummary = generateMarkdownSummary;
export const createMarkdownSummary = generateMarkdownSummary;
export const buildSummary = generateMarkdownSummary;
export const createSummary = generateMarkdownSummary;
