import { parseDiff } from '../core/parser/parse';
import { createReviewState } from '../core/review/reducer';
import type { DiffFile, ReviewState } from '../core/types';
import {
  MemoryStorageArea,
  createStorageAdapter,
  type ReviewStorageAdapter,
} from '../storage/adapter';

/** A two-file diff with one hunk each; `tag` changes the content and so the fingerprint. */
export function smallDiff(tag = 'one'): string {
  return [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1111111..2222222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,2 @@',
    ' const a = 1;',
    `-const b = 2;`,
    `+const b = '${tag}';`,
    'diff --git a/src/c.ts b/src/c.ts',
    'index 3333333..4444444 100644',
    '--- a/src/c.ts',
    '+++ b/src/c.ts',
    '@@ -1,2 +1,2 @@',
    ' const c = 1;',
    '-const d = 2;',
    '+const d = 3;',
    '',
  ].join('\n');
}

export function parsedFiles(text: string): { fingerprint: string; files: readonly DiffFile[] } {
  const parsed = parseDiff(text);
  if (!parsed.ok) {
    throw new Error('The fixture diff did not parse.');
  }
  return { fingerprint: parsed.fingerprint, files: parsed.files };
}

export function hunkIdsOf(files: readonly DiffFile[]): readonly string[] {
  return files.flatMap((file) => file.hunks.map((hunk) => hunk.id));
}

/** A review with its first hunk approved and the second rejected with a comment. */
export function decidedState(text: string, label = 'Fixture review'): ReviewState {
  const { fingerprint, files } = parsedFiles(text);
  const ids = hunkIdsOf(files);
  const base = createReviewState(fingerprint, ids, label);
  const [first, second] = ids;
  if (first === undefined || second === undefined) {
    throw new Error('The fixture diff needs two hunks.');
  }
  return {
    ...base,
    hunks: {
      [first]: { decision: 'approved', comment: '' },
      [second]: { decision: 'rejected', comment: 'needs a test' },
    },
  };
}

export type AdapterAreas = {
  readonly adapter: ReviewStorageAdapter;
  readonly local: MemoryStorageArea;
  readonly session: MemoryStorageArea;
};

export function memoryAreas(): AdapterAreas {
  const local = new MemoryStorageArea();
  const session = new MemoryStorageArea();
  return { adapter: createStorageAdapter({ local, session }), local, session };
}
