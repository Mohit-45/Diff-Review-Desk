import { cleanHeaderLine } from './line-tests';
import { generatedPath } from './paths';
import type { MutableFile, ScanState } from './scan-state';

export function emptyFile(pathHint = ''): MutableFile {
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

export function createFile(state: ScanState, sourceGit: boolean, pathHint = ''): MutableFile {
  const file = emptyFile(pathHint);
  file.sourceGit = sourceGit;
  state.files.push(file);
  state.current = file;
  return file;
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

export function updateFileKind(file: MutableFile): void {
  file.kind = modeType(file.newMode ?? file.oldMode);
  file.modeChanged =
    file.oldMode !== null && file.newMode !== null && file.oldMode !== file.newMode;
  file.typeChanged = file.modeChanged && modeFamily(file.oldMode) !== modeFamily(file.newMode);
  file.generated = generatedPath(file.displayPath);
}

export function setPaths(
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

export function parseMetadata(state: ScanState, file: MutableFile, index: number): void {
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
