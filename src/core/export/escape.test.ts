import { describe, expect, it } from 'vitest';
import { HIDDEN_SET } from '../risk/hidden';
import { escapeOutgoing, escapedCodePoint, mdInline, quoteComment } from './escape';

const MARKER = /\\u\{[0-9A-F]{4,6}\}/gu;

/** Everything left once the escape markers are removed. */
function visibleRemainder(value: string): string {
  return value.replace(MARKER, '');
}

describe('escapeOutgoing uses the shared HIDDEN_SET', () => {
  it('escapes every HIDDEN_SET code point, including U+2065 and the other format characters', () => {
    expect(HIDDEN_SET.has(0x2065)).toBe(true);
    for (const codePoint of HIDDEN_SET) {
      const escaped = escapeOutgoing(`a${String.fromCodePoint(codePoint)}b`, true);
      expect(escaped).toBe(`a${escapedCodePoint(codePoint)}b`);
    }
  });

  it('escapes every general-category format, control and separator character', () => {
    const whitespace = new Set([0x09, 0x0a]);
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        continue;
      }
      const character = String.fromCodePoint(codePoint);
      if (!/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(character) || whitespace.has(codePoint)) {
        continue;
      }
      expect(escapeOutgoing(character), codePoint.toString(16)).toBe(escapedCodePoint(codePoint));
    }
  });

  it('leaves ordinary text, emoji and the neighbours of each range alone', () => {
    for (const outside of [
      0x20, 0x41, 0xa0, 0xe9, 0x202f, 0x205f, 0x2070, 0xfffc, 0xe0080, 0x1f600,
    ]) {
      const character = String.fromCodePoint(outside);
      expect(escapeOutgoing(character), outside.toString(16)).toBe(character);
    }
  });

  it('leaves no HIDDEN_SET code point in the output of any input', () => {
    const everything = Array.from(HIDDEN_SET, (codePoint) => String.fromCodePoint(codePoint)).join(
      'x',
    );
    const escaped = visibleRemainder(escapeOutgoing(`${everything}\n\t`, true));
    expect(
      Array.from(escaped).every((character) => !HIDDEN_SET.has(character.codePointAt(0) ?? 0)),
    ).toBe(true);
  });
});

describe('escapeOutgoing', () => {
  it('keeps tab and line feed as layout in multiline mode only', () => {
    expect(escapeOutgoing('a\tb\nc')).toBe('a\tb\nc');
    expect(escapeOutgoing('a\tb\nc', true)).toBe('a\\u{0009}b\\u{000A}c');
    expect(escapeOutgoing('a\tb\nc', { multiline: false })).toBe('a\\u{0009}b\\u{000A}c');
    expect(escapeOutgoing('a\tb\nc', false)).toBe('a\tb\nc');
  });

  it('escapes carriage returns, separators, tag characters and lone surrogates', () => {
    expect(escapeOutgoing('a\rb')).toBe('a\\u{000D}b');
    expect(escapeOutgoing('a\u2028b\u2029c')).toBe('a\\u{2028}b\\u{2029}c');
    expect(escapeOutgoing(`x${String.fromCodePoint(0xe0041)}`)).toBe('x\\u{E0041}');
    expect(escapeOutgoing('\ud800')).toBe('\\u{D800}');
    expect(escapeOutgoing('\u{1f600}')).toBe('\u{1f600}');
  });

  it('formats escaped code points with at least four upper-case hex digits', () => {
    expect(escapedCodePoint(0x9)).toBe('\\u{0009}');
    expect(escapedCodePoint(0xe0041)).toBe('\\u{E0041}');
  });
});

describe('mdInline and quoteComment', () => {
  it('wraps in one more backtick than the longest run, capped at 200', () => {
    expect(mdInline('plain')).toBe('`plain`');
    expect(mdInline('a`b')).toBe('``a`b``');
    expect(mdInline('`'.repeat(300))).toBe(
      `${'`'.repeat(200)}${'`'.repeat(300)}${'`'.repeat(200)}`,
    );
  });

  it('escapes newlines inside a span and pipes only for table cells', () => {
    expect(mdInline('a\nb')).toBe('`a\\u{000A}b`');
    expect(mdInline('a|b')).toBe('`a|b`');
    expect(mdInline('a|b', true)).toBe('`a\\|b`');
  });

  it('prefixes every line of a comment with a quote marker', () => {
    expect(quoteComment('one\ntwo\n')).toBe('> one\n> two\n> ');
  });
});
