import { describe, expect, it } from 'vitest';
import { parseDiff } from '../core/parser/parse';
import { decidedState, memoryAreas } from './appFixtures';
import { openDiff, restoreReview } from './open';
import { persistReview } from './persist';
import { resumeOpenReview } from './resume';

const updatedAt = '2026-10-20T00:00:00.000Z';

/** The first hunk header promises five old lines and the body has two. */
function truncated(): string {
  return [
    'diff --git a/a.ts b/a.ts',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1,5 +1,6 @@',
    ' one',
    '-two',
    '+TWO',
    'diff --git a/b.ts b/b.ts',
    '--- a/b.ts',
    '+++ b/b.ts',
    '@@ -1 +1 @@',
    '-x',
    '+y',
    '',
  ].join('\n');
}

describe('IN-WARN-FLOW the warnings of a parse reach whoever opens the review', () => {
  it('keeps the parser warnings on an opened diff', () => {
    const opened = openDiff(truncated(), { parser: parseDiff });
    expect(opened.ok && opened.value.parsed.warnings.map((warning) => warning.code)).toContain(
      'hunk-truncated',
    );
  });

  it('keeps the decoder warnings next to the parser ones', () => {
    const bytes = new TextEncoder().encode(truncated());
    const withBadByte = new Uint8Array([...bytes, 0xff]);
    const opened = openDiff(withBadByte, { parser: parseDiff });
    const codes = opened.ok ? opened.value.parsed.warnings.map((warning) => warning.code) : [];
    expect(codes).toContain('invalid-utf8');
    expect(codes).toContain('hunk-truncated');
  });

  it('parses the warnings again when a stored review comes back with its text', () => {
    const text = truncated();
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    persistReview(state, { adapter, updatedAt, diffText: text, rememberDiff: true });
    const restored = restoreReview(state.fingerprint, { adapter, parser: parseDiff });
    expect(restored.ok && restored.value.warnings.map((warning) => warning.code)).toContain(
      'hunk-truncated',
    );
  });

  it('has no warnings to give when only the decisions came back', () => {
    const text = truncated();
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    persistReview(state, { adapter, updatedAt, diffText: text, rememberDiff: false });
    const restored = restoreReview(state.fingerprint, { adapter, parser: parseDiff });
    expect(restored.ok && restored.value.warnings).toEqual([]);
  });

  it('hands the warnings to a resumed review, so a reload shows the banner again', () => {
    const text = truncated();
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    persistReview(state, { adapter, updatedAt, diffText: text, rememberDiff: true });
    adapter.setOpenFingerprint(state.fingerprint);
    const resumed = resumeOpenReview(adapter);
    expect(resumed.kind).toBe('review');
    expect(resumed.kind === 'review' && resumed.warnings.map((warning) => warning.code)).toContain(
      'hunk-truncated',
    );
  });
});
