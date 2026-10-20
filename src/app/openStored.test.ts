import { describe, expect, it, vi } from 'vitest';
import { parseDiff } from '../core/parser/parse';
import type { ParseResult } from '../core/types';
import { decidedState, memoryAreas, parsedFiles, smallDiff } from './appFixtures';
import { memoizeParser, openWithStored } from './openStored';
import { persistReview } from './persist';

const updatedAt = '2026-10-20T00:00:00.000Z';

describe('memoizeParser', () => {
  it('parses a repeated text once and a different text again', () => {
    const inner = vi.fn((text: string): ParseResult => parseDiff(text));
    const parser = memoizeParser(inner);
    const first = parser(smallDiff('one'));
    expect(parser(smallDiff('one'))).toBe(first);
    expect(inner).toHaveBeenCalledTimes(1);
    parser(smallDiff('two'));
    expect(inner).toHaveBeenCalledTimes(2);
  });
});

describe('openWithStored', () => {
  it('opens a diff with no stored review as a new review labelled from its paths', () => {
    const { adapter } = memoryAreas();
    const opened = openWithStored(smallDiff(), { adapter });
    expect(opened.ok && opened.value.outcome).toBe('new');
    expect(opened.ok && opened.value.state.label).toBe('src/a.ts and 1 more');
  });

  it('restores the decisions of a stored review with the same fingerprint', () => {
    const { adapter } = memoryAreas();
    const decided = decidedState(smallDiff());
    persistReview(decided, { adapter, updatedAt });
    const opened = openWithStored(smallDiff(), { adapter, label: 'Pasted again' });
    expect(opened.ok && opened.value.outcome).toBe('restored');
    expect(opened.ok && opened.value.state.hunks).toEqual(decided.hunks);
    expect(opened.ok && opened.value.state.label).toBe('Fixture review');
  });

  it('does not restore another diff that shares no fingerprint', () => {
    const { adapter } = memoryAreas();
    persistReview(decidedState(smallDiff('one')), { adapter, updatedAt });
    const opened = openWithStored(smallDiff('two'), { adapter });
    expect(opened.ok && opened.value.outcome).toBe('new');
    expect(opened.ok && Object.keys(opened.value.state.hunks)).toEqual([]);
  });

  it('reports the same diff as already open without reading storage again', () => {
    const { adapter } = memoryAreas();
    const current = decidedState(smallDiff());
    const getReview = vi.spyOn(adapter, 'getReview');
    const opened = openWithStored(smallDiff(), { adapter, current });
    expect(opened.ok && opened.value.outcome).toBe('same-open');
    expect(getReview).not.toHaveBeenCalled();
  });

  it('keeps the parse error of an invalid diff', () => {
    const { adapter } = memoryAreas();
    const opened = openWithStored('this is not a diff', { adapter });
    expect(opened.ok).toBe(false);
  });

  it('parses a restored diff once', () => {
    const { adapter } = memoryAreas();
    persistReview(decidedState(smallDiff()), { adapter, updatedAt });
    const parser = vi.fn((text: string): ParseResult => parseDiff(text));
    openWithStored(smallDiff(), { adapter, parser });
    expect(parser).toHaveBeenCalledTimes(1);
    expect(parsedFiles(smallDiff()).files).toHaveLength(2);
  });
});
