import { createFile, setPaths, updateFileKind } from './file-model';
import { cleanHeaderLine } from './line-tests';
import { finishFile } from './meta-hunks';
import { parseGitHeaderPath, parseUnifiedHeaderPath } from './paths';
import { addClass, type MutableFile, type ScanState } from './scan-state';
import { addWarning, siteAt, WARNINGS } from './warnings';

/** A `---`/`+++` pair continues the current file only while that file is still bare. */
function fileForHeaderPair(state: ScanState): MutableFile {
  const file = state.current;
  if (file !== null && file.hunks.length === 0 && !file.binary && !file.headerPathSeen) {
    return file;
  }
  if (file !== null) {
    finishFile(file);
  }
  return createFile(state, false);
}

export function markPair(state: ScanState, index: number): void {
  const firstRaw = state.lines[index] ?? '';
  const first = cleanHeaderLine(firstRaw);
  const second = cleanHeaderLine(state.lines[index + 1] ?? '');
  const file = fileForHeaderPair(state);
  const old = parseUnifiedHeaderPath(first.slice(4), file.sourceGit ? 'a/' : null);
  const next = parseUnifiedHeaderPath(second.slice(4), file.sourceGit ? 'b/' : null);
  setPaths(file, old.path, next.path, true);
  updateFileKind(file);
  if (old.failed || next.failed) {
    addWarning(state, WARNINGS.pathEncoding, siteAt(file, index, firstRaw));
  }
  const maxLength = state.limits.maxHeaderLineChars;
  if (first.length > maxLength || second.length > maxLength) {
    addWarning(state, WARNINGS.fileHeaderTruncated, siteAt(file, index, firstRaw));
  }
  addClass(state, index, 'fileHeader');
  addClass(state, index + 1, 'fileHeader');
  state.sawHeaderPair = true;
}

function gitHeaderPrefix(raw: string): string {
  if (raw.startsWith('diff --cc ')) {
    return 'diff --cc ';
  }
  return raw.startsWith('diff --combined ') ? 'diff --combined ' : 'diff --git ';
}

export function processDiffHeader(state: ScanState, index: number, combined: boolean): void {
  const raw = cleanHeaderLine(state.lines[index] ?? '');
  const file = createFile(state, true);
  file.combined = combined;
  file.binaryMode = combined;
  const paths = parseGitHeaderPath(raw.slice(gitHeaderPrefix(raw).length));
  setPaths(file, paths.oldPath, paths.newPath, false);
  const site = siteAt(file, index, raw);
  if (paths.ambiguous) {
    addWarning(state, WARNINGS.ambiguousPath, site);
  }
  if (paths.encodingFailed) {
    addWarning(state, WARNINGS.pathEncoding, site);
  }
  if (raw.length > state.limits.maxHeaderLineChars) {
    addWarning(state, WARNINGS.fileHeaderTruncated, site);
  }
  if (combined) {
    addWarning(state, WARNINGS.combinedUnsupported, site);
  }
  addClass(state, index, 'fileHeader');
}
