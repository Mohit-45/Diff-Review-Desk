import { describe, expect, it } from 'vitest';
import type {
  DiffFile,
  ParseError,
  ParseResult,
  ParseWarning,
  Result,
  ReviewState,
  StoredReview,
} from '../core/types';
import {
  MemoryStorageArea,
  createStorageAdapter,
  type ReviewStorageAdapter,
} from '../storage/adapter';
import { open, openDiff, restore, restoreReview, type DiffParser } from './open';

const first = 'f00000000001:00000000001';
const second = 'f00000000001:00000000002';
const third = 'f00000000002:00000000003';
const fingerprint = '00000000001';
const otherFingerprint = '00000000002';

function fileOf(path: string, ids: readonly string[]): DiffFile {
  return {
    id: 'f00000000001',
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
    hunks: ids.map((id, index) => ({
      id,
      fileId: 'f00000000001',
      index,
      kind: 'text' as const,
      meta: [],
      header: '@@ -1 +1 @@',
      section: '',
      oldStart: 1,
      oldCount: 1,
      newStart: 1,
      newCount: 1,
      lines: [],
      added: 1,
      removed: 0,
      truncated: false,
      countMismatch: false,
      hash: '00000000001',
    })),
    added: ids.length,
    removed: 0,
    incomplete: false,
  };
}

function parseOk(
  key: string,
  files: readonly DiffFile[],
  warnings: readonly ParseWarning[] = [],
): ParseResult {
  return {
    ok: true,
    fingerprint: key,
    files,
    warnings,
    stats: {
      inputBytes: 1,
      totalLines: 1,
      lineClasses: {
        preamble: 0,
        fileHeader: 0,
        hunkHeader: 1,
        hunkBody: 0,
        separator: 0,
        trailer: 0,
        binaryPayload: 0,
        unknown: 0,
      },
      orphanLines: 0,
      warningsDropped: 0,
      workUnits: 1,
    },
  };
}

function parserFor(key: string, files: readonly DiffFile[]): DiffParser {
  return () => parseOk(key, files);
}

const singleFile = [fileOf('src/a.ts', [first, second])];

function reviewState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    fingerprint,
    round: 1,
    label: 'Earlier label',
    overallNote: 'earlier note',
    hunks: {
      [first]: { decision: 'approved', comment: '' },
      [second]: { decision: 'rejected', comment: 'why' },
    },
    hunkIds: [first, second],
    prior: null,
    ...overrides,
  };
}

function storedReview(overrides: Partial<StoredReview> = {}): StoredReview {
  return {
    schemaVersion: 1,
    hashVersion: 1,
    updatedAt: '2026-10-19T00:00:00.000Z',
    fingerprint,
    round: 3,
    label: 'Stored label',
    overallNote: 'stored note',
    decisions: {
      [first]: { decision: 'approved', comment: '' },
      [second]: { decision: null, comment: 'comment only' },
    },
    hunkIds: [first, second],
    prior: null,
    ...overrides,
  };
}

function persistentAdapter(): ReviewStorageAdapter {
  return createStorageAdapter({ local: new MemoryStorageArea(), session: new MemoryStorageArea() });
}

function expectOk<T>(result: Result<T, unknown>): T {
  if (!result.ok) {
    throw new Error('Expected a successful result.');
  }
  return result.value;
}

describe('openDiff labels', () => {
  it('labels a one-file diff with its path', () => {
    const value = expectOk(openDiff('text', { parser: parserFor(fingerprint, singleFile) }));
    expect(value.state.label).toBe('src/a.ts');
    expect(value.outcome).toBe('new');
    expect(value.carryOver).toBeNull();
  });

  it('labels a multi-file diff with the first path and a count', () => {
    const files = [fileOf('src/a.ts', [first]), fileOf('b.ts', [second]), fileOf('c.ts', [third])];
    const value = expectOk(openDiff('text', { parser: parserFor(fingerprint, files) }));
    expect(value.state.label).toBe('src/a.ts and 2 more');
    const two = expectOk(openDiff('text', { parser: parserFor(fingerprint, files.slice(0, 2)) }));
    expect(two.state.label).toBe('src/a.ts and 1 more');
  });

  it('labels a diff with no files from the sample title or a default', () => {
    const empty = parserFor(fingerprint, []);
    expect(expectOk(openDiff('text', { parser: empty })).state.label).toBe('Pasted diff');
    expect(
      expectOk(openDiff('text', { parser: empty, sampleTitle: 'Sample run' })).state.label,
    ).toBe('Sample run');
    expect(
      expectOk(openDiff('text', { parser: parserFor(fingerprint, singleFile), sampleTitle: 'x' }))
        .state.label,
    ).toBe('src/a.ts');
  });

  it('lets an explicit label win for a new review', () => {
    const parser = parserFor(otherFingerprint, singleFile);
    expect(expectOk(openDiff('text', { parser, label: 'Chosen' })).state.label).toBe('Chosen');
    const withCurrent = expectOk(
      openDiff('text', { parser, current: reviewState(), choice: 'new', label: 'Chosen' }),
    );
    expect(withCurrent.state.label).toBe('Chosen');
  });

  it('carries the earlier review label over, with or without an explicit label', () => {
    const carried = expectOk(
      openDiff('text', {
        parser: parserFor(otherFingerprint, singleFile),
        current: reviewState(),
        choice: 'carry-over',
      }),
    );
    expect(carried.state.label).toBe('Earlier label');
    expect(carried.outcome).toBe('carry-over');
    expect(carried.state.round).toBe(2);
    const labelled = expectOk(
      openDiff('text', {
        parser: parserFor(otherFingerprint, singleFile),
        current: reviewState(),
        choice: 'carry-over',
        label: 'Chosen',
      }),
    );
    expect(labelled.state.label).toBe('Earlier label');
  });

  it('uses the new path label for a fresh review even with a current review open', () => {
    const fresh = expectOk(
      openDiff('text', {
        parser: parserFor(otherFingerprint, singleFile),
        current: reviewState(),
        choice: 'new',
      }),
    );
    expect(fresh.state.label).toBe('src/a.ts');
    expect(fresh.outcome).toBe('new');
    expect(fresh.state.round).toBe(1);
    expect(fresh.state.hunkIds).toEqual([first, second]);
    const unset = expectOk(
      openDiff('text', { parser: parserFor(otherFingerprint, singleFile), current: reviewState() }),
    );
    expect(unset.outcome).toBe('new');
  });
});

describe('openDiff outcomes', () => {
  it('returns the open review itself when the fingerprint is unchanged', () => {
    const current = reviewState();
    const value = expectOk(
      openDiff('text', {
        parser: parserFor(fingerprint, singleFile),
        current,
        stored: storedReview(),
        choice: 'carry-over',
      }),
    );
    expect(value.outcome).toBe('same-open');
    expect(value.state).toBe(current);
    expect(value.carryOver).toBeNull();
  });

  it('restores a stored review for the same fingerprint over a carry-over choice', () => {
    const value = expectOk(
      openDiff('text', {
        parser: parserFor(fingerprint, singleFile),
        current: reviewState({ fingerprint: otherFingerprint }),
        stored: storedReview(),
        choice: 'carry-over',
      }),
    );
    expect(value.outcome).toBe('restored');
    expect(value.carryOver).toBeNull();
    expect(value.state).toEqual({
      fingerprint,
      round: 3,
      label: 'Stored label',
      overallNote: 'stored note',
      hunks: {
        [first]: { decision: 'approved', comment: '' },
        [second]: { decision: null, comment: 'comment only' },
      },
      hunkIds: [first, second],
      prior: null,
    });
    expect(Object.getPrototypeOf(value.state.hunks)).toBeNull();
  });

  it('restores only decisions whose ids are in both the stored and the current diff', () => {
    const stored = storedReview({
      hunkIds: [first, second, 'f00000000009:00000000009'],
      decisions: {
        [first]: { decision: 'approved', comment: '' },
        [second]: { decision: null, comment: '' },
        [third]: { decision: 'rejected', comment: 'not in stored hunk ids' },
        'f00000000009:00000000009': { decision: 'rejected', comment: 'gone' },
      },
    });
    const value = expectOk(
      openDiff('text', {
        parser: parserFor(fingerprint, [fileOf('src/a.ts', [first, second, third])]),
        stored,
      }),
    );
    expect(Object.keys(value.state.hunks)).toEqual([first]);
    expect(value.state.hunkIds).toEqual([first, second, third]);
  });

  it('ignores a stored review for a different fingerprint', () => {
    const value = expectOk(
      openDiff('text', {
        parser: parserFor(otherFingerprint, singleFile),
        stored: storedReview(),
      }),
    );
    expect(value.outcome).toBe('new');
  });

  it('carries decisions over when a different diff is opened with the carry-over choice', () => {
    const value = expectOk(
      openDiff('text', {
        parser: parserFor(otherFingerprint, [fileOf('src/a.ts', [first, third])]),
        current: reviewState(),
        choice: 'carry-over',
      }),
    );
    expect(value.outcome).toBe('carry-over');
    expect(value.carryOver?.carried).toEqual({ [first]: 'approved' });
    expect(value.carryOver?.goneCount).toBe(1);
    expect(value.state.hunks[first]?.decision).toBe('approved');
    expect(value.state.prior?.round).toBe(1);
  });

  it('opens a new review when carry-over is chosen without a current review', () => {
    const value = expectOk(
      openDiff('text', {
        parser: parserFor(otherFingerprint, singleFile),
        current: null,
        choice: 'carry-over',
      }),
    );
    expect(value.outcome).toBe('new');
  });
});

describe('openDiff failures and warnings', () => {
  it('returns decode failures untouched and never calls the parser', () => {
    let calls = 0;
    const result = openDiff('   ', {
      parser: () => {
        calls += 1;
        return parseOk(fingerprint, singleFile);
      },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'empty' } });
    expect(calls).toBe(0);
  });

  it('maps a throwing parser to a content-free parser-failed error', () => {
    const result = openDiff('text', {
      parser: () => {
        throw new Error('secret detail from the parser');
      },
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'parser-failed', message: 'The diff parser could not produce a result.' },
    });
  });

  it('passes a parser error through as the failure', () => {
    const error: ParseError = {
      code: 'not-a-diff',
      title: 'Not a diff',
      detail: 'No headers.',
      hint: null,
      suggestion: null,
    };
    const result = openDiff('text', {
      parser: () => ({ ok: false, error, warnings: [] }),
    });
    expect(result).toEqual({ ok: false, error });
    expect(!result.ok && result.error).toBe(error);
  });

  it('feeds the parser the decoded text', () => {
    const seen: string[] = [];
    openDiff(new TextEncoder().encode('a\r\nb\r\n'), {
      parser: (text) => {
        seen.push(text);
        return parseOk(fingerprint, singleFile);
      },
    });
    expect(seen).toEqual(['a\nb\n']);
  });

  it('prepends transport warnings with a level per code', () => {
    const own: ParseWarning = {
      code: 'orphan-lines',
      level: 'warn',
      message: 'own',
      fileId: null,
      srcLine: 3,
      count: 1,
      samples: ['x'],
    };
    const bytes = new Uint8Array([0x64, 0xff, 0x61]);
    const value = expectOk(
      openDiff(bytes, { parser: () => parseOk(fingerprint, singleFile, [own]) }),
    );
    expect(value.parsed.warnings).toEqual([
      {
        code: 'invalid-utf8',
        level: 'warn',
        message: 'Some invalid UTF-8 bytes were replaced.',
        fileId: null,
        srcLine: null,
        count: 1,
        samples: [],
      },
      own,
    ]);
    expect(value.decoded.warnings.map((warning) => warning.code)).toEqual(['invalid-utf8']);
  });

  it('gives informational transport warnings the info level', () => {
    const value = expectOk(openDiff('a\r\nb\r\n', { parser: parserFor(fingerprint, singleFile) }));
    expect(value.parsed.warnings).toEqual([
      {
        code: 'crlf-normalised',
        level: 'info',
        message: 'CRLF line endings were normalised.',
        fileId: null,
        srcLine: null,
        count: 1,
        samples: [],
      },
    ]);
    const nul = expectOk(
      openDiff(`${'a'.repeat(8_001)}\u0000`, { parser: parserFor(fingerprint, singleFile) }),
    );
    expect(nul.parsed.warnings[0]).toMatchObject({ code: 'nul-replaced', level: 'warn' });
  });

  it('does not repeat a warning code the parser already reported', () => {
    const own: ParseWarning = {
      code: 'crlf-normalised',
      level: 'info',
      message: 'parser version',
      fileId: null,
      srcLine: null,
      count: 5,
      samples: [],
    };
    const value = expectOk(
      openDiff('a\r\nb\r\n', { parser: () => parseOk(fingerprint, singleFile, [own]) }),
    );
    expect(value.parsed.warnings).toEqual([own]);
  });

  it('returns the parser result unchanged when decoding adds no warnings', () => {
    const result = parseOk(fingerprint, singleFile);
    const value = expectOk(openDiff('text', { parser: () => result }));
    expect(value.parsed).toBe(result);
  });
});

describe('openDiff call forms', () => {
  it('accepts a parser followed by trailing options', () => {
    const value = expectOk(
      openDiff('text', parserFor(fingerprint, []), { label: 'Trailing', sampleTitle: 'Ignored' }),
    );
    expect(value.state.label).toBe('Trailing');
  });

  it('accepts a bare parser', () => {
    const value = expectOk(openDiff('text', parserFor(fingerprint, singleFile)));
    expect(value.state.label).toBe('src/a.ts');
  });

  it('accepts decoder inputs and the open alias', () => {
    const parser = parserFor(fingerprint, singleFile);
    expect(expectOk(open({ kind: 'text', text: 'text' }, { parser })).outcome).toBe('new');
    expect(
      expectOk(open({ kind: 'bytes', bytes: new TextEncoder().encode('text') }, parser)).outcome,
    ).toBe('new');
  });
});

describe('restoreReview', () => {
  it('reports a missing review', () => {
    const adapter = persistentAdapter();
    expect(restoreReview(fingerprint, { adapter, parser: parserFor(fingerprint, []) })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'No saved review was found for this diff.' },
    });
  });

  it('reports a storage read failure with the adapter detail', () => {
    const failing: ReviewStorageAdapter = {
      ...persistentAdapter(),
      getReview: () => ({
        ok: false,
        error: {
          code: 'unavailable',
          title: 'Browser storage is unavailable',
          detail: 'read failed',
          suggestion: 'Keep this tab open.',
        },
      }),
    };
    expect(
      restoreReview(fingerprint, { adapter: failing, parser: parserFor(fingerprint, []) }),
    ).toEqual({ ok: false, error: { code: 'parser-failed', message: 'read failed' } });
  });

  it('keeps decisions only when no diff text was saved', () => {
    const adapter = persistentAdapter();
    adapter.setReview(storedReview());
    const value = expectOk(
      restoreReview(fingerprint, { adapter, parser: parserFor(fingerprint, singleFile) }),
    );
    expect(value.restoredDiff).toBe(false);
    expect(value.diffText).toBeNull();
    expect(value.notice).toBe(
      'Saved decisions for 2 hunks. Paste or drop the same diff to restore them.',
    );
    expect(value.record.fingerprint).toBe(fingerprint);
    expect(value.state.hunkIds).toEqual([first, second]);
    expect(value.state.hunks[second]).toEqual({ decision: null, comment: 'comment only' });
    expect(value.state.round).toBe(3);
  });

  it('keeps decisions only when the saved diff cannot be read', () => {
    const adapter = persistentAdapter();
    adapter.setReview(storedReview());
    const failing: ReviewStorageAdapter = {
      ...adapter,
      getDiff: () => ({
        ok: false,
        error: {
          code: 'unavailable',
          title: 'Browser storage is unavailable',
          detail: 'diff read failed',
          suggestion: 'Keep this tab open.',
        },
      }),
    };
    const value = expectOk(
      restoreReview(fingerprint, { adapter: failing, parser: parserFor(fingerprint, singleFile) }),
    );
    expect(value.restoredDiff).toBe(false);
    expect(value.notice).toBe(
      'Saved decisions for 2 hunks. Paste or drop the same diff to restore them.',
    );
  });

  it('keeps decisions and says so when the saved diff no longer matches', () => {
    const adapter = persistentAdapter();
    adapter.setReview(storedReview());
    adapter.setDiff(fingerprint, 'changed text');
    const value = expectOk(
      restoreReview(fingerprint, { adapter, parser: parserFor(otherFingerprint, singleFile) }),
    );
    expect(value.restoredDiff).toBe(false);
    expect(value.diffText).toBeNull();
    expect(value.notice).toBe(
      'Saved decisions for 2 hunks were kept, but the saved diff did not match. Paste the same diff to restore them.',
    );
    expect(value.state.hunkIds).toEqual([first, second]);
  });

  it('restores the diff and the decisions when the fingerprint matches', () => {
    const adapter = persistentAdapter();
    adapter.setReview(storedReview());
    adapter.setDiff(fingerprint, 'saved text');
    const seen: string[] = [];
    const value = expectOk(
      restoreReview(fingerprint, {
        adapter,
        parser: (text) => {
          seen.push(text);
          return parseOk(fingerprint, singleFile);
        },
      }),
    );
    expect(seen).toEqual(['saved text']);
    expect(value.restoredDiff).toBe(true);
    expect(value.diffText).toBe('saved text');
    expect(value.notice).toBeNull();
    expect(value.state.hunks[first]?.decision).toBe('approved');
    expect(value.state.round).toBe(3);
  });

  it('returns the open failure when the saved diff cannot be parsed', () => {
    const adapter = persistentAdapter();
    adapter.setReview(storedReview());
    adapter.setDiff(fingerprint, 'saved text');
    const crashing: DiffParser = () => {
      throw new Error('parser crashed');
    };
    expect(restoreReview(fingerprint, { adapter, parser: crashing })).toEqual({
      ok: false,
      error: { code: 'parser-failed', message: 'The diff parser could not produce a result.' },
    });
    expect(restore).toBe(restoreReview);
  });
});
