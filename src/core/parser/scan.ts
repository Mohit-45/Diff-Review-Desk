import { fingerprintForText } from '../hash';
import type { LineClass, ParseResult } from '../types';
import { processDiffHeader, markPair } from './file-headers';
import { parseMetadata } from './file-model';
import { parseHunk } from './hunk-body';
import { assignIdentities, canonicalText } from './identities';
import {
  cleanHeaderLine,
  headerLineTooLong,
  hunkCandidate,
  isBinaryLine,
  isBodyLike,
  isCombinedHeader,
  isCommitHeader,
  isDiffHeader,
  isHeaderPair,
  isLikelyTrailer,
  isMailSignature,
  isMetadataLine,
  isSeparator,
  parseHunkHeader,
} from './line-tests';
import { appendUnparsed, finishFile, finishUnparsed } from './meta-hunks';
import { classifyNoDiff } from './no-diff';
import { tooLargeResult } from './errors';
import { toFile } from './output';
import type { PreparedText } from './pipeline';
import {
  addClass,
  type MutableFile,
  type MutableHunk,
  type ParserLimits,
  type ScanState,
} from './scan-state';
import { addPipelineWarnings, addWarning, siteAt, toWarnings, WARNINGS } from './warnings';

/** Handles one line inside a file; returns the next index, or null when the line is not its kind. */
type FileLineHandler = (
  state: ScanState,
  file: MutableFile,
  index: number,
  raw: string,
) => number | null;

const EMPTY_CLASSES: Record<LineClass, number> = {
  preamble: 0,
  fileHeader: 0,
  hunkHeader: 0,
  hunkBody: 0,
  separator: 0,
  trailer: 0,
  binaryPayload: 0,
  unknown: 0,
};

function createScanState(prepared: PreparedText, limits: ParserLimits): ScanState {
  return {
    lines: prepared.lines,
    nulLines: prepared.nulLines,
    suspiciousLines: prepared.suspiciousLines,
    lineClasses: { ...EMPTY_CLASSES },
    warnings: [],
    files: [],
    limits,
    warningsDropped: 0,
    orphanLines: 0,
    current: null,
    sawCommitHeader: false,
    sawHunkHeader: false,
    sawHeaderPair: false,
    workUnits: 0,
  };
}

function hunkSatisfied(hunk: MutableHunk): boolean {
  return hunk.kind === 'text' && !hunk.truncated;
}

function finishCurrent(state: ScanState): void {
  if (state.current !== null) {
    finishFile(state.current);
  }
}

const hunkHeaderLine: FileLineHandler = (state, file, index, raw) => {
  const header = parseHunkHeader(raw, state.limits.maxHeaderLineChars);
  if (header === null) {
    return null;
  }
  finishUnparsed(file);
  return parseHunk(state, file, index, header);
};

const badHunkHeaderLine: FileLineHandler = (state, file, index, raw) => {
  if (!hunkCandidate(raw)) {
    return null;
  }
  appendUnparsed(state, file, index);
  addWarning(state, WARNINGS.badHunkHeader, siteAt(file, index, raw));
  return index + 1;
};

const binaryLine: FileLineHandler = (state, file, index, raw) => {
  if (!isBinaryLine(raw)) {
    return null;
  }
  finishUnparsed(file);
  file.binary = true;
  file.binaryMode = true;
  addClass(state, index, 'binaryPayload');
  return index + 1;
};

const metadataLine: FileLineHandler = (state, file, index, raw) => {
  if (!isMetadataLine(raw)) {
    return null;
  }
  finishUnparsed(file);
  parseMetadata(state, file, index);
  if (headerLineTooLong(raw, state.limits.maxHeaderLineChars)) {
    addWarning(state, WARNINGS.fileHeaderTruncated, siteAt(file, index, raw));
  }
  addClass(state, index, 'fileHeader');
  return index + 1;
};

/** A signature, separator, commit header or next `diff --git` after at least one hunk. */
const trailerLine: FileLineHandler = (state, file, index, raw) => {
  const trailing =
    isMailSignature(state.lines, index) ||
    (file.hunks.length > 0 && isLikelyTrailer(state.lines, index));
  if (!trailing) {
    return null;
  }
  finishUnparsed(file);
  addClass(state, index, isSeparator(raw) ? 'separator' : 'trailer');
  addWarning(state, WARNINGS.trailerIgnored, siteAt(file, index, raw));
  return index + 1;
};

/** Non-body text after a hunk that already received all the lines it declared. */
const textAfterSatisfiedHunk: FileLineHandler = (state, file, index, raw) => {
  const lastHunk = file.hunks.at(-1);
  if (lastHunk === undefined || !hunkSatisfied(lastHunk) || isBodyLike(raw)) {
    return null;
  }
  finishUnparsed(file);
  addClass(state, index, 'trailer');
  addWarning(state, WARNINGS.trailerIgnored, siteAt(file, index, raw));
  return index + 1;
};

const FILE_LINE_HANDLERS: readonly FileLineHandler[] = [
  hunkHeaderLine,
  badHunkHeaderLine,
  binaryLine,
  metadataLine,
  trailerLine,
  textAfterSatisfiedHunk,
];

function unknownLine(state: ScanState, file: MutableFile, index: number, raw: string): number {
  appendUnparsed(state, file, index);
  addWarning(state, WARNINGS.unknownLines, siteAt(file, index, raw));
  return index + 1;
}

function scanFileLine(state: ScanState, file: MutableFile, index: number, raw: string): number {
  for (const handler of FILE_LINE_HANDLERS) {
    const next = handler(state, file, index, raw);
    if (next !== null) {
      return next;
    }
  }
  return unknownLine(state, file, index, raw);
}

function preambleLine(state: ScanState, index: number, raw: string): number {
  if (isCommitHeader(cleanHeaderLine(raw))) {
    state.sawCommitHeader = true;
  }
  addClass(state, index, isSeparator(raw) ? 'separator' : 'preamble');
  addWarning(state, WARNINGS.preambleIgnored, siteAt(null, index, raw));
  return index + 1;
}

function startGitFile(state: ScanState, index: number, combined: boolean): number {
  finishCurrent(state);
  processDiffHeader(state, index, combined);
  return index + 1;
}

/** Classify the line at `index` and return the index of the next line to scan. */
function scanLine(state: ScanState, index: number): number {
  const raw = state.lines[index] ?? '';
  if (isDiffHeader(raw)) {
    return startGitFile(state, index, false);
  }
  if (isCombinedHeader(raw)) {
    return startGitFile(state, index, true);
  }
  if (state.current?.binaryMode === true) {
    addClass(state, index, 'binaryPayload');
    return index + 1;
  }
  if (isHeaderPair(state.lines, index)) {
    markPair(state, index);
    return index + 2;
  }
  if (state.current !== null) {
    return scanFileLine(state, state.current, index, raw);
  }
  return preambleLine(state, index, raw);
}

function addPathWarnings(state: ScanState): void {
  const pathCounts = new Map<string, number>();
  for (const file of state.files) {
    const count = (pathCounts.get(file.displayPath) ?? 0) + 1;
    pathCounts.set(file.displayPath, count);
    const site = { file, srcLine: null, sample: file.displayPath };
    if (count > 1) {
      addWarning(state, WARNINGS.duplicatePath, site);
    }
    if (file.hunks.some((hunk) => hunk.meta.includes('no-hunks'))) {
      addWarning(state, WARNINGS.noHunks, site);
    }
  }
}

function finishScan(state: ScanState, text: string, sourceBytes: number): ParseResult {
  finishCurrent(state);
  if (state.files.length === 0) {
    return classifyNoDiff(text, state.lines, state.sawCommitHeader);
  }
  if (state.files.length > state.limits.maxFiles) {
    return tooLargeResult(state.files.length, state.limits.maxFiles, 'files');
  }
  assignIdentities(state.files);
  addPathWarnings(state);
  const files = state.files.map(toFile);
  const fingerprint = fingerprintForText(canonicalText(state.files));
  const warnings = toWarnings(state.warnings);
  const stats = {
    inputBytes: sourceBytes,
    totalLines: state.lines.length,
    lineClasses: state.lineClasses,
    orphanLines: state.orphanLines,
    warningsDropped: state.warningsDropped,
    workUnits: state.workUnits,
  };
  return { ok: true, fingerprint, files, warnings, stats };
}

export function parsePrepared(
  prepared: PreparedText,
  sourceBytes: number,
  limits: ParserLimits,
): ParseResult {
  const state = createScanState(prepared, limits);
  addPipelineWarnings(state, prepared.warnings);
  let index = 0;
  while (index < state.lines.length) {
    index = scanLine(state, index);
  }
  return finishScan(state, prepared.text, sourceBytes);
}
