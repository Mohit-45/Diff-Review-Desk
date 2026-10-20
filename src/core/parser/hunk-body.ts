import { hunkHash } from '../hash';
import {
  cleanHeaderLine,
  isBodyLike,
  isHeaderPair,
  isMailSignature,
  type HunkHeader,
} from './line-tests';
import {
  addClass,
  type MutableFile,
  type MutableHunk,
  type MutableLine,
  type ScanState,
} from './scan-state';
import { addWarning, siteAt, WARNINGS, type WarningSite, type WarningSpec } from './warnings';

type HunkCursor = {
  oldRemaining: number;
  newRemaining: number;
  oldCursor: number;
  newCursor: number;
  foundOld: number;
  foundNew: number;
};

type HunkBody = {
  readonly lines: MutableLine[];
  readonly cursor: HunkCursor;
  countMismatch: boolean;
  nextIndex: number;
};

function lineForHunk(raw: string, state: ScanState, lineIndex: number): MutableLine | null {
  if (raw === '') {
    return {
      kind: 'context',
      text: '',
      oldNo: null,
      newNo: null,
      suspect: state.suspiciousLines.has(lineIndex) ? true : undefined,
    };
  }
  const marker = raw[0];
  if (marker !== ' ' && marker !== '+' && marker !== '-') {
    return null;
  }
  const content = raw.slice(1);
  const hasCr = content.endsWith('\r');
  const text = hasCr ? content.slice(0, -1) : content;
  return {
    kind: marker === '+' ? 'add' : marker === '-' ? 'remove' : 'context',
    text,
    oldNo: null,
    newNo: null,
    cr: hasCr ? true : undefined,
    suspect:
      state.suspiciousLines.has(lineIndex) || state.nulLines.has(lineIndex) ? true : undefined,
  };
}

/** True when a line of this kind sits beyond what the header declared for the side(s) it touches. */
function exceedsCounts(kind: MutableLine['kind'], oldBefore: number, newBefore: number): boolean {
  if (oldBefore === 0 && newBefore === 0) {
    return true;
  }
  if (kind === 'context') {
    return oldBefore === 0 || newBefore === 0;
  }
  return kind === 'remove' ? oldBefore === 0 : newBefore === 0;
}

/** Number the line from the remaining counts, advance the cursor, and report an overrun. */
function takeLine(cursor: HunkCursor, line: MutableLine): boolean {
  const oldBefore = cursor.oldRemaining;
  const newBefore = cursor.newRemaining;
  const touchesOld = line.kind !== 'add';
  const touchesNew = line.kind !== 'remove';
  if (touchesOld) {
    line.oldNo = oldBefore > 0 ? cursor.oldCursor : null;
  }
  if (touchesNew) {
    line.newNo = newBefore > 0 ? cursor.newCursor : null;
  }
  if (touchesOld && oldBefore > 0) {
    cursor.oldRemaining -= 1;
    cursor.oldCursor += 1;
    cursor.foundOld += 1;
  }
  if (touchesNew && newBefore > 0) {
    cursor.newRemaining -= 1;
    cursor.newCursor += 1;
    cursor.foundNew += 1;
  }
  return exceedsCounts(line.kind, oldBefore, newBefore);
}

function continuesHunk(
  state: ScanState,
  lineIndex: number,
  raw: string,
  cursor: HunkCursor,
): boolean {
  if (isHeaderPair(state.lines, lineIndex) || isMailSignature(state.lines, lineIndex)) {
    return false;
  }
  return isBodyLike(raw) || (raw === '' && cursor.oldRemaining > 0 && cursor.newRemaining > 0);
}

function markNoEol(
  state: ScanState,
  file: MutableFile,
  lines: readonly MutableLine[],
  lineIndex: number,
): void {
  const previous = lines.at(-1);
  if (previous !== undefined) {
    previous.noEol = true;
    return;
  }
  state.orphanLines += 1;
  addWarning(state, WARNINGS.orphanNoEol, siteAt(file, lineIndex, state.lines[lineIndex] ?? ''));
}

function readHunkBody(
  state: ScanState,
  file: MutableFile,
  start: number,
  header: HunkHeader,
): HunkBody {
  const body: HunkBody = {
    lines: [],
    cursor: {
      oldRemaining: header.oldCount,
      newRemaining: header.newCount,
      oldCursor: header.oldStart,
      newCursor: header.newStart,
      foundOld: 0,
      foundNew: 0,
    },
    countMismatch: false,
    nextIndex: start,
  };
  while (body.nextIndex < state.lines.length) {
    const lineIndex = body.nextIndex;
    const raw = state.lines[lineIndex] ?? '';
    if (!continuesHunk(state, lineIndex, raw, body.cursor)) {
      break;
    }
    addClass(state, lineIndex, 'hunkBody');
    if (raw.startsWith('\\')) {
      markNoEol(state, file, body.lines, lineIndex);
      body.nextIndex += 1;
      continue;
    }
    const line = lineForHunk(raw, state, lineIndex);
    if (line === null) {
      break;
    }
    if (state.suspiciousLines.has(lineIndex)) {
      addWarning(state, WARNINGS.suspiciousChars, siteAt(file, lineIndex, raw));
    }
    if (takeLine(body.cursor, line)) {
      body.countMismatch = true;
    }
    body.lines.push(line);
    body.nextIndex += 1;
  }
  return body;
}

function truncatedWarning(header: HunkHeader, cursor: HunkCursor): WarningSpec {
  const expected = `${String(header.oldCount)}/${String(header.newCount)}`;
  const found = `${String(cursor.foundOld)}/${String(cursor.foundNew)}`;
  return { code: 'hunk-truncated', level: 'warn', message: `expected ${expected}, found ${found}` };
}

function isTruncated(cursor: HunkCursor): boolean {
  return cursor.oldRemaining > 0 || cursor.newRemaining > 0;
}

function buildTextHunk(
  file: MutableFile,
  header: HunkHeader,
  headerLine: string,
  body: HunkBody,
): MutableHunk {
  const { lines } = body;
  return {
    id: '',
    fileId: file.id,
    index: file.hunks.length,
    kind: 'text',
    meta: [],
    header: headerLine,
    section: header.section,
    oldStart: header.oldStart,
    oldCount: header.oldCount,
    newStart: header.newStart,
    newCount: header.newCount,
    lines,
    added: lines.filter((line) => line.kind === 'add').length,
    removed: lines.filter((line) => line.kind === 'remove').length,
    truncated: isTruncated(body.cursor),
    countMismatch: body.countMismatch,
    hash: hunkHash(lines),
  };
}

function warnIfOutOfOrder(
  state: ScanState,
  file: MutableFile,
  header: HunkHeader,
  site: WarningSite,
): void {
  const previous = file.hunks.at(-2);
  if (
    previous !== undefined &&
    previous.kind === 'text' &&
    (header.oldStart < previous.oldStart || header.newStart < previous.newStart)
  ) {
    addWarning(state, WARNINGS.hunksOutOfOrder, site);
  }
}

/** Parse the hunk whose header is at `index`; return the index of the first line after it. */
export function parseHunk(
  state: ScanState,
  file: MutableFile,
  index: number,
  header: HunkHeader,
): number {
  const headerLine = cleanHeaderLine(state.lines[index] ?? '');
  addClass(state, index, 'hunkHeader');
  const body = readHunkBody(state, file, index + 1, header);
  const site = siteAt(file, index, headerLine);
  const truncated = isTruncated(body.cursor);
  if (truncated) {
    addWarning(state, truncatedWarning(header, body.cursor), site);
  }
  if (body.countMismatch) {
    addWarning(state, WARNINGS.hunkCountMismatch, site);
  }
  const hunk = buildTextHunk(file, header, headerLine, body);
  file.hunks.push(hunk);
  file.added += hunk.added;
  file.removed += hunk.removed;
  file.incomplete ||= truncated || body.countMismatch;
  state.sawHunkHeader = true;
  warnIfOutOfOrder(state, file, header, site);
  return body.nextIndex;
}
