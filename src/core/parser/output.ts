import type { DiffFile, DiffLine, Hunk } from '../types';
import type { MutableFile, MutableHunk, MutableLine } from './scan-state';

function toDiffLine(line: MutableLine): DiffLine {
  const result: MutableLine = { ...line };
  if (result.noEol === undefined) delete result.noEol;
  if (result.cr === undefined) delete result.cr;
  if (result.suspect === undefined) delete result.suspect;
  return result;
}

function toHunk(hunk: MutableHunk): Hunk {
  return {
    id: hunk.id,
    fileId: hunk.fileId,
    index: hunk.index,
    kind: hunk.kind,
    meta: hunk.meta,
    header: hunk.header,
    section: hunk.section,
    oldStart: hunk.oldStart,
    oldCount: hunk.oldCount,
    newStart: hunk.newStart,
    newCount: hunk.newCount,
    lines: hunk.lines.map(toDiffLine),
    added: hunk.added,
    removed: hunk.removed,
    truncated: hunk.truncated,
    countMismatch: hunk.countMismatch,
    hash: hunk.hash,
  };
}

export function toFile(file: MutableFile): DiffFile {
  return {
    id: file.id,
    displayPath: file.displayPath,
    oldPath: file.oldPath,
    newPath: file.newPath,
    status: file.status,
    similarity: file.similarity,
    oldMode: file.oldMode,
    newMode: file.newMode,
    kind: file.kind,
    binary: file.binary,
    generated: file.generated,
    hunks: file.hunks.map(toHunk),
    added: file.added,
    removed: file.removed,
    incomplete: file.incomplete,
  };
}
