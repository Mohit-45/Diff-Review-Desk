import { fileIdForPath, hunkIdForHash } from '../hash';
import type { MutableFile, MutableHunk } from './scan-state';

function markerFor(kind: 'context' | 'add' | 'remove'): string {
  if (kind === 'context') {
    return ' ';
  }
  return kind === 'add' ? '+' : '-';
}

export function assignIdentities(files: readonly MutableFile[]): void {
  const pathOccurrences = new Map<string, number>();
  for (const file of files) {
    const displayPath = file.displayPath || file.newPath || file.oldPath || 'unknown';
    file.displayPath = displayPath;
    const occurrence = (pathOccurrences.get(displayPath) ?? 0) + 1;
    pathOccurrences.set(displayPath, occurrence);
    file.id = fileIdForPath(displayPath, occurrence);
    const hashOccurrences = new Map<string, number>();
    for (const hunk of file.hunks) {
      hunk.fileId = file.id;
      const occurrenceForHash = (hashOccurrences.get(hunk.hash) ?? 0) + 1;
      hashOccurrences.set(hunk.hash, occurrenceForHash);
      hunk.id = hunkIdForHash(file.id, hunk.hash, occurrenceForHash);
    }
  }
}

function canonicalHunkHeader(hunk: MutableHunk): string {
  const oldCount = hunk.oldCount === 1 ? '' : `,${String(hunk.oldCount)}`;
  const newCount = hunk.newCount === 1 ? '' : `,${String(hunk.newCount)}`;
  return `@@ -${String(hunk.oldStart)}${oldCount} +${String(hunk.newStart)}${newCount} @@${hunk.section}`;
}

function appendCanonicalHeader(out: string[], file: MutableFile): void {
  out.push(`--- ${file.oldPath ?? '/dev/null'}`);
  out.push(`+++ ${file.newPath ?? '/dev/null'}`);
  if (file.oldMode !== null) {
    out.push(`old mode ${file.oldMode}`);
  }
  if (file.newMode !== null) {
    out.push(`new mode ${file.newMode}`);
  }
  if (file.similarity !== null) {
    out.push(`similarity index ${String(file.similarity)}%`);
  }
  if (file.renameSeen) {
    out.push(`rename from ${file.oldPath ?? ''}`);
    out.push(`rename to ${file.newPath ?? ''}`);
  } else if (file.copySeen) {
    out.push(`copy from ${file.oldPath ?? ''}`);
    out.push(`copy to ${file.newPath ?? ''}`);
  }
  if (file.combined) {
    out.push('combined');
  } else if (file.binary) {
    out.push('binary');
  }
}

function appendCanonicalHunk(out: string[], hunk: MutableHunk): void {
  if (hunk.kind !== 'text') {
    out.push(`meta ${hunk.meta.join(',')}`);
    for (const line of hunk.lines) {
      out.push(line.text);
    }
    return;
  }
  out.push(canonicalHunkHeader(hunk));
  for (const line of hunk.lines) {
    out.push(`${markerFor(line.kind)}${line.text}${line.cr ? '\r' : ''}`);
    if (line.noEol) {
      out.push('\\ No newline at end of file');
    }
  }
}

/**
 * The text the diff fingerprint is taken from. Lines are appended one at a time because
 * spreading a very large hunk into `push` would overflow the call stack.
 */
export function canonicalText(files: readonly MutableFile[]): string {
  const out: string[] = [];
  for (const file of files) {
    appendCanonicalHeader(out, file);
    for (const hunk of file.hunks) {
      appendCanonicalHunk(out, hunk);
    }
  }
  return out.join('\n');
}
