import { describe, expect, it } from 'vitest';
import { findHiddenSpans, hiddenLabel, isHiddenCodePoint } from './hidden';

const cp = (value: number): string => String.fromCodePoint(value);
const ZWJ = cp(0x200d);
const ZWNJ = cp(0x200c);
const BOM = cp(0xfeff);
const LRM = cp(0x200e);
const RLO = cp(0x202e);
const EMOJI = cp(0x1f600);
const VARIATION_SUPPLEMENT = cp(0xe0100);

function codePoints(text: string, options?: Parameters<typeof findHiddenSpans>[1]): number[] {
  return findHiddenSpans(text, options).map((span) => span.codePoint);
}

describe('findHiddenSpans', () => {
  it('reports each hidden code point with its position, text form and label', () => {
    const [span] = findHiddenSpans(`a${RLO}b`);
    expect(span).toEqual({
      start: 1,
      end: 2,
      codePoint: 0x202e,
      codePointText: 'U+202E',
      label: 'right-to-left override',
    });
    expect(hiddenLabel(0x200b)).toBe('zero width space');
    expect(hiddenLabel(0x0001)).toBe('hidden or control character');
  });

  it('measures astral code points as two UTF-16 units', () => {
    const tag = cp(0xe0041);
    expect(findHiddenSpans(`x${tag}y`)).toEqual([
      {
        start: 1,
        end: 3,
        codePoint: 0xe0041,
        codePointText: 'U+E0041',
        label: 'hidden or control character',
      },
    ]);
  });

  it('leaves tab and line feed alone but reports other controls', () => {
    expect(isHiddenCodePoint(0x09)).toBe(false);
    expect(isHiddenCodePoint(0x0a)).toBe(false);
    expect(codePoints('a\tb\nc\rd\u0000e')).toEqual([0x0d, 0x00]);
  });
});

describe('benign exemptions', () => {
  it('exempts a byte order mark only at the very start of line 1 of a new file', () => {
    const options = { isNewFile: true, lineNumber: 1 };
    expect(codePoints(`${BOM}text`, options)).toEqual([]);
    expect(codePoints(`x${BOM}text`, options)).toEqual([0xfeff]);
    expect(codePoints(`${BOM}text`, { isNewFile: true, lineNumber: 2 })).toEqual([0xfeff]);
    expect(codePoints(`${BOM}text`, { isNewFile: false, lineNumber: 1 })).toEqual([0xfeff]);
    expect(codePoints(`${BOM}text`)).toEqual([0xfeff]);
  });

  it('exempts directional marks in text', () => {
    expect(codePoints(`a${LRM}b${cp(0x200f)}c`)).toEqual([]);
  });

  it('exempts joiners next to emoji or inside Arabic, Hebrew and Indic text', () => {
    expect(codePoints(`${EMOJI}${ZWJ}${EMOJI}`)).toEqual([]);
    expect(codePoints(`a${ZWJ}${EMOJI}`)).toEqual([]);
    expect(codePoints(`${cp(0x0627)}${ZWNJ}${cp(0x0628)}`)).toEqual([]);
    expect(codePoints(`${cp(0x05d0)}${ZWJ}x`)).toEqual([]);
    expect(codePoints(`${cp(0x0915)}${ZWJ}${cp(0x0937)}`)).toEqual([]);
  });

  it('reports joiners between ordinary characters', () => {
    expect(codePoints(`a${ZWJ}b`)).toEqual([0x200d]);
    expect(codePoints(ZWNJ)).toEqual([0x200c]);
  });

  it('exempts a supplementary variation selector only after an emoji', () => {
    expect(codePoints(`${EMOJI}${VARIATION_SUPPLEMENT}`)).toEqual([]);
    expect(codePoints(`a${VARIATION_SUPPLEMENT}`)).toEqual([0xe0100]);
    expect(codePoints(VARIATION_SUPPLEMENT)).toEqual([0xe0100]);
  });

  it('never exempts bidi overrides, even next to an emoji', () => {
    expect(codePoints(`${EMOJI}${RLO}${EMOJI}`)).toEqual([0x202e]);
  });

  it('applies no exemption to paths or when exemptions are switched off', () => {
    const text = `${EMOJI}${ZWJ}${EMOJI}${LRM}${BOM}`;
    expect(codePoints(text, { isPath: true })).toEqual([0x200d, 0x200e, 0xfeff]);
    expect(codePoints(text, { allowBenignExemptions: false })).toEqual([0x200d, 0x200e, 0xfeff]);
    expect(codePoints(text, { allowBenignExemptions: true })).toEqual([0xfeff]);
  });
});
