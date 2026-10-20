import { describe, expect, it } from 'vitest';
import { P0_RULES } from './rules/registry';

// SPEC 8, regex safety: checked over RegExp.source so no rule regex can backtrack badly.
const MAX_BOUNDED_REPEAT = 128;
const MAX_UNBOUNDED_QUANTIFIERS = 2;

type Group = { hasAlternation: boolean };

type ShapeState = {
  readonly problems: string[];
  readonly groups: Group[];
  unbounded: number;
  lastAtom: 'none' | 'atom' | 'group';
  lastGroupHadAlternation: boolean;
  /** The previous atom carried an unbounded quantifier and nothing has come between. */
  afterUnbounded: boolean;
  atomFollowsUnbounded: boolean;
};

const QUANTIFIER_BRACES = /^\{(\d+)(?:(,)(\d*))?\}/;

function skipClass(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length && source[index] !== ']') {
    index += source[index] === '\\' ? 2 : 1;
  }
  return index + 1;
}

function skipEscape(source: string, start: number, state: ShapeState): number {
  const next = source[start + 1] ?? '';
  if (/[1-9]/.test(next) || (next === 'k' && source[start + 2] === '<')) {
    state.problems.push('backreference');
  }
  const braced = (next === 'p' || next === 'P' || next === 'u') && source[start + 2] === '{';
  return braced ? source.indexOf('}', start) + 1 : start + 2;
}

function openGroup(source: string, start: number, state: ShapeState): number {
  state.groups.push({ hasAlternation: false });
  state.lastAtom = 'none';
  state.afterUnbounded = false;
  if (source[start + 1] !== '?') {
    return start + 1;
  }
  if (source.startsWith('(?<=', start) || source.startsWith('(?<!', start)) {
    state.problems.push('lookbehind');
    return start + 4;
  }
  if (source.startsWith('(?<', start)) {
    return source.indexOf('>', start) + 1;
  }
  return start + 3;
}

function closeGroup(state: ShapeState): void {
  const group = state.groups.pop();
  state.lastGroupHadAlternation = group?.hasAlternation ?? false;
  state.lastAtom = 'group';
  state.afterUnbounded = false;
}

function beginAtom(state: ShapeState): void {
  state.atomFollowsUnbounded = state.afterUnbounded;
  state.afterUnbounded = false;
  state.lastAtom = 'atom';
}

function applyQuantifier(
  state: ShapeState,
  quantifier: { readonly text: string; readonly unbounded: boolean; readonly max: number },
): void {
  if (state.lastAtom === 'group') {
    state.problems.push(`quantifier on a group: ${quantifier.text}`);
    if (state.lastGroupHadAlternation) {
      state.problems.push('alternation inside a quantified group');
    }
  }
  if (quantifier.max > MAX_BOUNDED_REPEAT && !quantifier.unbounded) {
    state.problems.push(`repeat above ${String(MAX_BOUNDED_REPEAT)}: ${quantifier.text}`);
  }
  if (quantifier.unbounded) {
    state.unbounded += 1;
    if (state.atomFollowsUnbounded) {
      state.problems.push(`adjacent unbounded quantifiers: ${quantifier.text}`);
    }
  }
  state.afterUnbounded = quantifier.unbounded;
}

/** Lists every way `source` breaks the SPEC 8 regex-safety shape; empty when it conforms. */
function shapeProblems(source: string): readonly string[] {
  const state: ShapeState = {
    problems: [],
    groups: [],
    unbounded: 0,
    lastAtom: 'none',
    lastGroupHadAlternation: false,
    afterUnbounded: false,
    atomFollowsUnbounded: false,
  };
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const braces = character === '{' ? QUANTIFIER_BRACES.exec(source.slice(index)) : null;
    if (character === '(') {
      index = openGroup(source, index, state);
    } else if (character === ')') {
      closeGroup(state);
      index += 1;
    } else if (character === '|') {
      const group = state.groups[state.groups.length - 1];
      if (group !== undefined) {
        group.hasAlternation = true;
      }
      state.lastAtom = 'none';
      state.afterUnbounded = false;
      index += 1;
    } else if (character === '*' || character === '+' || character === '?' || braces !== null) {
      const text = braces?.[0] ?? character ?? '';
      const unbounded =
        character === '*' || character === '+' || (braces?.[2] === ',' && braces[3] === '');
      const max = braces === null ? 1 : Number(braces[3] || braces[1]);
      applyQuantifier(state, { text, unbounded, max });
      index += text.length;
      index += source[index] === '?' ? 1 : 0;
    } else {
      beginAtom(state);
      if (character === '[') {
        index = skipClass(source, index);
      } else {
        index = character === '\\' ? skipEscape(source, index, state) : index + 1;
      }
    }
  }
  if (state.unbounded > MAX_UNBOUNDED_QUANTIFIERS) {
    state.problems.push(`${String(state.unbounded)} unbounded quantifiers`);
  }
  return state.problems;
}

describe('the regex-shape checker itself', () => {
  it.each([
    ['(ab)+', 'quantifier on a group'],
    ['(?:ab)?', 'quantifier on a group'],
    ['(a|b)*', 'alternation inside a quantified group'],
    ['(?:a|b){2}', 'alternation inside a quantified group'],
    ['a+b+', 'adjacent unbounded quantifiers'],
    ['\\d+\\d{2,}', 'adjacent unbounded quantifiers'],
    ['a+b?c*d+', '3 unbounded quantifiers'],
    ['a{1,200}', 'repeat above 128'],
    ['a{129}', 'repeat above 128'],
    ['(a)\\1', 'backreference'],
    ['(?<n>a)\\k<n>', 'backreference'],
    ['(?<=a)b', 'lookbehind'],
    ['(?<!a)b', 'lookbehind'],
  ])('rejects %s', (source, expected) => {
    expect(shapeProblems(source).join(' | ')).toContain(expected);
  });

  it.each([
    'abc|def',
    '[a-z]{1,64}',
    'a+\\.b*',
    'a+b?c*',
    'x{128}',
    '(?:ab|cd)',
    '(?=a)b',
    '[\\p{Cc}\\u200b-\\u200f]',
    '\\p{Cf}+',
    '\\u{1F600}x',
    '[+*?]+x',
    'a*?b',
  ])('accepts %s', (source) => {
    expect(shapeProblems(source)).toEqual([]);
  });
});

describe('rule regexes are linear-safe (SPEC 8)', () => {
  const patterns = P0_RULES.flatMap((rule) =>
    rule.pattern === undefined ? [] : [{ id: rule.id, source: rule.pattern.source }],
  );

  it('covers every shipped rule that declares a pattern', () => {
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.map((pattern) => pattern.id)).toEqual(
      P0_RULES.filter((rule) => rule.pattern !== undefined).map((rule) => rule.id),
    );
  });

  it.each(patterns)('$id', ({ source }) => {
    expect(shapeProblems(source)).toEqual([]);
  });
});

describe('no regex runs over diff content in the risk engine (SPEC 8)', () => {
  const sources = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  const regexUse = [
    /\bnew\s+RegExp\s*\(/,
    /\bRegExp\s*\(/,
    /\.(?:test|exec)\s*\(/,
    /\.(?:match|matchAll|replace|replaceAll|search|split)\s*\(\s*\//,
  ];

  it('reads the engine sources', () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining(['./secrets.ts', './hidden.ts', './rules/registry.ts']),
    );
  });

  it.each(Object.entries(sources))('%s never executes a regex', (_path, source) => {
    for (const pattern of regexUse) {
      expect(source, String(pattern)).not.toMatch(pattern);
    }
  });
});
