import type { DiffFile, DiffLine, Hunk } from '../types';

/** A modified file whose only hunk adds `added` lines, for rule and scanner tests. */
export function fileWithAddedLines(path: string, added: readonly string[]): DiffFile {
  const id = `f-${path}`;
  const lines: DiffLine[] = added.map((text, index) => ({
    kind: 'add',
    text,
    oldNo: null,
    newNo: index + 1,
  }));
  const hunk: Hunk = {
    id: `${id}:hunk`,
    fileId: id,
    index: 0,
    kind: 'text',
    meta: [],
    header: '@@ -0,0 +1 @@',
    section: '',
    oldStart: 0,
    oldCount: 0,
    newStart: 1,
    newCount: added.length,
    lines,
    added: added.length,
    removed: 0,
    truncated: false,
    countMismatch: false,
    hash: 'hash',
  };
  return {
    id,
    displayPath: path,
    oldPath: path,
    newPath: path,
    status: 'modified',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated: false,
    hunks: [hunk],
    added: added.length,
    removed: 0,
    incomplete: false,
  };
}
