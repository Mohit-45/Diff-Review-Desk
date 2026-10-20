import { describe, expect, it } from 'vitest';
import { analyze } from './engine';
import { findHiddenSpans, hasHiddenSpan } from './hidden';
import { fileWithAddedLines } from './riskFixtures';
import { readScanWork, resetScanWork } from './scanWork';
import { findSecretSpans } from './secrets';

const SMALL = 16_384;
const LARGE = 4 * SMALL;
/** Passes over the text that findSecretSpans makes, with headroom; quadratic work would be thousands. */
const WORK_PER_CHARACTER = 64;
const GROWTH_FOR_FOUR_TIMES_INPUT = 4.5;

// Fragments are built from pieces so no token-shaped literal sits in this file.
const ADVERSARIAL_UNITS: readonly string[] = [
  'AKIA',
  ['gh', 'p_'].join(''),
  'sk-',
  ['sk', '-ant-'].join(''),
  ['xo', 'xb-'].join(''),
  'npm_',
  'github_pat_',
  '://',
  '@',
  '://a:b@',
  '-----BEGIN ',
  ['-----BEGIN ', 'PRIVATE', ' KEY-----'].join(''),
  ['-----BEGIN ', 'PRIVATE', ' KEY-----', 'x'].join(''),
  'api_key=',
  'token="',
  "secret = '",
  'eyJ',
  'eyJabcd.',
  'eyJabcd.abcd.',
  ['https://hooks.', 'slack.com/services/'].join(''),
  ['https://discord.', 'com/api/webhooks/'].join(''),
  'authorization:bearer ',
  'authorization',
];

type Shape = { readonly name: string; readonly build: (unit: string, size: number) => string };

const SHAPES: readonly Shape[] = [
  { name: 'repeated', build: (unit, size) => unit.repeat(Math.ceil(size / unit.length)) },
  {
    name: 'repeated then a long non-matching run',
    build: (unit, size) => unit.repeat(Math.ceil(size / (4 * unit.length))) + 'z'.repeat(size),
  },
  {
    name: 'each prefix followed by a short run',
    build: (unit, size) => `${unit}qqqqqqq`.repeat(Math.ceil(size / (unit.length + 7))),
  },
  { name: 'one prefix then a long run', build: (unit, size) => unit + 'z'.repeat(size) },
];

function workOf(run: () => unknown): number {
  resetScanWork();
  run();
  return readScanWork();
}

describe('findSecretSpans is linear over the whole line (SPEC 8, 13)', () => {
  for (const shape of SHAPES) {
    it.each(ADVERSARIAL_UNITS)(`${shape.name}: %s`, (unit) => {
      const small = shape.build(unit, SMALL);
      const large = shape.build(unit, LARGE);
      const smallWork = workOf(() => findSecretSpans(small));
      const largeWork = workOf(() => findSecretSpans(large));
      expect(largeWork).toBeLessThanOrEqual(WORK_PER_CHARACTER * large.length);
      expect(largeWork / smallWork).toBeLessThanOrEqual(GROWTH_FOR_FOUR_TIMES_INPUT);
    });
  }

  it('keeps finding the secrets that sit inside an adversarial prefix flood', () => {
    const token = `${['gh', 'p_'].join('')}${'aBcD1eFgH2iJkL3mN'.repeat(3)}`;
    const flood = 'AKIA'.repeat(8_000);
    const text = `${flood} ${token} ${flood}`;
    const spans = findSecretSpans(text);
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]?.start, spans[0]?.end)).toBe(token);
  });

  it('answers a PEM block that closes after a flood of unclosed headers', () => {
    const header = ['-----BEGIN ', 'PRIVATE', ' KEY-----'].join('');
    const footer = ['-----END ', 'PRIVATE', ' KEY-----'].join('');
    const text = `${header.repeat(2_000)}body${footer}tail`;
    const spans = findSecretSpans(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.start).toBe(0);
    expect(text.slice(spans[0]?.end)).toBe('tail');
  });

  it('treats a flood of webhook markers as one URL that ends at its terminator', () => {
    const marker = ['https://hooks.', 'slack.com/services/'].join('');
    const text = `"${marker.repeat(1_000)}abc" tail`;
    const spans = findSecretSpans(text);
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]?.start, spans[0]?.end)).toBe(`${marker.repeat(1_000)}abc`);
  });

  it('keeps span offsets aligned when lowercasing would change the text length', () => {
    const dotted = String.fromCodePoint(0x130);
    const marker = ['https://hooks.', 'slack.com/services/'].join('');
    const text = `${dotted}${dotted} ${marker}T01/B02/xyz`;
    const spans = findSecretSpans(text);
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]?.start, spans[0]?.end)).toBe(`${marker}T01/B02/xyz`);
    const assignment = `${dotted}${dotted} password = 'correct-horse-battery'`;
    const found = findSecretSpans(assignment);
    expect(assignment.slice(found[0]?.start, found[0]?.end)).toBe('correct-horse-battery');
  });
});

describe('the hidden-Unicode scan is linear over the whole line (SPEC 8, 13)', () => {
  const overrides = String.fromCodePoint(0x202e);
  const joiner = String.fromCodePoint(0x200d);
  const shapes: readonly { readonly name: string; readonly build: (size: number) => string }[] = [
    { name: 'a run of bidi overrides', build: (size) => overrides.repeat(size) },
    {
      name: 'a run of benign joiners after an emoji',
      build: (size) => `\u{1f600}${joiner.repeat(size)}`,
    },
    {
      name: 'sparse hidden characters in text',
      build: (size) => `ab${overrides}`.repeat(size / 3),
    },
    { name: 'no hidden characters', build: (size) => 'a'.repeat(size) },
  ];

  it.each(shapes)('$name', ({ build }) => {
    const smallWork = workOf(() => findHiddenSpans(build(SMALL)));
    const largeWork = workOf(() => findHiddenSpans(build(LARGE)));
    expect(largeWork).toBeLessThanOrEqual(2 * LARGE);
    expect(largeWork / smallWork).toBeLessThanOrEqual(GROWTH_FOR_FOUR_TIMES_INPUT);
  });

  it('stops at the first hidden character when only presence matters', () => {
    const text = `ab${overrides}${'a'.repeat(LARGE)}`;
    expect(workOf(() => hasHiddenSpan(text))).toBeLessThanOrEqual(3);
    expect(hasHiddenSpan(text)).toBe(true);
    expect(hasHiddenSpan('plain text')).toBe(false);
  });
});

describe('analyze stays linear on a very long added line (SPEC 8)', () => {
  it('does bounded work for every rule on one adversarial line', () => {
    const line = (size: number): string =>
      ADVERSARIAL_UNITS.map((unit) =>
        unit.repeat(Math.ceil(size / ADVERSARIAL_UNITS.length / unit.length)),
      ).join('');
    const small = line(SMALL);
    const large = line(LARGE);
    const smallWork = workOf(() => analyze([fileWithAddedLines('src/long.ts', [small])]));
    const largeWork = workOf(() => analyze([fileWithAddedLines('src/long.ts', [large])]));
    // Secret rules plus masking of the evidence each scan the line a fixed number of times.
    expect(largeWork).toBeLessThanOrEqual(4 * WORK_PER_CHARACTER * large.length);
    expect(largeWork / smallWork).toBeLessThanOrEqual(GROWTH_FOR_FOUR_TIMES_INPUT);
  });

  it('still reports a secret and hidden text past the 20,000-character scan limit', () => {
    const token = `${['gh', 'p_'].join('')}${'aBcD1eFgH2iJkL3mN'.repeat(3)}`;
    const padding = 'q'.repeat(30_000);
    const text = `${padding} ${token} ${String.fromCodePoint(0x202e)}`;
    const ids = analyze([fileWithAddedLines('src/long.ts', [text])]).flags.map(
      (flag) => flag.ruleId,
    );
    expect(ids).toEqual(expect.arrayContaining(['secret-known-token', 'hidden-unicode']));
  });
});
