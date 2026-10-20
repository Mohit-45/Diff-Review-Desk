import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rgb = readonly [number, number, number];
type Scheme = 'light' | 'dark';
type Token = { readonly light: Rgb; readonly dark: Rgb };
type Pair = { readonly fg: string; readonly bg: string };

const tokensCss = readFileSync(join(import.meta.dirname, '../src/styles/tokens.css'), 'utf8');

/** Splits on commas that are not inside parentheses, so rgb(0 0 0 / 0.5) stays whole. */
function splitTopLevel(value: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

function parseColor(text: string): Rgb {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex?.[1] !== undefined) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (char) => char + char) : hex[1];
    return [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
    ];
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*[\d.]+\s*)?\)$/.exec(text);
  if (rgb?.[1] !== undefined && rgb[2] !== undefined && rgb[3] !== undefined) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  throw new Error(`Unparsable colour "${text}" in tokens.css`);
}

function parseTokens(css: string): ReadonlyMap<string, Token> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = new Map<string, Token>();
  for (const match of withoutComments.matchAll(/--([a-z0-9-]+):\s*light-dark\(([\s\S]*?)\);/g)) {
    const [name, body] = [match[1], match[2]];
    if (name === undefined || body === undefined) throw new Error('Malformed token declaration');
    const [light, dark, extra] = splitTopLevel(body);
    if (light === undefined || dark === undefined || extra !== undefined) {
      throw new Error(`--${name} must be light-dark(<light>, <dark>)`);
    }
    tokens.set(name, { light: parseColor(light), dark: parseColor(dark) });
  }
  // A colour declared outside light-dark() would dodge the scheme-aware checks below.
  for (const match of withoutComments.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]+|rgba?\()/gi)) {
    throw new Error(`--${match[1] ?? 'unknown'} must be declared with light-dark()`);
  }
  return tokens;
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: Rgb): number {
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** Unrounded WCAG 2.x contrast ratio. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  if (light === undefined || dark === undefined) throw new Error('unreachable');
  return (light + 0.05) / (dark + 0.05);
}

const tokens = parseTokens(tokensCss);

function colorOf(name: string, scheme: Scheme): Rgb {
  const token = tokens.get(name);
  if (token === undefined) throw new Error(`--${name} is missing from tokens.css`);
  return token[scheme];
}

function pairs(foregrounds: readonly string[], backgrounds: readonly string[]): readonly Pair[] {
  return foregrounds.flatMap((fg) => backgrounds.map((bg) => ({ fg, bg })));
}

const NEUTRAL = ['bg', 'bg-subtle', 'bg-muted'] as const;
const TINTS = ['accent-subtle', 'add-bg', 'remove-bg', 'warning-bg'] as const;
const GUTTERS = ['add-gutter', 'remove-gutter'] as const;
const SOLID_FILLS = [
  'accent',
  'accent-hover',
  'add-fg',
  'remove-fg',
  'danger',
  'danger-hover',
] as const;

/** Text needs 4.5:1. Each pair is a combination the stylesheet really paints. */
const TEXT_PAIRS: readonly Pair[] = [
  ...pairs(['fg', 'fg-muted'], [...NEUTRAL, ...TINTS, ...GUTTERS]),
  // fg-subtle is only for quiet text on the three neutral surfaces.
  ...pairs(['fg-subtle'], NEUTRAL),
  ...pairs(['add-fg'], [...NEUTRAL, 'add-bg']),
  ...pairs(['remove-fg', 'danger'], [...NEUTRAL, 'remove-bg']),
  ...pairs(['warning-fg'], [...NEUTRAL, 'warning-bg']),
  ...pairs(['accent'], [...NEUTRAL, 'accent-subtle']),
  ...pairs(['on-solid'], SOLID_FILLS),
];

/** Borders, focus rings and fills that carry state need 3:1. */
const NON_TEXT_PAIRS: readonly Pair[] = [
  ...pairs(['border-strong', 'accent'], NEUTRAL),
  ...pairs(['accent'], TINTS),
  ...pairs(['add-fg', 'remove-fg', 'accent'], ['track']),
];

const SCHEMES: readonly Scheme[] = ['light', 'dark'];

describe('contrast helper self-tests', () => {
  it('computes black on white as 21', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 10);
  });

  it('passes #767676 on white at 4.54', () => {
    const ratio = contrastRatio([0x76, 0x76, 0x76], [255, 255, 255]);
    expect(ratio).toBeCloseTo(4.54, 2);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('fails #777777 on white at 4.48', () => {
    const ratio = contrastRatio([0x77, 0x77, 0x77], [255, 255, 255]);
    expect(ratio).toBeCloseTo(4.48, 2);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe('tokens.css', () => {
  it('declares every colour token the spec lists', () => {
    const expected = [
      'bg',
      'bg-subtle',
      'bg-muted',
      'border',
      'border-strong',
      'track',
      'fg',
      'fg-muted',
      'fg-subtle',
      'on-solid',
      'accent',
      'accent-hover',
      'accent-subtle',
      'add-fg',
      'add-bg',
      'add-gutter',
      'remove-fg',
      'remove-bg',
      'remove-gutter',
      'warning-fg',
      'warning-bg',
      'danger',
      'danger-hover',
    ];
    expect(expected.filter((name) => !tokens.has(name))).toEqual([]);
  });

  it('keeps the starting values from the spec for the neutral surfaces', () => {
    expect(colorOf('bg', 'light')).toEqual([255, 255, 255]);
    expect(colorOf('bg', 'dark')).toEqual([0x0e, 0x11, 0x16]);
  });

  it('defines the explicit theme overrides', () => {
    expect(tokensCss).toContain('color-scheme: light dark;');
    expect(tokensCss).toContain(":root[data-theme='light']");
    expect(tokensCss).toContain(":root[data-theme='dark']");
  });
});

describe.each(SCHEMES)('%s scheme', (scheme) => {
  it.each(TEXT_PAIRS)('text $fg on $bg is at least 4.5:1', ({ fg, bg }) => {
    expect(contrastRatio(colorOf(fg, scheme), colorOf(bg, scheme))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('non-text $fg on $bg is at least 3:1', ({ fg, bg }) => {
    expect(contrastRatio(colorOf(fg, scheme), colorOf(bg, scheme))).toBeGreaterThanOrEqual(3);
  });
});
