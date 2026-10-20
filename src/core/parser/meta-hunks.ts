import { hunkHash } from '../hash';
import type { MetaReason } from '../types';
import { generatedPath } from './paths';
import { updateFileKind } from './file-model';
import {
  addClass,
  type MutableFile,
  type MutableHunk,
  type MutableLine,
  type ScanState,
} from './scan-state';
import { addWarning, siteAt, WARNINGS } from './warnings';

const MAX_SHOWN_RAW_LINES = 200;

export function finishUnparsed(file: MutableFile): void {
  if (file.currentUnparsed.length > 0) {
    file.unparsedRuns.push(file.currentUnparsed);
    file.currentUnparsed = [];
  }
}

export function appendUnparsed(state: ScanState, file: MutableFile, index: number): void {
  const line = state.lines[index] ?? '';
  file.currentUnparsed.push(line);
  if (state.suspiciousLines.has(index)) {
    addWarning(state, WARNINGS.suspiciousChars, siteAt(file, index, line));
  }
  state.orphanLines += 1;
  addClass(state, index, 'unknown');
}

function makeMetaHunk(
  file: MutableFile,
  reason: MetaReason,
  rawLines: readonly string[],
  index: number,
): MutableHunk {
  const shown = rawLines
    .slice(0, MAX_SHOWN_RAW_LINES)
    .map<MutableLine>((line) => ({ kind: 'context', text: line, oldNo: null, newNo: null }));
  return {
    id: '',
    fileId: file.id,
    index,
    kind: 'meta',
    meta: [reason],
    header: null,
    section: '',
    oldStart: 0,
    oldCount: 0,
    newStart: 0,
    newCount: 0,
    lines: shown,
    added: 0,
    removed: 0,
    truncated: rawLines.length > shown.length,
    countMismatch: false,
    hash: hunkHash(shown),
  };
}

function addUnparsedMeta(file: MutableFile): void {
  finishUnparsed(file);
  for (const run of file.unparsedRuns) {
    file.hunks.push(makeMetaHunk(file, 'unparsed', run, file.hunks.length));
    file.incomplete = true;
  }
  file.unparsedRuns = [];
}

function syntheticReason(file: MutableFile): MetaReason {
  if (file.combined) {
    return 'combined';
  }
  if (file.binary) {
    return 'binary';
  }
  if (file.typeChanged) {
    return 'type-change';
  }
  if (file.modeChanged) {
    return 'mode-change';
  }
  if (file.renameSeen) {
    return 'rename';
  }
  if (file.copySeen) {
    return 'copy';
  }
  if (file.status === 'added' || file.status === 'deleted') {
    return 'empty-file';
  }
  return 'no-hunks';
}

function finalStatus(file: MutableFile): MutableFile['status'] {
  if (file.oldPath === null && file.newPath !== null) {
    return 'added';
  }
  if (file.newPath === null && file.oldPath !== null) {
    return 'deleted';
  }
  if (file.renameSeen) {
    return 'renamed';
  }
  return file.copySeen ? 'copied' : file.status;
}

export function finishFile(file: MutableFile): void {
  addUnparsedMeta(file);
  updateFileKind(file);
  if (file.hunks.length === 0) {
    file.hunks.push(makeMetaHunk(file, syntheticReason(file), [], 0));
  } else if (
    file.hunks.some((hunk) => hunk.kind === 'text') &&
    (file.modeChanged || file.typeChanged)
  ) {
    file.hunks.push(
      makeMetaHunk(file, file.typeChanged ? 'type-change' : 'mode-change', [], file.hunks.length),
    );
  }
  file.status = finalStatus(file);
  file.generated = generatedPath(file.displayPath);
}
