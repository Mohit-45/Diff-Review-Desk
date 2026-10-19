import { sanitizeSingleLine } from './redact';

export type ExportFilenameKind = 'agent-feedback' | 'review' | 'summary';

/** Convert a review label into a filesystem-safe, deterministic slug. */
export function filenameSlug(label: string): string {
  const safe = sanitizeSingleLine(label, 200).text.toLowerCase();
  const slug = safe
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'review';
}

export const slugify = filenameSlug;

function timestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '00000000-0000';
  }
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}`;
}

export function exportFilename(
  kind: ExportFilenameKind,
  label: string,
  round: number,
  iso: string,
): string {
  const prefix = kind === 'agent-feedback' ? 'agent-feedback' : 'review';
  const safeRound = Number.isFinite(round) ? Math.max(0, Math.trunc(round)) : 0;
  return `${prefix}-${filenameSlug(label)}-r${safeRound}-${timestamp(iso)}.md`;
}

export const makeFilename = exportFilename;
export const makeExportFilename = exportFilename;
export const formatFilename = exportFilename;
export const filenameForExport = exportFilename;
