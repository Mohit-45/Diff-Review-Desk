import { describe, expect, it } from 'vitest';
import type { Result, StoredReview, ValidationError } from '../core/types';
import {
  DECISION_KEY_PATTERN,
  DEFAULT_PREFS,
  FINGERPRINT_PATTERN,
  MAX_STORED_HUNKS,
  parsePrefs,
  parseReviewRecord,
  parseStoredReview,
  serializePrefs,
  serializeReviewRecord,
  validateReviewRecord,
  validateStoredReview,
} from './validator';

const id = 'f00000000001:00000000001';
const otherId = 'f00000000001:00000000002';

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

function priorRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    round: 1,
    unchangedIds: [id],
    carried: { [id]: 'approved' },
    goneCount: 2,
    goneRejected: 1,
    ...overrides,
  };
}

function withPrior(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return record({ round: 2, hunkIds: [id, otherId], prior: priorRecord(overrides) });
}

function parsedRecord(overrides: Record<string, unknown> = {}): StoredReview {
  const parsed = parseReviewRecord(record(overrides));
  if (!parsed.ok) {
    throw new Error('The fixture must validate.');
  }
  return parsed.value;
}

function problem(result: Result<unknown, ValidationError>): ValidationError | null {
  return result.ok ? null : result.error;
}

function keyFor(index: number): string {
  return `f${index.toString(36).padStart(11, '0')}:00000000001`;
}

function manyKeys(count: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let index = 0; index < count; index += 1) {
    result[keyFor(index)] = { decision: null, comment: '' };
  }
  return result;
}

function nullPrototype(entries: Record<string, unknown>): Record<string, unknown> {
  return Object.assign(Object.create(null) as Record<string, unknown>, entries);
}

describe('parseReviewRecord output', () => {
  it('returns a fresh record with keys in a fixed order', () => {
    const input = record();
    const parsed = parseReviewRecord(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(Object.keys(parsed.value)).toEqual([
      'schemaVersion',
      'hashVersion',
      'updatedAt',
      'fingerprint',
      'round',
      'label',
      'overallNote',
      'decisions',
      'hunkIds',
      'prior',
    ]);
    expect(parsed.value).toEqual(input);
    expect(parsed.value.decisions).not.toBe(input.decisions);
    expect(parsed.value.hunkIds).not.toBe(input.hunkIds);
    expect(Object.getPrototypeOf(parsed.value.decisions)).toBeNull();
  });

  it('puts the carry-over dismissal last and keeps false', () => {
    for (const dismissed of [true, false]) {
      const parsed = parseReviewRecord(record({ carryoverDismissed: dismissed }));
      expect(parsed.ok && Object.keys(parsed.value).at(-1)).toBe('carryoverDismissed');
      expect(parsed.ok && parsed.value.carryoverDismissed).toBe(dismissed);
    }
  });

  it('drops an explicitly undefined dismissal', () => {
    const parsed = parseReviewRecord(record({ carryoverDismissed: undefined }));
    expect(parsed.ok && 'carryoverDismissed' in parsed.value).toBe(false);
  });

  it('serializes in the same key order with no whitespace', () => {
    expect(serializeReviewRecord(parsedRecord())).toEqual({
      ok: true,
      value:
        '{"schemaVersion":1,"hashVersion":1,"updatedAt":"2026-10-19T00:00:00.000Z","fingerprint":"00000000001","round":1,"label":"Review","overallNote":"","decisions":{"f00000000001:00000000001":{"decision":"approved","comment":""}},"hunkIds":["f00000000001:00000000001"],"prior":null}',
    });
  });

  it('accepts a null-prototype object and an object-typed input', () => {
    expect(parseReviewRecord(nullPrototype(record())).ok).toBe(true);
    expect(parseReviewRecord(JSON.stringify(record())).ok).toBe(true);
  });

  it('keeps the exported aliases and constants', () => {
    expect(validateReviewRecord).toBe(parseReviewRecord);
    expect(parseStoredReview).toBe(parseReviewRecord);
    expect(validateStoredReview).toBe(parseReviewRecord);
    expect(MAX_STORED_HUNKS).toBe(250_000);
    expect(DECISION_KEY_PATTERN.test('f0abcz000001~12:00000000001#3')).toBe(true);
    expect(DECISION_KEY_PATTERN.test('F00000000001:00000000001')).toBe(false);
    expect(DECISION_KEY_PATTERN.test('f00000000001:00000000001\n')).toBe(false);
    expect(FINGERPRINT_PATTERN.test('0123456789a')).toBe(true);
    expect(FINGERPRINT_PATTERN.test('0123456789ab')).toBe(false);
  });
});

describe('parseReviewRecord input forms', () => {
  it.each([
    ['text that is not JSON', '{', 'corrupt', 'Saved review data could not be read.'],
    ['a JSON array', '[]', 'corrupt', 'Saved review data is not an object.'],
    ['JSON null', 'null', 'corrupt', 'Saved review data is not an object.'],
    ['a JSON number', '42', 'corrupt', 'Saved review data is not an object.'],
    ['an empty string', '', 'corrupt', 'Saved review data could not be read.'],
    ['a number', 42, 'corrupt', 'Saved review data is not an object.'],
    ['null', null, 'corrupt', 'Saved review data is not an object.'],
    ['undefined', undefined, 'corrupt', 'Saved review data is not an object.'],
    ['an array', [record()], 'corrupt', 'Saved review data is not an object.'],
    ['a Map', new Map(), 'corrupt', 'Saved review data is not an object.'],
    [
      'a class instance',
      new (class Foreign {
        readonly marker = 1;
      })(),
      'corrupt',
      'Saved review data is not an object.',
    ],
  ])('rejects %s', (_label, input, code, message) => {
    expect(problem(parseReviewRecord(input))).toEqual({ code, message });
  });

  it('ST-CORRUPT caps the raw text before parsing it', () => {
    expect(problem(parseReviewRecord('x'.repeat(1_500_001)))).toEqual({
      code: 'too-large',
      message: 'Saved review data is too large to read.',
    });
    expect(problem(parseReviewRecord('x'.repeat(1_500_000)))).toEqual({
      code: 'corrupt',
      message: 'Saved review data could not be read.',
    });
  });

  it('ST-CORRUPT rejects prototype-shaped keys parsed from text', () => {
    const text = '{"__proto__":{"x":1},"schemaVersion":1}';
    expect(problem(parseReviewRecord(text))).toEqual({
      code: 'invalid-field',
      message: 'Saved review data contains an unknown key.',
    });
    expect(problem(parseReviewRecord(record({ constructor: 1 })))).toEqual({
      code: 'invalid-field',
      message: 'Saved review data contains an unknown key.',
    });
  });

  it('rejects symbol keys and hostile objects without throwing', () => {
    const symbolic = { ...record(), [Symbol('x')]: 1 };
    expect(problem(parseReviewRecord(symbolic))?.code).toBe('invalid-field');
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('trap');
        },
      },
    );
    expect(problem(parseReviewRecord(hostile))).toEqual({
      code: 'corrupt',
      message: 'Saved review data could not be read.',
    });
    const getter = record();
    Object.defineProperty(getter, 'label', {
      enumerable: true,
      get() {
        throw new Error('getter');
      },
    });
    expect(problem(parseReviewRecord(getter))).toEqual({
      code: 'corrupt',
      message: 'Saved review data could not be read.',
    });
  });
});

describe('parseReviewRecord versions and keys', () => {
  it.each([
    [
      'a newer schema',
      { schemaVersion: 2 },
      'future-schema',
      'Saved review data was written by a newer version.',
    ],
    [
      'a newer schema with an unsupported hash version',
      { schemaVersion: 7, hashVersion: 9 },
      'future-schema',
      'Saved review data was written by a newer version.',
    ],
    [
      'a newer schema that also has an unknown key',
      { schemaVersion: 2, extra: true },
      'future-schema',
      'Saved review data was written by a newer version.',
    ],
    [
      'an unsupported hash version',
      { hashVersion: 2 },
      'hash-version',
      'Saved review data uses an unsupported hash version.',
    ],
    [
      'an unsupported hash version that also has an unknown key',
      { hashVersion: 2, extra: true },
      'hash-version',
      'Saved review data uses an unsupported hash version.',
    ],
    [
      'a missing hash version',
      { hashVersion: undefined },
      'hash-version',
      'Saved review data uses an unsupported hash version.',
    ],
    [
      'an unknown key before version checks',
      { extra: 1, schemaVersion: 0 },
      'invalid-field',
      'Saved review data contains an unknown key.',
    ],
    [
      'schema version zero',
      { schemaVersion: 0 },
      'invalid-field',
      'Saved review schema version is invalid.',
    ],
    [
      'a text schema version',
      { schemaVersion: '1' },
      'invalid-field',
      'Saved review schema version is invalid.',
    ],
    [
      'a text future schema version',
      { schemaVersion: '2' },
      'invalid-field',
      'Saved review schema version is invalid.',
    ],
    [
      'a null schema version',
      { schemaVersion: null },
      'invalid-field',
      'Saved review schema version is invalid.',
    ],
    [
      'a missing schema version',
      { schemaVersion: undefined },
      'invalid-field',
      'Saved review schema version is invalid.',
    ],
    [
      'an unsupported hash version without a schema version',
      { schemaVersion: undefined, hashVersion: 2 },
      'invalid-field',
      'Saved review schema version is invalid.',
    ],
  ])('ST-FUTURE classifies %s', (_label, overrides, code, message) => {
    expect(problem(parseReviewRecord(record(overrides)))).toEqual({ code, message });
  });
});

describe('parseReviewRecord scalar fields', () => {
  it.each([
    ['a non-text timestamp', { updatedAt: 5 }, 'Saved review timestamp is invalid.'],
    ['a long timestamp', { updatedAt: 'x'.repeat(129) }, 'Saved review timestamp is invalid.'],
    [
      'a long timestamp before a bad fingerprint',
      { updatedAt: 'x'.repeat(129), fingerprint: 'no' },
      'Saved review timestamp is invalid.',
    ],
    ['a missing fingerprint', { fingerprint: undefined }, 'Saved review fingerprint is invalid.'],
    [
      'a non-text fingerprint',
      { fingerprint: 12345678901 },
      'Saved review fingerprint is invalid.',
    ],
    ['a short fingerprint', { fingerprint: '0000000001' }, 'Saved review fingerprint is invalid.'],
    [
      'an uppercase fingerprint',
      { fingerprint: '0000000000A' },
      'Saved review fingerprint is invalid.',
    ],
    ['round zero', { round: 0 }, 'Saved review round is invalid.'],
    ['a negative round', { round: -1 }, 'Saved review round is invalid.'],
    ['a fractional round', { round: 1.5 }, 'Saved review round is invalid.'],
    ['a text round', { round: '1' }, 'Saved review round is invalid.'],
    ['an infinite round', { round: Number.POSITIVE_INFINITY }, 'Saved review round is invalid.'],
    ['a round beyond the cap', { round: 1_000_000_001 }, 'Saved review round is invalid.'],
    ['a non-text label', { label: 3 }, 'Saved review text exceeds its limit.'],
    ['a long label', { label: 'x'.repeat(81) }, 'Saved review text exceeds its limit.'],
    ['a non-text note', { overallNote: null }, 'Saved review text exceeds its limit.'],
    ['a long note', { overallNote: 'x'.repeat(4_001) }, 'Saved review text exceeds its limit.'],
  ])('rejects %s', (_label, overrides, message) => {
    expect(problem(parseReviewRecord(record(overrides)))).toEqual({
      code: 'invalid-field',
      message,
    });
  });

  it('measures text in code points and accepts the cap exactly', () => {
    const emoji = '\u{1F600}';
    expect(parseReviewRecord(record({ label: emoji.repeat(80) })).ok).toBe(true);
    expect(parseReviewRecord(record({ label: emoji.repeat(81) })).ok).toBe(false);
    expect(parseReviewRecord(record({ overallNote: emoji.repeat(4_000) })).ok).toBe(true);
    expect(parseReviewRecord(record({ overallNote: emoji.repeat(4_001) })).ok).toBe(false);
    expect(parseReviewRecord(record({ updatedAt: 'x'.repeat(128) })).ok).toBe(true);
    expect(parseReviewRecord(record({ round: 1_000_000_000 })).ok).toBe(true);
  });
});

describe('parseReviewRecord hunk ids', () => {
  it.each([
    ['not an array', { hunkIds: 'nope' }, 'invalid-field', 'Saved hunk ids are not an array.'],
    ['an object', { hunkIds: {} }, 'invalid-field', 'Saved hunk ids are not an array.'],
    ['missing', { hunkIds: undefined }, 'invalid-field', 'Saved hunk ids are not an array.'],
    [
      'carrying an extra property',
      { hunkIds: Object.assign([id], { extra: 1 }) },
      'invalid-field',
      'Saved hunk ids have an invalid array shape.',
    ],
    [
      'carrying a symbol property',
      { hunkIds: Object.assign([id], { [Symbol('x')]: 1 }) },
      'invalid-field',
      'Saved hunk ids have an invalid array shape.',
    ],
    [
      'holding a non-text id',
      { hunkIds: [id, 5] },
      'invalid-field',
      'Saved hunk ids contain an invalid hunk id.',
    ],
    [
      'holding a malformed id',
      { hunkIds: ['nope'] },
      'invalid-field',
      'Saved hunk ids contain an invalid hunk id.',
    ],
    [
      'holding a duplicate id',
      { hunkIds: [id, id] },
      'invalid-field',
      'Saved hunk ids contain an invalid hunk id.',
    ],
    [
      'sparse',
      { hunkIds: new Array<string>(1) },
      'invalid-field',
      'Saved hunk ids contain an invalid hunk id.',
    ],
  ])('rejects hunk ids that are %s', (_label, overrides, code, message) => {
    expect(problem(parseReviewRecord(record(overrides)))).toEqual({ code, message });
  });

  it('ST-CORRUPT caps the number of hunk ids before looking at them', () => {
    const tooMany = new Array<string>(250_001).fill('nope');
    expect(problem(parseReviewRecord(record({ hunkIds: tooMany })))).toEqual({
      code: 'too-large',
      message: 'Saved hunk ids are too numerous.',
    });
  });

  it('accepts suffixed ids and an empty list', () => {
    const suffixed = 'f00000000001~2:00000000001#3';
    expect(parseReviewRecord(record({ hunkIds: [suffixed], decisions: {} })).ok).toBe(true);
    expect(parseReviewRecord(record({ hunkIds: [], decisions: {} })).ok).toBe(true);
  });
});

describe('parseReviewRecord decisions', () => {
  it.each([
    ['an array', [], 'Decisions must be a plain object.'],
    ['null', null, 'Decisions must be a plain object.'],
    ['text', 'x', 'Decisions must be a plain object.'],
    ['a Map', new Map(), 'Decisions must be a plain object.'],
    ['an object with a symbol key', { [Symbol('x')]: 1 }, 'Decisions must be a plain object.'],
    [
      'an object with a malformed key',
      { nope: { decision: null, comment: '' } },
      'A saved decision key is not a hunk id for this review.',
    ],
    ['a non-object entry', { [id]: 'approved' }, 'A hunk decision has an invalid shape.'],
    ['a null entry', { [id]: null }, 'A hunk decision has an invalid shape.'],
    [
      'an entry with an extra key',
      { [id]: { decision: null, comment: '', extra: 1 } },
      'A hunk decision has an invalid shape.',
    ],
    [
      'an entry with an unknown decision',
      { [id]: { decision: 'maybe', comment: '' } },
      'A hunk decision is not recognised.',
    ],
    ['an entry with no decision', { [id]: { comment: '' } }, 'A hunk decision is not recognised.'],
    [
      'an entry with no comment',
      { [id]: { decision: null } },
      'A hunk comment is too long or not text.',
    ],
    [
      'an entry with a numeric comment',
      { [id]: { decision: null, comment: 4 } },
      'A hunk comment is too long or not text.',
    ],
    [
      'an entry with a long comment',
      { [id]: { decision: null, comment: 'x'.repeat(2_001) } },
      'A hunk comment is too long or not text.',
    ],
  ])('rejects decisions given as %s', (_label, decisions, message) => {
    expect(problem(parseReviewRecord(record({ decisions })))).toEqual({
      code: 'invalid-field',
      message,
    });
  });

  it('accepts ids that are not in the hunk id list and comment-only entries', () => {
    const decisions = {
      [otherId]: { decision: null, comment: 'note' },
      [id]: { decision: 'rejected', comment: '\u{1F600}'.repeat(2_000) },
    };
    const parsed = parseReviewRecord(record({ decisions }));
    expect(parsed.ok && Object.keys(parsed.value.decisions)).toEqual([otherId, id]);
    expect(parseReviewRecord(record({ decisions: nullPrototype(decisions) })).ok).toBe(true);
  });

  it('ST-CORRUPT caps the number of decisions', () => {
    expect(problem(parseReviewRecord(record({ decisions: manyKeys(250_001) })))).toEqual({
      code: 'too-large',
      message: 'The saved review contains too many decisions.',
    });
    expect(parseReviewRecord(record({ decisions: manyKeys(250_000) })).ok).toBe(true);
  });

  it('checks hunk ids before decisions and decisions before the carry-over record', () => {
    expect(
      problem(parseReviewRecord(record({ hunkIds: 'x', decisions: 'x', prior: 'x' })))?.message,
    ).toBe('Saved hunk ids are not an array.');
    expect(problem(parseReviewRecord(record({ decisions: 'x', prior: 'x' })))?.message).toBe(
      'Decisions must be a plain object.',
    );
    expect(
      problem(parseReviewRecord(record({ prior: 'x', carryoverDismissed: 'x' })))?.message,
    ).toBe('The saved carry-over record has an invalid shape.');
  });
});

describe('parseReviewRecord carry-over record', () => {
  it('round-trips a valid carry-over record into a fresh null-prototype map', () => {
    const input = withPrior();
    const parsed = parseReviewRecord(input);
    expect(parsed.ok && parsed.value.prior).toEqual({
      round: 1,
      unchangedIds: [id],
      carried: { [id]: 'approved' },
      goneCount: 2,
      goneRejected: 1,
    });
    const prior = parsed.ok ? parsed.value.prior : null;
    expect(prior !== null && Object.getPrototypeOf(prior.carried)).toBeNull();
    expect(prior !== null && Object.keys(prior)).toEqual([
      'round',
      'unchangedIds',
      'carried',
      'goneCount',
      'goneRejected',
    ]);
    expect(prior?.unchangedIds).not.toBe((input.prior as { unchangedIds: string[] }).unchangedIds);
  });

  it('accepts the boundary values', () => {
    expect(parseReviewRecord(withPrior({ round: 2 })).ok).toBe(true);
    expect(parseReviewRecord(withPrior({ round: 0 })).ok).toBe(true);
    expect(parseReviewRecord(withPrior({ goneCount: 0, goneRejected: 0 })).ok).toBe(true);
    expect(parseReviewRecord(withPrior({ goneCount: 3, goneRejected: 3 })).ok).toBe(true);
    expect(
      parseReviewRecord(withPrior({ goneCount: MAX_STORED_HUNKS, goneRejected: MAX_STORED_HUNKS }))
        .ok,
    ).toBe(true);
    expect(parseReviewRecord(withPrior({ unchangedIds: [], carried: {} })).ok).toBe(true);
    expect(parseReviewRecord(withPrior({ carried: nullPrototype({ [id]: 'rejected' }) })).ok).toBe(
      true,
    );
  });

  it.each([
    ['text', 'x', 'The saved carry-over record has an invalid shape.'],
    ['an array', [], 'The saved carry-over record has an invalid shape.'],
    [
      'an object with an extra key',
      { ...priorRecord(), extra: 1 },
      'The saved carry-over record has an invalid shape.',
    ],
    [
      'an object with a prototype key',
      Object.assign(priorRecord(), { constructor: 1 }),
      'The saved carry-over record has an invalid shape.',
    ],
  ])('rejects a carry-over record given as %s', (_label, prior, message) => {
    expect(problem(parseReviewRecord(record({ round: 2, hunkIds: [id], prior })))).toEqual({
      code: 'invalid-field',
      message,
    });
  });

  it.each([
    ['a round above the review round', { round: 3 }, 'The saved carry-over round is invalid.'],
    ['a negative round', { round: -1 }, 'The saved carry-over round is invalid.'],
    ['a fractional round', { round: 1.5 }, 'The saved carry-over round is invalid.'],
    ['a text round', { round: '1' }, 'The saved carry-over round is invalid.'],
    ['a missing round', { round: undefined }, 'The saved carry-over round is invalid.'],
    [
      'unchanged ids that are not an array',
      { unchangedIds: 'x' },
      'Saved unchanged hunk ids are not an array.',
    ],
    [
      'a missing unchanged id list',
      { unchangedIds: undefined },
      'Saved unchanged hunk ids are not an array.',
    ],
    [
      'a malformed unchanged id',
      { unchangedIds: ['nope'] },
      'Saved unchanged hunk ids contain an invalid hunk id.',
    ],
    [
      'a duplicate unchanged id',
      { unchangedIds: [id, id] },
      'Saved unchanged hunk ids contain an invalid hunk id.',
    ],
    [
      'an unchanged id outside the review',
      { unchangedIds: ['f00000000009:00000000009'], carried: {} },
      'A saved unchanged hunk is not in this review.',
    ],
    [
      'carried decisions that are not an object',
      { carried: 'x' },
      'Saved carried decisions must be a plain object.',
    ],
    [
      'carried decisions given as an array',
      { carried: [] },
      'Saved carried decisions must be a plain object.',
    ],
    [
      'missing carried decisions',
      { carried: undefined },
      'Saved carried decisions must be a plain object.',
    ],
    [
      'a carried prototype key',
      { carried: JSON.parse('{"__proto__":"approved"}') as unknown },
      'Saved carried decisions must be a plain object.',
    ],
    [
      'a malformed carried key',
      { carried: { nope: 'approved' } },
      'A saved carried decision key is invalid.',
    ],
    [
      'a carried key outside the review',
      { carried: { 'f00000000009:00000000009': 'approved' } },
      'A saved carried decision key is invalid.',
    ],
    [
      'a carried key that is not unchanged',
      { unchangedIds: [id], carried: { [otherId]: 'approved' } },
      'A saved carried decision key is invalid.',
    ],
    [
      'an unknown carried decision',
      { carried: { [id]: 'maybe' } },
      'A saved carried decision is invalid.',
    ],
    [
      'a null carried decision',
      { carried: { [id]: null } },
      'A saved carried decision is invalid.',
    ],
    ['a negative gone count', { goneCount: -1 }, 'Saved gone-hunk counts are invalid.'],
    ['a fractional gone count', { goneCount: 1.5 }, 'Saved gone-hunk counts are invalid.'],
    ['a text gone count', { goneCount: '2' }, 'Saved gone-hunk counts are invalid.'],
    [
      'a gone count over the cap',
      { goneCount: MAX_STORED_HUNKS + 1 },
      'Saved gone-hunk counts are invalid.',
    ],
    [
      'a missing rejected count',
      { goneRejected: undefined },
      'Saved gone-hunk counts are invalid.',
    ],
    [
      'a rejected count over the cap',
      { goneRejected: MAX_STORED_HUNKS + 1 },
      'Saved gone-hunk counts are invalid.',
    ],
    [
      'more rejected than gone',
      { goneCount: 1, goneRejected: 2 },
      'Saved gone-hunk counts are inconsistent.',
    ],
  ])('rejects %s', (_label, overrides, message) => {
    expect(problem(parseReviewRecord(withPrior(overrides)))).toEqual({
      code: 'invalid-field',
      message,
    });
  });

  it('ST-CORRUPT caps the number of carried decisions', () => {
    expect(problem(parseReviewRecord(withPrior({ carried: manyKeys(250_001) })))).toEqual({
      code: 'too-large',
      message: 'The saved carry-over record contains too many decisions.',
    });
    const unchangedIds = new Array<string>(250_001).fill('nope');
    expect(problem(parseReviewRecord(withPrior({ unchangedIds })))).toEqual({
      code: 'too-large',
      message: 'Saved unchanged hunk ids are too numerous.',
    });
  });

  it('keeps many carried decisions of a large review', () => {
    const ids = Array.from({ length: 5_000 }, (_unused, index) => keyFor(index));
    const carried = Object.fromEntries(ids.map((key) => [key, 'rejected']));
    const parsed = parseReviewRecord(
      record({
        round: 2,
        hunkIds: ids,
        decisions: {},
        prior: priorRecord({ unchangedIds: ids, carried }),
      }),
    );
    expect(parsed.ok && Object.keys(parsed.value.prior?.carried ?? {}).length).toBe(5_000);
  });

  it('checks the round before the id list and the id list before the carried map', () => {
    expect(
      problem(parseReviewRecord(withPrior({ round: 9, unchangedIds: 'x', carried: 'x' })))?.message,
    ).toBe('The saved carry-over round is invalid.');
    expect(
      problem(parseReviewRecord(withPrior({ unchangedIds: 'x', carried: 'x' })))?.message,
    ).toBe('Saved unchanged hunk ids are not an array.');
    expect(problem(parseReviewRecord(withPrior({ carried: 'x', goneCount: -1 })))?.message).toBe(
      'Saved carried decisions must be a plain object.',
    );
  });
});

describe('parseReviewRecord carry-over dismissal', () => {
  it.each([['yes'], [1], [null]])('rejects a dismissal of %s', (dismissed) => {
    expect(problem(parseReviewRecord(record({ carryoverDismissed: dismissed })))).toEqual({
      code: 'invalid-field',
      message: 'Saved carry-over dismissal is invalid.',
    });
  });
});

describe('serializeReviewRecord', () => {
  it('rejects a record that does not validate', () => {
    expect(problem(serializeReviewRecord({ ...parsedRecord(), label: 'x'.repeat(81) }))).toEqual({
      code: 'invalid-field',
      message: 'Saved review text exceeds its limit.',
    });
  });

  it('refuses a record whose text form exceeds the record cap', () => {
    const decisions = Object.fromEntries(
      Array.from({ length: 800 }, (_unused, index) => [
        keyFor(index),
        { decision: 'approved', comment: 'x'.repeat(2_000) },
      ]),
    );
    expect(problem(serializeReviewRecord(parsedRecord({ decisions })))).toEqual({
      code: 'too-large',
      message: 'The review record is too large to save.',
    });
  });
});

describe('parsePrefs and serializePrefs', () => {
  const prefs = { theme: 'dark', shortcutsEnabled: false, autoAdvance: true, rememberDiff: true };

  it('accepts an object or its text form and returns a fresh object in a fixed order', () => {
    const parsed = parsePrefs({
      rememberDiff: true,
      autoAdvance: true,
      shortcutsEnabled: false,
      theme: 'dark',
    });
    expect(parsed).toEqual({ ok: true, value: prefs });
    expect(parsed.ok && Object.keys(parsed.value)).toEqual([
      'theme',
      'shortcutsEnabled',
      'autoAdvance',
      'rememberDiff',
    ]);
    expect(parsePrefs(JSON.stringify(prefs))).toEqual({ ok: true, value: prefs });
    expect(parsePrefs(nullPrototype(prefs)).ok).toBe(true);
  });

  it.each([
    [
      'an unknown key',
      { ...prefs, extra: 1 },
      'invalid-field',
      'Saved preferences contain an unknown key.',
    ],
    [
      'a prototype key',
      JSON.parse('{"__proto__":1}') as unknown,
      'invalid-field',
      'Saved preferences contain an unknown key.',
    ],
    ['an unknown theme', { ...prefs, theme: 'blue' }, 'invalid-field', 'Saved theme is invalid.'],
    ['a missing theme', { ...prefs, theme: undefined }, 'invalid-field', 'Saved theme is invalid.'],
    [
      'a text flag',
      { ...prefs, autoAdvance: 'yes' },
      'invalid-field',
      'Saved preferences contain an invalid value.',
    ],
    [
      'a missing flag',
      { ...prefs, rememberDiff: undefined },
      'invalid-field',
      'Saved preferences contain an invalid value.',
    ],
    [
      'a numeric flag',
      { ...prefs, shortcutsEnabled: 1 },
      'invalid-field',
      'Saved preferences contain an invalid value.',
    ],
    ['an array', [], 'corrupt', 'Saved review data is not an object.'],
    ['null', null, 'corrupt', 'Saved review data is not an object.'],
    ['text that is not JSON', '{', 'corrupt', 'Saved review data could not be read.'],
    [
      'oversized text',
      'x'.repeat(1_500_001),
      'too-large',
      'Saved review data is too large to read.',
    ],
  ])('rejects preferences with %s', (_label, input, code, message) => {
    expect(problem(parsePrefs(input))).toEqual({ code, message });
  });

  it('does not throw on a hostile object', () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('trap');
        },
      },
    );
    expect(problem(parsePrefs(hostile))).toEqual({
      code: 'corrupt',
      message: 'Saved preferences could not be read.',
    });
  });

  it('serializes in a fixed key order and exposes the defaults', () => {
    expect(DEFAULT_PREFS).toEqual({
      theme: 'system',
      shortcutsEnabled: true,
      autoAdvance: true,
      rememberDiff: true,
    });
    expect(serializePrefs(DEFAULT_PREFS)).toEqual({
      ok: true,
      value: '{"theme":"system","shortcutsEnabled":true,"autoAdvance":true,"rememberDiff":true}',
    });
  });

  it('refuses to serialize preferences that do not validate', () => {
    const invalid = { ...DEFAULT_PREFS, theme: 'blue' } as unknown as typeof DEFAULT_PREFS;
    expect(problem(serializePrefs(invalid))).toEqual({
      code: 'invalid-field',
      message: 'Saved theme is invalid.',
    });
  });
});
