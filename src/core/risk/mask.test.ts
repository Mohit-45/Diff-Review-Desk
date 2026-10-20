import { describe, expect, it } from 'vitest';
import type { HiddenSpan } from './hidden';
import {
  cutSegments,
  maskEvidence,
  mergeVisualSegments,
  visualizeLines,
  visualizeText,
  type VisualTextSegment,
} from './mask';
import type { SecretSpan } from './secrets';

const RLO = String.fromCodePoint(0x202e);
const AWS = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

function varied(length: number): string {
  const alphabet = 'aBcD1eFgH2iJkL3mN';
  return Array.from({ length }, (_unused, index) => alphabet[index % alphabet.length]).join('');
}

describe('visualizeText segments', () => {
  it('splits text, a masked secret and a hidden character in order', () => {
    expect(visualizeText(`x ${AWS}${RLO} y`)).toEqual([
      { kind: 'text', text: 'x ' },
      {
        kind: 'masked',
        text: 'AKIA****[24]',
        length: 20,
        ariaLabel: 'Masked secret, 20 characters',
      },
      {
        kind: 'hidden',
        codePoint: 'U+202E',
        label: 'right-to-left override',
        ariaLabel: 'U+202E right-to-left override',
      },
      { kind: 'text', text: ' y' },
    ]);
  });

  it('absorbs a hidden character that sits inside a masked block', () => {
    const block = `-----BEGIN PRIVATE KEY-----\nab${RLO}cd\n-----END PRIVATE KEY-----`;
    const segments = visualizeText(block);
    expect(segments).toEqual([
      {
        kind: 'masked',
        text: '[REDACTED:secret-known-token]',
        length: block.length,
        ariaLabel: `Masked secret, ${String(block.length)} characters`,
      },
    ]);
    expect(JSON.stringify(segments)).not.toContain(RLO);
  });

  it('masks a whole line with no prefix when the file itself is sensitive', () => {
    expect(visualizeText('SECRET=abc', { sensitive: true })).toEqual([
      {
        kind: 'masked',
        text: '[REDACTED:sensitive-file-added]',
        length: 10,
        ariaLabel: 'Masked secret, 10 characters',
      },
    ]);
    expect(visualizeText('x', { sensitive: true, ruleId: 'secret-known-token' })[0]).toMatchObject({
      text: '[REDACTED:secret-known-token]',
    });
  });

  it('shows no character of an assignment value and a rounded length for prefixed tokens', () => {
    const [assignment] = visualizeText('password = "correct-horse-battery"').filter(
      (segment) => segment.kind === 'masked',
    );
    expect(assignment).toMatchObject({ text: '[REDACTED:secret-assignment]', length: 21 });
    const lengths = [20, 21, 36, 41].map((body) => {
      const token = `ghp_${varied(body)}`;
      return visualizeText(token).find((segment) => segment.kind === 'masked');
    });
    expect(lengths.map((segment) => (segment?.kind === 'masked' ? segment.text : ''))).toEqual([
      'ghp_****[24]',
      'ghp_****[32]',
      'ghp_****[40]',
      'ghp_****[48]',
    ]);
  });

  it('uses supplied secret spans and hidden scan options instead of scanning', () => {
    expect(visualizeText(`a${AWS}b`, { secretSpans: [] })).toEqual([
      { kind: 'text', text: `a${AWS}b` },
    ]);
    const joiner = `\u{1f600}${String.fromCodePoint(0x200d)}\u{1f600}`;
    expect(visualizeText(joiner)).toHaveLength(1);
    expect(visualizeText(joiner, { hiddenOptions: { allowBenignExemptions: false } })).toHaveLength(
      3,
    );
  });
});

describe('maskEvidence', () => {
  it('prints hidden characters as bracketed code points and masked values by their label', () => {
    expect(maskEvidence(`a${RLO}b ${AWS}`)).toBe('a[U+202E]b AKIA****[24]');
  });

  it('cuts plain text by code point without splitting an emoji', () => {
    expect(maskEvidence('ab\u{1f600}cd', { maxChars: 3 })).toBe('ab\u{1f600}');
    expect(maskEvidence('abcdef', { maxChars: 4 })).toBe('abcd');
  });

  it('keeps a masked value whole or drops it, never part of it', () => {
    expect(maskEvidence(`x ${AWS}`, { maxChars: 14 })).toBe('x AKIA****[24]');
    expect(maskEvidence(`x ${AWS}`, { maxChars: 13 })).toBe('x ');
  });

  it('defaults to the 160 character excerpt limit', () => {
    expect(maskEvidence('y'.repeat(200))).toHaveLength(160);
  });
});

const PEM_BEGIN = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const PEM_END = ['-----END', 'PRIVATE KEY-----'].join(' ');
const PEM_BODY = ['MIIEvQIBADANBgkqhkiG9w0BAQEFAASC', 'BKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj'].join('');

function maskedText(segments: readonly VisualTextSegment[]): readonly string[] {
  return segments.flatMap((segment) => (segment.kind === 'masked' ? [segment.text] : []));
}

function plainText(segments: readonly VisualTextSegment[]): string {
  return segments.map((segment) => (segment.kind === 'text' ? segment.text : '')).join('');
}

describe('MASK-LINES visualizeLines masks a whole hunk', () => {
  it('masks a private key from its BEGIN line to its END line and shows the text around it', () => {
    const lines = visualizeLines(['before', PEM_BEGIN, PEM_BODY, PEM_END, 'after']);

    expect(plainText(lines[0] ?? [])).toBe('before');
    for (const index of [1, 2, 3]) {
      expect(maskedText(lines[index] ?? [])).toEqual(['[REDACTED:secret-known-token]']);
      expect(plainText(lines[index] ?? [])).toBe('');
    }
    expect(plainText(lines[4] ?? [])).toBe('after');
    expect(JSON.stringify(lines)).not.toContain(PEM_BODY);
  });

  it('masks to the last line when the key never closes', () => {
    const lines = visualizeLines([PEM_BEGIN, PEM_BODY, PEM_BODY, '']);

    expect(lines.slice(0, 3).every((segments) => maskedText(segments).length === 1)).toBe(true);
    expect(lines[3]).toEqual([]);
    expect(JSON.stringify(lines)).not.toContain(PEM_BODY);
  });

  it('keeps showing what follows the END marker on the same line, and scans it for secrets', () => {
    const lines = visualizeLines([PEM_BEGIN, `${PEM_END} then ${AWS}`]);

    expect(maskedText(lines[1] ?? [])).toEqual(['[REDACTED:secret-known-token]', 'AKIA****[24]']);
    expect(plainText(lines[1] ?? [])).toBe(' then ');
  });

  it('does not let a certificate or a public key open a masked block', () => {
    const certificate = ['-----BEGIN', 'CERTIFICATE-----'].join(' ');
    const lines = visualizeLines([certificate, PEM_BODY]);

    expect(plainText(lines[1] ?? [])).toBe(PEM_BODY);
  });

  it('masks every non-empty line of a sensitive file and leaves empty lines empty', () => {
    const lines = visualizeLines(['KEY=abc', '', 'x'], { sensitive: true });

    expect(maskedText(lines[0] ?? [])).toEqual(['[REDACTED:sensitive-file-added]']);
    expect(lines[1]).toEqual([]);
    expect(maskedText(lines[2] ?? [])).toEqual(['[REDACTED:sensitive-file-added]']);
  });

  it('masks a hidden character inside a sensitive line instead of showing a chip', () => {
    const [segments] = visualizeLines([`a${RLO}b`], { sensitive: true });

    expect(segments?.every((segment) => segment.kind === 'masked')).toBe(true);
  });

  it('shows secrets as typed on reveal but still turns hidden characters into chips', () => {
    const lines = visualizeLines([`${AWS}${RLO}`, PEM_BEGIN], { reveal: true });

    expect(lines[0]).toEqual([
      { kind: 'text', text: AWS },
      {
        kind: 'hidden',
        codePoint: 'U+202E',
        label: 'right-to-left override',
        ariaLabel: 'U+202E right-to-left override',
      },
    ]);
    expect(plainText(lines[1] ?? [])).toBe(PEM_BEGIN);
    const sensitive = visualizeLines(['KEY=abc'], { sensitive: true, reveal: true });
    expect(sensitive[0]).toEqual([{ kind: 'text', text: 'KEY=abc' }]);
  });
});

describe('MASK-CUT cutSegments keeps a cut line safe', () => {
  it('cuts plain text at the limit and reports how much of the source it kept', () => {
    const cut = cutSegments(visualizeText('abcdefgh'), 3);

    expect(cut.segments).toEqual([{ kind: 'text', text: 'abc' }]);
    expect(cut.shownUnits).toBe(3);
  });

  it('never splits a surrogate pair', () => {
    const text = `x${'\u{1f600}'.repeat(600)}`;
    const cut = cutSegments(visualizeText(text), 1000);

    expect(cut.shownUnits).toBe(999);
    expect(cut.segments).toEqual([{ kind: 'text', text: text.slice(0, 999) }]);
  });

  it('keeps a masked value that starts before the cut whole, never half shown', () => {
    const text = `${'a'.repeat(994)} ${AWS} tail`;
    const cut = cutSegments(visualizeText(text), 1000);

    expect(maskedText(cut.segments)).toEqual(['AKIA****[24]']);
    expect(plainText(cut.segments)).toBe(`${'a'.repeat(994)} `);
    expect(cut.shownUnits).toBe(995 + AWS.length);
    expect(JSON.stringify(cut.segments)).not.toContain(AWS);
  });

  it('keeps everything when the line is within the limit', () => {
    const segments = visualizeText(`a${RLO}b`);
    const cut = cutSegments(segments, 10);

    expect(cut.segments).toEqual(segments);
    expect(cut.shownUnits).toBe(3);
  });
});

/** Counts how often each element of a span list is read, which is the merge's work. */
function counted<T>(items: readonly T[]): { readonly list: readonly T[]; reads: () => number } {
  let reads = 0;
  const list = new Proxy([...items], {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) {
        reads += 1;
      }
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  return { list, reads: () => reads };
}

function spansFor(count: number): { secrets: SecretSpan[]; hidden: HiddenSpan[]; text: string } {
  const secrets: SecretSpan[] = [];
  const hidden: HiddenSpan[] = [];
  let text = '';
  for (let index = 0; index < count; index += 1) {
    const start = text.length;
    text += `ab${AWS}${RLO}`;
    secrets.push({
      start: start + 2,
      end: start + 2 + AWS.length,
      kind: 'known-token',
      ruleId: 'secret-known-token',
      publicPrefix: 'AKIA',
    });
    hidden.push({
      start: start + 2 + AWS.length,
      end: start + 3 + AWS.length,
      codePoint: 0x202e,
      codePointText: 'U+202E',
      label: 'right-to-left override',
    });
  }
  return { secrets, hidden, text };
}

describe('MASK-LINEAR the merge reads each span a bounded number of times', () => {
  it('does work proportional to the span count, and keeps the text whole', () => {
    const work: number[] = [];
    for (const count of [1_000, 2_000, 4_000]) {
      const { secrets, hidden, text } = spansFor(count);
      const secretReads = counted(secrets);
      const hiddenReads = counted(hidden);
      const segments = mergeVisualSegments(text, secretReads.list, hiddenReads.list);

      expect(segments).toHaveLength(count * 3);
      work.push(secretReads.reads() + hiddenReads.reads());
      expect(work.at(-1) ?? 0).toBeLessThanOrEqual(count * 12);
    }
    expect(work[1]).toBeLessThanOrEqual((work[0] ?? 0) * 2.1);
    expect(work[2]).toBeLessThanOrEqual((work[1] ?? 0) * 2.1);
  });

  it('masks every token of a 5 MB line and leaves the text between them', () => {
    const chunk = `${'q'.repeat(400)} ${AWS} `;
    const text = chunk.repeat(Math.ceil((5 * 1024 * 1024) / chunk.length));
    const segments = visualizeText(text);
    const tokens = text.length / chunk.length;

    expect(text.length).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(maskedText(segments)).toHaveLength(tokens);
    expect(
      segments.map((segment) => (segment.kind === 'text' ? segment.text.length : 0)),
    ).toSatisfy(
      (sizes: readonly number[]) => sizes.reduce((sum, size) => sum + size, 0) === tokens * 402,
    );
    expect(JSON.stringify(segments.slice(0, 4))).not.toContain(AWS);
  });
});
