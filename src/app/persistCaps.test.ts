import { describe, expect, it } from 'vitest';
import { LIMITS } from '../core/limits';
import { materialize } from '../samples/fakeSecrets';
import { memoryAreas, parsedFiles, smallDiff } from './appFixtures';
import { persistReview, toStoredReview } from './persist';
import { createPersistGate, redactSecrets } from './persistGate';

const updatedAt = '2026-10-20T00:00:00.000Z';
const secret = materialize('{{FAKE:aws-key}}');

function codePoints(text: string): number {
  return Array.from(text).length;
}

/** Text that sits one code point under its cap with a secret in the middle. */
function nearCap(maximum: number, filler = 'y'): string {
  const room = maximum - secret.length - 2;
  const half = Math.floor(room / 2);
  return `${filler.repeat(half)} ${secret} ${filler.repeat(room - half)}`;
}

function stateOf(overrides: { label?: string; overallNote?: string; comment?: string }) {
  const { files, fingerprint } = parsedFiles(smallDiff());
  const ids = files.flatMap((file) => file.hunks.map((hunk) => hunk.id));
  const first = ids[0] ?? '';
  return {
    state: {
      fingerprint,
      round: 1,
      label: overrides.label ?? 'Review',
      overallNote: overrides.overallNote ?? '',
      hunks: { [first]: { decision: 'rejected' as const, comment: overrides.comment ?? '' } },
      hunkIds: ids,
      prior: null,
    },
    first,
    files,
  };
}

describe('ST-REDACT-CAP redaction can never push saved text past its cap', () => {
  it.each([
    ['label', LIMITS.maxLabelChars],
    ['overallNote', LIMITS.maxOverallNoteChars],
    ['comment', LIMITS.maxCommentChars],
  ] as const)('stores a %s that grew past its cap when a secret was redacted', (field, cap) => {
    const text = nearCap(cap);
    expect(codePoints(text)).toBeLessThanOrEqual(cap);
    const { state, first, files } = stateOf({ [field]: text });
    const { adapter } = memoryAreas();
    const saved = persistReview(state, {
      adapter,
      updatedAt,
      diffText: null,
      rememberDiff: true,
      ...createPersistGate(files, null),
    });
    expect(saved.ok).toBe(true);
    const stored = adapter.getReview(state.fingerprint);
    expect(stored.ok && stored.value !== null).toBe(true);
    const record = stored.ok ? stored.value : null;
    const value =
      field === 'comment' ? record?.decisions[first]?.comment : record?.[field as 'label'];
    expect(value).toBeDefined();
    expect(codePoints(value ?? '')).toBeLessThanOrEqual(cap);
    expect(value).not.toContain(secret);
  });

  it('keeps the decision itself when only the comment text had to be cut', () => {
    const { state, first, files } = stateOf({ comment: nearCap(LIMITS.maxCommentChars) });
    const { adapter } = memoryAreas();
    persistReview(state, { adapter, updatedAt, ...createPersistGate(files, null) });
    const stored = adapter.getReview(state.fingerprint);
    expect(stored.ok && stored.value?.decisions[first]?.decision).toBe('rejected');
  });

  it('cuts at a code point boundary and never leaves half a surrogate pair', () => {
    const cap = LIMITS.maxLabelChars;
    const astral = '\u{1F600}';
    const room = cap - 1;
    const label = `${astral.repeat(room - secret.length - 1)}${secret} ${astral}`;
    expect(codePoints(label)).toBeLessThanOrEqual(cap);
    const record = toStoredReview(stateOf({ label }).state, updatedAt, redactSecrets);
    expect(codePoints(record.label)).toBeLessThanOrEqual(cap);
    expect(record.label).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    expect(record.label).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  });

  it('leaves text that fits untouched', () => {
    const record = toStoredReview(
      stateOf({ label: 'short label' }).state,
      updatedAt,
      redactSecrets,
    );
    expect(record.label).toBe('short label');
  });

  it('caps the output of a custom redactor too', () => {
    const record = toStoredReview(stateOf({ label: 'abc' }).state, updatedAt, (text) =>
      text.repeat(100),
    );
    expect(codePoints(record.label)).toBe(LIMITS.maxLabelChars);
  });
});
