import { describe, expect, it } from 'vitest';
import { parseReviewRecord, serializeReviewRecord } from './validator';

const id = 'f00000000001:00000000001';

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    hashVersion: 1,
    updatedAt: '2026-10-19T00:00:00.000Z',
    fingerprint: '00000000001',
    round: 1,
    label: 'Review',
    overallNote: '',
    decisions: { [id]: { decision: 'approved', comment: '' } },
    hunkIds: [id],
    prior: null,
    ...overrides,
  };
}

describe('parseReviewRecord', () => {
  it('accepts a round-trip record and preserves a null-prototype decisions map', () => {
    const parsed = parseReviewRecord(record());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(Object.getPrototypeOf(parsed.value.decisions)).toBeNull();
      const serialized = serializeReviewRecord(parsed.value);
      expect(serialized.ok).toBe(true);
      expect(parseReviewRecord(serialized.ok ? serialized.value : '').ok).toBe(true);
    }
  });

  it('ST-CORRUPT rejects malformed JSON, unknown keys and prototype-shaped keys', () => {
    expect(parseReviewRecord('{')).toMatchObject({ ok: false, error: { code: 'corrupt' } });
    expect(parseReviewRecord(record({ extra: true }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-field' },
    });
    const prototypeKey = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(prototypeKey, '__proto__', {
      value: { decision: 'approved', comment: '' },
      enumerable: true,
    });
    expect(parseReviewRecord(record({ decisions: prototypeKey }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-field' },
    });
    expect(
      parseReviewRecord(
        record({ decisions: { [id]: { decision: 'approved', comment: '', constructor: true } } }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid-field' },
    });
  });

  it('ST-FUTURE leaves future schema and hash versions distinguishable', () => {
    expect(parseReviewRecord(record({ schemaVersion: 2 }))).toMatchObject({
      ok: false,
      error: { code: 'future-schema' },
    });
    expect(parseReviewRecord(record({ hashVersion: 2 }))).toMatchObject({
      ok: false,
      error: { code: 'hash-version' },
    });
  });

  it('enforces record, label, note, comment and collection caps', () => {
    expect(parseReviewRecord('x'.repeat(1_500_001))).toMatchObject({
      ok: false,
      error: { code: 'too-large' },
    });
    expect(parseReviewRecord(record({ label: 'x'.repeat(81) }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-field' },
    });
    expect(parseReviewRecord(record({ overallNote: 'x'.repeat(4_001) }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-field' },
    });
    expect(
      parseReviewRecord(
        record({ decisions: { [id]: { decision: 'approved', comment: 'x'.repeat(2_001) } } }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid-field' },
    });
  });
});
