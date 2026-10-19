import { fileIdForPath, fingerprintForText, hunkHash, hunkIdForHash } from '../hash';
import { LIMITS } from '../limits';
import type {
  DiffFile,
  DiffLine,
  Hunk,
  LineClass,
  MetaReason,
  ParseError,
  ParseResult,
  ParseWarning,
  WarningCode,
} from '../types';
import { generatedPath, parseGitHeaderPath, parseUnifiedHeaderPath } from './paths';
import {
  isBlankText,
  nulInFirstBytes,
  prepareBytes,
  prepareText,
  utf8ByteLength,
  type PipelineWarning,
} from './pipeline';

export type ParserLimitOverrides = Partial<
  Pick<
    typeof LIMITS,
    'maxInputBytes' | 'maxFiles' | 'maxTotalDiffLines' | 'maxHeaderLineChars' | 'maxWarnings'
  >
>;

export type ParseOptions = {
  readonly limits?: ParserLimitOverrides;
};

type MutableLine = {
  kind: DiffLine['kind'];
  text: string;
  oldNo: number | null;
  newNo: number | null;
  noEol?: true;
  cr?: true;
  suspect?: true;
};

type MutableHunk = {
  id: string;
  fileId: string;
  index: number;
  kind: Hunk['kind'];
  meta: MetaReason[];
  header: string | null;
  section: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: MutableLine[];
  added: number;
  removed: number;
  truncated: boolean;
  countMismatch: boolean;
  hash: string;
};

type MutableFile = {
  id: string;
  displayPath: string;
  oldPath: string | null;
  newPath: string | null;
  status: DiffFile['status'];
  similarity: number | null;
  oldMode: string | null;
  newMode: string | null;
  kind: DiffFile['kind'];
  binary: boolean;
  generated: boolean;
  hunks: MutableHunk[];
  added: number;
  removed: number;
  incomplete: boolean;
  sourceGit: boolean;
  headerPathSeen: boolean;
  renameSeen: boolean;
  copySeen: boolean;
  combined: boolean;
  modeChanged: boolean;
  typeChanged: boolean;
  binaryMode: boolean;
  unparsedRuns: string[][];
  currentUnparsed: string[];
};

type WarningRecord = {
  code: WarningCode;
  level: ParseWarning['level'];
  message: string;
  file: MutableFile | null;
  srcLine: number | null;
  count: number;
  samples: string[];
};

type ScanState = {
  readonly lines: readonly string[];
  readonly nulLines: ReadonlySet<number>;
  readonly suspiciousLines: ReadonlySet<number>;
  readonly lineClasses: Record<LineClass, number>;
  readonly warnings: WarningRecord[];
  readonly files: MutableFile[];
  readonly limits: typeof LIMITS;
  warningsDropped: number;
  orphanLines: number;
  current: MutableFile | null;
  sawCommitHeader: boolean;
  sawHunkHeader: boolean;
  sawHeaderPair: boolean;
  workUnits: number;
};

type HunkHeader = {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly section: string;
};

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

function mergeLimits(overrides: ParserLimitOverrides | undefined): typeof LIMITS {
  return { ...LIMITS, ...(overrides ?? {}) };
}

function errorResult(
  code: ParseError['code'],
  title: string,
  detail: string,
  hint: ParseError['hint'],
  suggestion: string | null,
  warnings: readonly ParseWarning[] = [],
): ParseResult {
  return { ok: false, error: { code, title, detail, hint, suggestion }, warnings };
}

function cleanHeaderLine(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function lineStarts(line: string, prefix: string): boolean {
  return cleanHeaderLine(line).startsWith(prefix);
}

function isBodyLike(line: string): boolean {
  return (
    line.length > 0 && (line[0] === ' ' || line[0] === '+' || line[0] === '-' || line[0] === '\\')
  );
}

function isDiffHeader(line: string): boolean {
  return lineStarts(line, 'diff --git ');
}

function isCombinedHeader(line: string): boolean {
  return lineStarts(line, 'diff --cc ') || lineStarts(line, 'diff --combined ');
}

function isCommitHeader(line: string): boolean {
  return (
    /^commit [0-9a-f]{40}(?:\b|$)/i.test(cleanHeaderLine(line)) ||
    /^From [0-9a-f]{40}(?: |$)/i.test(cleanHeaderLine(line)) ||
    /^commit [0-9a-f]{64}(?:\b|$)/i.test(cleanHeaderLine(line)) ||
    /^From [0-9a-f]{64}(?: |$)/i.test(cleanHeaderLine(line))
  );
}

function isMailSignature(lines: readonly string[], index: number): boolean {
  const line = cleanHeaderLine(lines[index] ?? '');
  if (line !== '-- ') {
    return false;
  }
  const next = cleanHeaderLine(lines[index + 1] ?? '');
  return index + 1 >= lines.length || /^\d+\.\d+(?:\.\d+)?/.test(next);
}

function hunkSatisfied(hunk: MutableHunk): boolean {
  return hunk.kind === 'text' && !hunk.truncated;
}

function isHeaderPair(lines: readonly string[], index: number): boolean {
  const first = cleanHeaderLine(lines[index] ?? '');
  const second = cleanHeaderLine(lines[index + 1] ?? '');
  return (
    (first.startsWith('--- ') || first.startsWith('---\t')) &&
    (second.startsWith('+++ ') || second.startsWith('+++\t'))
  );
}

function parseHunkHeader(line: string, maxLength: number): HunkHeader | null {
  const clean = cleanHeaderLine(line);
  if (clean.length > maxLength || !clean.startsWith('@@ ')) {
    return null;
  }
  const match = /^@@ -(\d{1,9})(?:,(\d{1,9}))? \+(\d{1,9})(?:,(\d{1,9}))? @@(.*)$/.exec(clean);
  if (match === null) {
    return null;
  }
  const oldStart = Number(match[1]);
  const oldCount = match[2] === undefined ? 1 : Number(match[2]);
  const newStart = Number(match[3]);
  const newCount = match[4] === undefined ? 1 : Number(match[4]);
  if (![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger)) {
    return null;
  }
  return { oldStart, oldCount, newStart, newCount, section: (match[5] ?? '').slice(0, 200) };
}

function hunkCandidate(line: string): boolean {
  return cleanHeaderLine(line).startsWith('@@');
}

function headerLineTooLong(line: string, maxLength: number): boolean {
  return (
    cleanHeaderLine(line).length > maxLength &&
    (hunkCandidate(line) ||
      lineStarts(line, 'diff ') ||
      lineStarts(line, '---') ||
      lineStarts(line, '+++'))
  );
}

function isMetadataLine(line: string): boolean {
  const clean = cleanHeaderLine(line);
  return (
    clean.startsWith('index ') ||
    clean.startsWith('old mode ') ||
    clean.startsWith('new mode ') ||
    clean.startsWith('new file mode ') ||
    clean.startsWith('deleted file mode ') ||
    clean.startsWith('similarity index ') ||
    clean.startsWith('rename from ') ||
    clean.startsWith('rename to ') ||
    clean.startsWith('copy from ') ||
    clean.startsWith('copy to ') ||
    clean.startsWith('old file mode ') ||
    clean.startsWith('new file mode ')
  );
}

function isBinaryLine(line: string): boolean {
  const clean = cleanHeaderLine(line);
  return clean.startsWith('Binary files ') || clean === 'GIT binary patch';
}

function isSeparator(line: string): boolean {
  return cleanHeaderLine(line) === '' || cleanHeaderLine(line) === '---';
}

function isLikelyTrailer(lines: readonly string[], index: number): boolean {
  const clean = cleanHeaderLine(lines[index] ?? '');
  return (
    isSeparator(clean) ||
    isMailSignature(lines, index) ||
    isCommitHeader(clean) ||
    clean.startsWith('diff --git ')
  );
}

function addClass(state: ScanState, index: number, lineClass: LineClass): void {
  state.lineClasses[lineClass] += 1;
  state.workUnits += (state.lines[index] ?? '').length + 1;
}

function warningSample(value: string): string {
  return value.slice(0, 120);
}

function addWarning(
  state: ScanState,
  code: WarningCode,
  level: ParseWarning['level'],
  message: string,
  file: MutableFile | null,
  srcLine: number | null,
  sample: string,
): void {
  const existing = state.warnings.find((warning) => warning.code === code && warning.file === file);
  if (existing !== undefined) {
    existing.count += 1;
    if (existing.samples.length < 3) {
      existing.samples.push(warningSample(sample));
    }
    return;
  }
  if (state.warnings.length >= state.limits.maxWarnings) {
    state.warningsDropped += 1;
    return;
  }
  state.warnings.push({
    code,
    level,
    message,
    file,
    srcLine,
    count: 1,
    samples: [warningSample(sample)],
  });
}

function addPipelineWarnings(state: ScanState, warnings: readonly PipelineWarning[]): void {
  for (const warning of warnings) {
    const level: ParseWarning['level'] =
      warning.code === 'crlf-normalised' ||
      warning.code === 'mixed-eol' ||
      warning.code === 'ansi-stripped' ||
      warning.code === 'fence-unwrapped'
        ? 'info'
        : 'warn';
    const message =
      warning.code === 'crlf-normalised'
        ? 'CRLF line endings were normalised.'
        : warning.code === 'mixed-eol'
          ? 'Mixed line endings were retained.'
          : warning.code === 'ansi-stripped'
            ? 'ANSI colour sequences were stripped from structural lines.'
            : warning.code === 'fence-unwrapped'
              ? 'One Markdown code fence was unwrapped.'
              : warning.code === 'nul-replaced'
                ? 'NUL characters were replaced with visible symbols.'
                : 'Invalid UTF-8 bytes were replaced with U+FFFD.';
    for (let count = 0; count < warning.count; count += 1) {
      addWarning(state, warning.code, level, message, null, null, warning.sample);
    }
  }
}

function emptyFile(pathHint = ''): MutableFile {
  return {
    id: '',
    displayPath: pathHint || 'unknown',
    oldPath: null,
    newPath: null,
    status: 'modified',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated: false,
    hunks: [],
    added: 0,
    removed: 0,
    incomplete: false,
    sourceGit: false,
    headerPathSeen: false,
    renameSeen: false,
    copySeen: false,
    combined: false,
    modeChanged: false,
    typeChanged: false,
    binaryMode: false,
    unparsedRuns: [],
    currentUnparsed: [],
  };
}

function finishUnparsed(file: MutableFile): void {
  if (file.currentUnparsed.length > 0) {
    file.unparsedRuns.push(file.currentUnparsed);
    file.currentUnparsed = [];
  }
}

function appendUnparsed(state: ScanState, file: MutableFile, index: number): void {
  const line = state.lines[index] ?? '';
  file.currentUnparsed.push(line);
  if (state.suspiciousLines.has(index)) {
    addWarning(
      state,
      'suspicious-chars',
      'warn',
      'A diff line contains hidden or control characters.',
      file,
      index + 1,
      line,
    );
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
    .slice(0, 200)
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

function modeType(mode: string | null): MutableFile['kind'] {
  if (mode?.startsWith('120000') === true) {
    return 'symlink';
  }
  if (mode?.startsWith('160000') === true) {
    return 'submodule';
  }
  if (mode?.endsWith('755') === true) {
    return 'executable';
  }
  return 'regular';
}

function modeFamily(mode: string | null): string {
  if (mode === null) {
    return '';
  }
  return mode.slice(0, 3);
}

function updateFileKind(file: MutableFile): void {
  file.kind = modeType(file.newMode ?? file.oldMode);
  file.modeChanged =
    file.oldMode !== null && file.newMode !== null && file.oldMode !== file.newMode;
  file.typeChanged = file.modeChanged && modeFamily(file.oldMode) !== modeFamily(file.newMode);
  file.generated = generatedPath(file.displayPath);
}

function setPaths(
  file: MutableFile,
  oldPath: string | null,
  newPath: string | null,
  header: boolean,
): void {
  if (header || !file.headerPathSeen) {
    file.oldPath = oldPath;
    file.newPath = newPath;
    if (header) {
      file.headerPathSeen = true;
    }
  }
  file.displayPath = newPath ?? oldPath ?? file.displayPath;
}

function parseModeLine(file: MutableFile, line: string): void {
  const clean = cleanHeaderLine(line);
  if (clean.startsWith('new file mode ')) {
    file.newMode = clean.slice('new file mode '.length);
    file.status = 'added';
  } else if (clean.startsWith('deleted file mode ')) {
    file.oldMode = clean.slice('deleted file mode '.length);
    file.status = 'deleted';
  } else if (clean.startsWith('old mode ')) {
    file.oldMode = clean.slice('old mode '.length);
  } else if (clean.startsWith('new mode ')) {
    file.newMode = clean.slice('new mode '.length);
  }
  updateFileKind(file);
}

function parseMetadata(state: ScanState, file: MutableFile, index: number): void {
  const clean = cleanHeaderLine(state.lines[index] ?? '');
  if (clean.startsWith('similarity index ')) {
    const value = Number.parseInt(clean.slice('similarity index '.length), 10);
    file.similarity = Number.isFinite(value) ? value : null;
  } else if (clean.startsWith('rename from ')) {
    file.renameSeen = true;
    if (!file.headerPathSeen) {
      const path = clean.slice('rename from '.length);
      file.oldPath = path;
      file.displayPath = file.newPath ?? path;
    }
  } else if (clean.startsWith('rename to ')) {
    file.renameSeen = true;
    if (!file.headerPathSeen) {
      const path = clean.slice('rename to '.length);
      file.newPath = path;
      file.displayPath = path;
    }
  } else if (clean.startsWith('copy from ')) {
    file.copySeen = true;
    if (!file.headerPathSeen) {
      file.oldPath = clean.slice('copy from '.length);
    }
  } else if (clean.startsWith('copy to ')) {
    file.copySeen = true;
    if (!file.headerPathSeen) {
      file.newPath = clean.slice('copy to '.length);
      file.displayPath = file.newPath;
    }
  }
  parseModeLine(file, clean);
}

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

function setLineNumbers(
  line: MutableLine,
  oldCursor: number,
  newCursor: number,
  oldRemaining: number,
  newRemaining: number,
): void {
  if (line.kind === 'context') {
    line.oldNo = oldRemaining > 0 ? oldCursor : null;
    line.newNo = newRemaining > 0 ? newCursor : null;
  } else if (line.kind === 'remove') {
    line.oldNo = oldRemaining > 0 ? oldCursor : null;
  } else {
    line.newNo = newRemaining > 0 ? newCursor : null;
  }
}

function parseHunk(state: ScanState, file: MutableFile, index: number, header: HunkHeader): number {
  const headerLine = cleanHeaderLine(state.lines[index] ?? '');
  addClass(state, index, 'hunkHeader');
  const lines: MutableLine[] = [];
  let oldRemaining = header.oldCount;
  let newRemaining = header.newCount;
  let oldCursor = header.oldStart;
  let newCursor = header.newStart;
  let foundOld = 0;
  let foundNew = 0;
  let countMismatch = false;
  let lineIndex = index + 1;
  while (lineIndex < state.lines.length) {
    const raw = state.lines[lineIndex] ?? '';
    if (isHeaderPair(state.lines, lineIndex) || isMailSignature(state.lines, lineIndex)) {
      break;
    }
    const body = isBodyLike(raw) || (raw === '' && oldRemaining > 0 && newRemaining > 0);
    if (!body) {
      break;
    }
    addClass(state, lineIndex, 'hunkBody');
    if (raw.startsWith('\\')) {
      const previous = lines.at(-1);
      if (previous !== undefined) {
        previous.noEol = true;
      } else {
        state.orphanLines += 1;
        addWarning(
          state,
          'orphan-lines',
          'warn',
          'A no-newline marker had no preceding hunk line.',
          file,
          lineIndex + 1,
          raw,
        );
      }
      lineIndex += 1;
      continue;
    }
    const line = lineForHunk(raw, state, lineIndex);
    if (line === null) {
      break;
    }
    const oldBefore = oldRemaining;
    const newBefore = newRemaining;
    if (state.suspiciousLines.has(lineIndex)) {
      addWarning(
        state,
        'suspicious-chars',
        'warn',
        'A diff line contains hidden or control characters.',
        file,
        lineIndex + 1,
        raw,
      );
    }
    setLineNumbers(line, oldCursor, newCursor, oldRemaining, newRemaining);
    if (line.kind === 'context') {
      if (oldRemaining > 0) {
        oldRemaining -= 1;
        oldCursor += 1;
        foundOld += 1;
      }
      if (newRemaining > 0) {
        newRemaining -= 1;
        newCursor += 1;
        foundNew += 1;
      }
    } else if (line.kind === 'remove') {
      if (oldRemaining > 0) {
        oldRemaining -= 1;
        oldCursor += 1;
        foundOld += 1;
      }
    } else if (newRemaining > 0) {
      newRemaining -= 1;
      newCursor += 1;
      foundNew += 1;
    }
    if (oldBefore === 0 && newBefore === 0) {
      countMismatch = true;
    } else if (
      (line.kind === 'context' && (oldBefore === 0 || newBefore === 0)) ||
      (line.kind === 'remove' && oldBefore === 0) ||
      (line.kind === 'add' && newBefore === 0)
    ) {
      countMismatch = true;
    }
    lines.push(line);
    lineIndex += 1;
  }
  const truncated = oldRemaining > 0 || newRemaining > 0;
  if (truncated) {
    addWarning(
      state,
      'hunk-truncated',
      'warn',
      `expected ${header.oldCount}/${header.newCount}, found ${foundOld}/${foundNew}`,
      file,
      index + 1,
      headerLine,
    );
  }
  if (countMismatch) {
    addWarning(
      state,
      'hunk-count-mismatch',
      'warn',
      'Hunk contains lines beyond its declared counts.',
      file,
      index + 1,
      headerLine,
    );
  }
  const hunk: MutableHunk = {
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
    truncated,
    countMismatch,
    hash: hunkHash(lines),
  };
  file.hunks.push(hunk);
  file.added += hunk.added;
  file.removed += hunk.removed;
  file.incomplete ||= truncated || countMismatch;
  state.sawHunkHeader = true;
  if (file.hunks.length > 1) {
    const previous = file.hunks[file.hunks.length - 2];
    if (
      previous !== undefined &&
      previous.kind === 'text' &&
      (header.oldStart < previous.oldStart || header.newStart < previous.newStart)
    ) {
      addWarning(
        state,
        'hunks-out-of-order',
        'warn',
        'Hunks are out of source order.',
        file,
        index + 1,
        headerLine,
      );
    }
  }
  return lineIndex;
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

function finishFile(file: MutableFile): void {
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
  file.status = file.renameSeen ? 'renamed' : file.copySeen ? 'copied' : file.status;
  if (file.oldPath === null && file.newPath !== null) {
    file.status = 'added';
  } else if (file.newPath === null && file.oldPath !== null) {
    file.status = 'deleted';
  }
  file.generated = generatedPath(file.displayPath);
}

function createFile(state: ScanState, sourceGit: boolean, pathHint = ''): MutableFile {
  const file = emptyFile(pathHint);
  file.sourceGit = sourceGit;
  state.files.push(file);
  state.current = file;
  return file;
}

function markPair(state: ScanState, index: number): void {
  const first = cleanHeaderLine(state.lines[index] ?? '').slice(4);
  const second = cleanHeaderLine(state.lines[index + 1] ?? '').slice(4);
  let file = state.current;
  if (file === null || file.hunks.length > 0 || file.binary || file.headerPathSeen) {
    if (file !== null) {
      finishFile(file);
    }
    file = createFile(state, false);
  }
  const old = parseUnifiedHeaderPath(first, file.sourceGit ? 'a/' : null);
  const next = parseUnifiedHeaderPath(second, file.sourceGit ? 'b/' : null);
  setPaths(file, old.path, next.path, true);
  updateFileKind(file);
  if (old.failed || next.failed) {
    addWarning(
      state,
      'path-encoding',
      'warn',
      'A file path could not be decoded as UTF-8.',
      file,
      index + 1,
      state.lines[index] ?? '',
    );
  }
  if (
    cleanHeaderLine(state.lines[index] ?? '').length > state.limits.maxHeaderLineChars ||
    cleanHeaderLine(state.lines[index + 1] ?? '').length > state.limits.maxHeaderLineChars
  ) {
    addWarning(
      state,
      'file-header-truncated',
      'warn',
      'A file header exceeded the header line limit.',
      file,
      index + 1,
      state.lines[index] ?? '',
    );
  }
  addClass(state, index, 'fileHeader');
  addClass(state, index + 1, 'fileHeader');
  state.sawHeaderPair = true;
}

function processDiffHeader(state: ScanState, index: number, combined: boolean): void {
  const raw = cleanHeaderLine(state.lines[index] ?? '');
  const file = createFile(state, true);
  file.combined = combined;
  file.binary = false;
  file.binaryMode = combined;
  const prefix = raw.startsWith('diff --cc ')
    ? 'diff --cc '
    : raw.startsWith('diff --combined ')
      ? 'diff --combined '
      : 'diff --git ';
  const payload = raw.slice(prefix.length);
  const paths = parseGitHeaderPath(payload);
  setPaths(file, paths.oldPath, paths.newPath, false);
  if (paths.ambiguous) {
    addWarning(
      state,
      'ambiguous-path',
      'warn',
      'The Git file header had ambiguous path separators.',
      file,
      index + 1,
      raw,
    );
  }
  if (paths.encodingFailed) {
    addWarning(
      state,
      'path-encoding',
      'warn',
      'A file path could not be decoded as UTF-8.',
      file,
      index + 1,
      raw,
    );
  }
  if (raw.length > state.limits.maxHeaderLineChars) {
    addWarning(
      state,
      'file-header-truncated',
      'warn',
      'A file header exceeded the header line limit.',
      file,
      index + 1,
      raw,
    );
  }
  if (combined) {
    addWarning(
      state,
      'combined-unsupported',
      'warn',
      'Combined diffs are shown as one metadata hunk.',
      file,
      index + 1,
      raw,
    );
  }
  addClass(state, index, 'fileHeader');
}

function finishCurrent(state: ScanState): void {
  if (state.current !== null) {
    finishFile(state.current);
  }
}

function assignIdentities(files: readonly MutableFile[]): void {
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
  const oldCount = hunk.oldCount === 1 ? '' : `,${hunk.oldCount}`;
  const newCount = hunk.newCount === 1 ? '' : `,${hunk.newCount}`;
  return `@@ -${hunk.oldStart}${oldCount} +${hunk.newStart}${newCount} @@${hunk.section}`;
}

function canonicalFileLines(file: MutableFile): string[] {
  const lines: string[] = [];
  lines.push(`--- ${file.oldPath ?? '/dev/null'}`);
  lines.push(`+++ ${file.newPath ?? '/dev/null'}`);
  if (file.oldMode !== null || file.newMode !== null) {
    if (file.oldMode !== null) {
      lines.push(`old mode ${file.oldMode}`);
    }
    if (file.newMode !== null) {
      lines.push(`new mode ${file.newMode}`);
    }
  }
  if (file.similarity !== null) {
    lines.push(`similarity index ${file.similarity}%`);
  }
  if (file.renameSeen) {
    lines.push(`rename from ${file.oldPath ?? ''}`);
    lines.push(`rename to ${file.newPath ?? ''}`);
  } else if (file.copySeen) {
    lines.push(`copy from ${file.oldPath ?? ''}`);
    lines.push(`copy to ${file.newPath ?? ''}`);
  }
  if (file.combined) {
    lines.push('combined');
  } else if (file.binary) {
    lines.push('binary');
  }
  for (const hunk of file.hunks) {
    if (hunk.kind === 'text') {
      lines.push(canonicalHunkHeader(hunk));
      for (const line of hunk.lines) {
        const marker = line.kind === 'context' ? ' ' : line.kind === 'add' ? '+' : '-';
        lines.push(`${marker}${line.text}${line.cr ? '\r' : ''}`);
        if (line.noEol) {
          lines.push('\\ No newline at end of file');
        }
      }
    } else {
      lines.push(`meta ${hunk.meta.join(',')}`);
      for (const line of hunk.lines) {
        lines.push(line.text);
      }
    }
  }
  return lines;
}

function canonicalText(files: readonly MutableFile[]): string {
  const lines: string[] = [];
  for (const file of files) {
    lines.push(...canonicalFileLines(file));
  }
  return lines.join('\n');
}

function toWarnings(records: readonly WarningRecord[]): ParseWarning[] {
  return records.map((warning) => ({
    code: warning.code,
    level: warning.level,
    message: warning.message,
    fileId: warning.file?.id ?? null,
    srcLine: warning.srcLine,
    count: warning.count,
    samples: warning.samples,
  }));
}

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

function toFile(file: MutableFile): DiffFile {
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

function firstNonWhitespace(text: string): string {
  for (let index = 0; index < text.length; index += 1) {
    const value = text[index] ?? '';
    if (
      value !== ' ' &&
      value !== '\t' &&
      value !== '\r' &&
      value !== '\n' &&
      value !== '\u00a0' &&
      value !== '\ufeff'
    ) {
      return value;
    }
  }
  return '';
}

function classifyNoDiff(
  text: string,
  lines: readonly string[],
  sawCommitHeader: boolean,
): ParseResult {
  if (sawCommitHeader) {
    return errorResult(
      'not-a-diff',
      'This does not look like a diff',
      'Commit headers were found but no file changes. Merge commits show no diff by default; use `git show -m <sha>` or `git diff <base>...<head>`.',
      'generic',
      'Run `git show -m <sha>` or `git diff <base>...<head>`.',
    );
  }
  const first = firstNonWhitespace(text);
  if (first === '<' || first === '{' || first === '[') {
    return errorResult(
      'not-a-diff',
      'This does not look like a diff',
      'This looks like a web page or API response, not a unified diff.',
      'web-page',
      'Open the pull request, append `.diff` to its URL, or run `gh pr diff <number>`.',
    );
  }
  if (
    lines.some((line) => line.startsWith('*** Begin Patch') || line.startsWith('*** End Patch'))
  ) {
    return errorResult(
      'not-a-diff',
      'This does not look like a diff',
      'This looks like another patch format, not a unified diff.',
      'other-format',
      'Run `git diff HEAD` or `diff -u`.',
    );
  }
  if (lines.some((line) => /^\*\*\* [0-9]/.test(line))) {
    return errorResult(
      'not-a-diff',
      'This does not look like a diff',
      'This looks like a context diff, not a unified diff.',
      'other-format',
      'Run `git diff HEAD` or `diff -u`.',
    );
  }
  const summary = lines.find((line) =>
    /^--(?:stat|numstat|name-only|name-status|raw)(?:\s|$)/.test(cleanHeaderLine(line)),
  );
  if (summary !== undefined) {
    return errorResult(
      'not-a-diff',
      'This is a summary and has no changed lines.',
      'Summary output has no changed lines to review.',
      'summary',
      'Re-run without the summary option.',
    );
  }
  let special = false;
  let nonEmpty = 0;
  let withoutMarker = 0;
  for (const line of lines.slice(0, 300)) {
    const clean = cleanHeaderLine(line);
    if (clean === '~' || clean.includes('[-') || clean.includes('{+')) {
      special = true;
    }
    if (clean.length > 0) {
      nonEmpty += 1;
      if (!isBodyLike(clean)) {
        withoutMarker += 1;
      }
    }
  }
  if (special && nonEmpty > 0 && withoutMarker * 2 >= nonEmpty) {
    return errorResult(
      'word-diff',
      'This is a word diff',
      'Re-run without `--word-diff` or `--color-words`.',
      'other-format',
      'Re-run without `--word-diff` or `--color-words`.',
    );
  }
  return errorResult(
    'not-a-diff',
    'This does not look like a diff',
    'No file or hunk headers were found.',
    'generic',
    'Run `git diff HEAD`.',
  );
}

function parseOptions(options: ParseOptions | undefined): typeof LIMITS {
  return mergeLimits(options?.limits);
}

function tooLargeResult(observed: number, limit: number, unit: string): ParseResult {
  const code: ParseError['code'] =
    unit === 'bytes' ? 'too-large' : unit === 'files' ? 'too-many-files' : 'too-many-lines';
  return errorResult(
    code,
    'Diff is too large',
    `Observed ${observed} ${unit}; the limit is ${limit}.`,
    'generic',
    'Run `git diff -- src/` or load a smaller diff.',
  );
}

function parsePrepared(
  prepared: ReturnType<typeof prepareText>,
  sourceBytes: number,
  limits: typeof LIMITS,
): ParseResult {
  const lines = prepared.lines;
  const state: ScanState = {
    lines,
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
  addPipelineWarnings(state, prepared.warnings);
  let index = 0;
  while (index < lines.length) {
    const raw = lines[index] ?? '';
    const clean = cleanHeaderLine(raw);
    if (isDiffHeader(raw)) {
      finishCurrent(state);
      state.current = null;
      processDiffHeader(state, index, false);
      index += 1;
      continue;
    }
    if (isCombinedHeader(raw)) {
      finishCurrent(state);
      state.current = null;
      processDiffHeader(state, index, true);
      index += 1;
      continue;
    }
    if (state.current?.binaryMode === true) {
      addClass(state, index, 'binaryPayload');
      index += 1;
      continue;
    }
    if (isHeaderPair(lines, index)) {
      markPair(state, index);
      index += 2;
      continue;
    }
    if (state.current !== null) {
      const header = parseHunkHeader(raw, limits.maxHeaderLineChars);
      if (header !== null) {
        finishUnparsed(state.current);
        index = parseHunk(state, state.current, index, header);
        continue;
      }
      if (hunkCandidate(raw)) {
        appendUnparsed(state, state.current, index);
        addWarning(
          state,
          'bad-hunk-header',
          'warn',
          'A hunk header could not be parsed.',
          state.current,
          index + 1,
          raw,
        );
        index += 1;
        continue;
      }
      if (isBinaryLine(raw)) {
        finishUnparsed(state.current);
        state.current.binary = true;
        state.current.binaryMode = true;
        addClass(state, index, 'binaryPayload');
        index += 1;
        continue;
      }
      if (isMetadataLine(raw)) {
        finishUnparsed(state.current);
        parseMetadata(state, state.current, index);
        if (headerLineTooLong(raw, limits.maxHeaderLineChars)) {
          addWarning(
            state,
            'file-header-truncated',
            'warn',
            'A file header exceeded the header line limit.',
            state.current,
            index + 1,
            raw,
          );
        }
        addClass(state, index, 'fileHeader');
        index += 1;
        continue;
      }
      if (
        isMailSignature(lines, index) ||
        (state.current.hunks.length > 0 && isLikelyTrailer(lines, index))
      ) {
        finishUnparsed(state.current);
        addClass(state, index, isSeparator(raw) ? 'separator' : 'trailer');
        addWarning(
          state,
          'trailer-ignored',
          'info',
          'Trailing non-diff text was ignored.',
          state.current,
          index + 1,
          raw,
        );
        index += 1;
        continue;
      }
      const lastHunk = state.current.hunks.at(-1);
      if (lastHunk !== undefined && hunkSatisfied(lastHunk) && !isBodyLike(raw)) {
        finishUnparsed(state.current);
        addClass(state, index, 'trailer');
        addWarning(
          state,
          'trailer-ignored',
          'info',
          'Trailing non-diff text was ignored.',
          state.current,
          index + 1,
          raw,
        );
        index += 1;
        continue;
      }
      appendUnparsed(state, state.current, index);
      addWarning(
        state,
        'unknown-lines',
        'warn',
        'Lines could not be attributed to a diff hunk.',
        state.current,
        index + 1,
        raw,
      );
      index += 1;
      continue;
    }
    if (isCommitHeader(clean)) {
      state.sawCommitHeader = true;
    }
    addClass(state, index, isSeparator(raw) ? 'separator' : 'preamble');
    addWarning(
      state,
      'preamble-ignored',
      'info',
      'Preamble text before the first file was ignored.',
      null,
      index + 1,
      raw,
    );
    index += 1;
  }
  finishCurrent(state);
  if (state.files.length === 0) {
    return classifyNoDiff(prepared.text, lines, state.sawCommitHeader);
  }
  if (state.files.length > limits.maxFiles) {
    return tooLargeResult(state.files.length, limits.maxFiles, 'files');
  }
  assignIdentities(state.files);
  const pathCounts = new Map<string, number>();
  for (const file of state.files) {
    const count = (pathCounts.get(file.displayPath) ?? 0) + 1;
    pathCounts.set(file.displayPath, count);
    if (count > 1) {
      addWarning(
        state,
        'duplicate-path',
        'info',
        'The same path appears more than once in this diff.',
        file,
        null,
        file.displayPath,
      );
    }
    if (file.hunks.some((hunk) => hunk.meta.includes('no-hunks'))) {
      addWarning(
        state,
        'no-hunks',
        'info',
        'The file has no text hunks.',
        file,
        null,
        file.displayPath,
      );
    }
  }
  const files = state.files.map(toFile);
  const canonical = canonicalText(state.files);
  const fingerprint = fingerprintForText(canonical);
  const warningValues = toWarnings(state.warnings);
  const stats = {
    inputBytes: sourceBytes,
    totalLines: lines.length,
    lineClasses: state.lineClasses,
    orphanLines: state.orphanLines,
    warningsDropped: state.warningsDropped,
    workUnits: state.workUnits,
  };
  return { ok: true, fingerprint, files, warnings: warningValues, stats };
}

function parseString(text: string, options: ParseOptions | undefined): ParseResult {
  const limits = parseOptions(options);
  if (text.startsWith('\ufeff')) {
    text = text.slice(1);
  }
  const bytes = utf8ByteLength(text);
  if (bytes > limits.maxInputBytes) {
    return tooLargeResult(bytes, limits.maxInputBytes, 'bytes');
  }
  if (nulInFirstBytes(text)) {
    return errorResult(
      'binary-input',
      'This looks like a binary file, not text.',
      'A NUL byte appeared near the start of the input.',
      null,
      'Provide a text unified diff.',
    );
  }
  if (isBlankText(text)) {
    return errorResult(
      'empty',
      'Nothing to review',
      'The input is empty or contains only whitespace.',
      null,
      'Paste or drop a unified diff.',
    );
  }
  const prepared = prepareText(text, 0);
  if (prepared.lines.length > limits.maxTotalDiffLines) {
    return tooLargeResult(prepared.lines.length, limits.maxTotalDiffLines, 'lines');
  }
  return parsePrepared(prepared, bytes, limits);
}

function parseByteInput(bytes: Uint8Array, options: ParseOptions | undefined): ParseResult {
  const limits = parseOptions(options);
  if (bytes.byteLength > limits.maxInputBytes) {
    return tooLargeResult(bytes.byteLength, limits.maxInputBytes, 'bytes');
  }
  const decoded = prepareBytes(bytes);
  if (decoded.utf16) {
    return errorResult(
      'not-a-diff',
      'This does not look like a diff',
      'PowerShell `>` writes UTF-16. Re-run with `| Out-File -Encoding utf8`, or paste the text.',
      'utf16',
      'Re-run with `| Out-File -Encoding utf8`, or paste the text.',
    );
  }
  if (bytes.slice(0, 8_000).includes(0)) {
    return errorResult(
      'binary-input',
      'This looks like a binary file, not text.',
      'A NUL byte appeared near the start of the input.',
      null,
      'Provide a text unified diff.',
    );
  }
  let text = decoded.decoded.text;
  if (text.startsWith('\ufeff')) {
    text = text.slice(1);
  }
  if (isBlankText(text)) {
    return errorResult(
      'empty',
      'Nothing to review',
      'The input is empty or contains only whitespace.',
      null,
      'Paste or drop a unified diff.',
    );
  }
  const prepared = prepareText(text, decoded.decoded.invalid);
  if (prepared.lines.length > limits.maxTotalDiffLines) {
    return tooLargeResult(prepared.lines.length, limits.maxTotalDiffLines, 'lines');
  }
  return parsePrepared(prepared, bytes.byteLength, limits);
}

export function parseDiff(text: string, options?: ParseOptions): ParseResult;
export function parseDiff(bytes: Uint8Array, options?: ParseOptions): ParseResult;
export function parseDiff(input: string | Uint8Array, options?: ParseOptions): ParseResult {
  try {
    return typeof input === 'string' ? parseString(input, options) : parseByteInput(input, options);
  } catch {
    return errorResult(
      'internal',
      'Unexpected parser error',
      'Unexpected parser error. Nothing left your browser; copy the diff and report the problem.',
      null,
      'Copy the diff and report the problem.',
    );
  }
}

export const parseUnifiedDiff = parseDiff;
