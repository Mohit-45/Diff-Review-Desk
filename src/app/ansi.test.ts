import { describe, expect, it } from 'vitest';
import { stripAnsiOnStructuralLines, stripAnsiSequences } from './ansi';

const ESC = '\u001B';
const BEL = '\u0007';

describe('stripAnsiSequences', () => {
  it.each([
    ['plain text', 'diff --git a/a b/a', 'diff --git a/a b/a'],
    ['a colour code', `${ESC}[1;31mred${ESC}[0m`, 'red'],
    ['a 256-colour code', `${ESC}[38;5;196mred`, 'red'],
    ['a bare final byte', `${ESC}[mx`, 'x'],
    ['a private parameter with an intermediate byte', `${ESC}[?25 qx`, 'x'],
    ['every final byte boundary', `${ESC}[@${ESC}[~x`, 'x'],
    ['an OSC ended by BEL', `${ESC}]0;title${BEL}x`, 'x'],
    ['an OSC ended by ESC backslash', `${ESC}]8;;link${ESC}\\x`, 'x'],
    ['an empty OSC', `${ESC}]${BEL}x`, 'x'],
    ['adjacent sequences', `${ESC}[1m${ESC}]0;t${BEL}${ESC}[0mx`, 'x'],
    ['sequences with text between them', `a${ESC}[1mb${ESC}[0mc`, 'abc'],
  ])('removes %s', (_label, input, expected) => {
    expect(stripAnsiSequences(input)).toBe(expected);
  });

  it.each([
    ['an escape at the end', `x${ESC}`],
    ['an escape before another character', `${ESC}x`],
    ['a CSI with no final byte', `${ESC}[12`],
    ['a CSI whose parameters follow its intermediates', `${ESC}[ 1m`],
    ['a CSI ended by a high byte', `${ESC}[1é`],
    ['a CSI with a control byte', `${ESC}[1\u001fm`],
    ['an unterminated OSC', `${ESC}]0;title`],
    ['an OSC with a lone escape', `${ESC}]0;title${ESC}x`],
    ['an OSC with a backslash but no escape', `${ESC}]0;title\\`],
    ['an OSC introducer alone', `${ESC}]`],
  ])('keeps %s', (_label, input) => {
    expect(stripAnsiSequences(input)).toBe(input);
  });

  it('ends an OSC at the first BEL, even when an ESC backslash comes earlier', () => {
    expect(stripAnsiSequences(`${ESC}]0;a${ESC}\\b${BEL}c${ESC}\\d`)).toBe(`c${ESC}\\d`);
  });

  it('ends an OSC at the last ESC backslash when no BEL follows', () => {
    expect(stripAnsiSequences(`${ESC}]0;a${ESC}\\b${ESC}\\c`)).toBe('c');
  });

  it('looks for the OSC terminator only after the introducer', () => {
    expect(stripAnsiSequences(`${BEL}${ESC}]0;title`)).toBe(`${BEL}${ESC}]0;title`);
    expect(stripAnsiSequences(`${ESC}\\${ESC}]0;title`)).toBe(`${ESC}\\${ESC}]0;title`);
    expect(stripAnsiSequences(`${ESC}\\${ESC}]0;title${BEL}x`)).toBe(`${ESC}\\x`);
  });

  it('resumes after a stray escape and handles surrogate pairs', () => {
    expect(stripAnsiSequences(`${ESC}x${ESC}[1my`)).toBe(`${ESC}xy`);
    expect(stripAnsiSequences(`${ESC}]0;\u{1F600}${BEL}y`)).toBe('y');
    expect(stripAnsiSequences(`${ESC}]0;\uD800${ESC}\\y`)).toBe('y');
    expect(stripAnsiSequences(`${ESC}[\u{1F600}m`)).toBe(`${ESC}[\u{1F600}m`);
  });

  it('keeps a line of many unterminated OSC introducers untouched', () => {
    const hostile = `${ESC}]`.repeat(100_000);
    expect(stripAnsiSequences(hostile)).toBe(hostile);
    expect(stripAnsiSequences(`${hostile}${BEL}x`)).toBe('x');
    expect(stripAnsiSequences(`${hostile}${ESC}\\x`)).toBe('x');
  });
});

describe('stripAnsiOnStructuralLines', () => {
  it('rewrites only escape-led lines that become structural and counts them', () => {
    const text = [
      `${ESC}[1mdiff --git a/a b/a${ESC}[m`,
      `${ESC}[32m+added${ESC}[m`,
      `${ESC}[36m@@ -1 +1 @@${ESC}[m`,
      ` ${ESC}[1m--- a/a`,
      '--- plain',
    ].join('\n');
    expect(stripAnsiOnStructuralLines(text)).toEqual({
      text: [
        'diff --git a/a b/a',
        `${ESC}[32m+added${ESC}[m`,
        '@@ -1 +1 @@',
        ` ${ESC}[1m--- a/a`,
        '--- plain',
      ].join('\n'),
      count: 2,
    });
  });

  it('returns the text unchanged with a zero count when nothing applies', () => {
    expect(stripAnsiOnStructuralLines('a\nb\n')).toEqual({ text: 'a\nb\n', count: 0 });
    expect(stripAnsiOnStructuralLines(`${ESC}[1mnot structural`)).toEqual({
      text: `${ESC}[1mnot structural`,
      count: 0,
    });
  });
});
