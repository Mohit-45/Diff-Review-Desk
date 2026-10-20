import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Declaration = { readonly property: string; readonly value: string };
type Rule = {
  readonly selectors: readonly string[];
  readonly declarations: readonly Declaration[];
  readonly context: readonly string[];
};

const ROOT = join(import.meta.dirname, '..');
const STYLES = join(ROOT, 'src/styles');
const TABLE_TAGS = 'table|caption|thead|tbody|tfoot|tr|th|td|col|colgroup';

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Splits on a separator that is not inside parentheses, quotes or brackets. */
function splitOutside(text: string, separator: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const char of text) {
    if (quote !== '') {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === ']') {
      depth -= 1;
    } else if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function parseDeclarations(body: string): readonly Declaration[] {
  return splitOutside(body, ';').flatMap((chunk) => {
    const colon = chunk.indexOf(':');
    if (colon < 0) return [];
    return [
      {
        property: chunk.slice(0, colon).trim().toLowerCase(),
        value: chunk
          .slice(colon + 1)
          .trim()
          .replace(/\s+/g, ' '),
      },
    ];
  });
}

/** Flattens @layer and @media wrappers; the stylesheets use no nested style rules. */
function parseRules(css: string, context: readonly string[] = []): readonly Rule[] {
  const rules: Rule[] = [];
  const text = stripComments(css);
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('{', index);
    if (open < 0) break;
    let depth = 1;
    let close = open + 1;
    while (close < text.length && depth > 0) {
      if (text[close] === '{') depth += 1;
      if (text[close] === '}') depth -= 1;
      close += 1;
    }
    const prelude = (text.slice(index, open).split(';').pop() ?? '').trim();
    const inner = text.slice(open + 1, close - 1);
    if (prelude.startsWith('@')) {
      rules.push(...parseRules(inner, [...context, prelude.replace(/\s+/g, ' ')]));
    } else {
      rules.push({
        selectors: splitOutside(prelude, ',').map((selector) =>
          selector.trim().replace(/\s+/g, ' '),
        ),
        declarations: parseDeclarations(inner),
        context,
      });
    }
    index = close;
  }
  return rules;
}

function declarationsOf(rule: Rule, property: string): readonly string[] {
  return rule.declarations.filter((item) => item.property === property).map((item) => item.value);
}

/** The compound selector that the rule actually styles, without pseudo-classes. */
function subject(selector: string): string {
  const compounds = splitOutside(selector.replace(/\s*([>+~])\s*/g, ' $1 '), ' ').filter(
    (part) => part !== '' && !['>', '+', '~'].includes(part),
  );
  return (compounds.at(-1) ?? '').replace(/:{1,2}[a-z-]+(\([^)]*\))?/gi, '');
}

function isTableSubject(selector: string): boolean {
  return new RegExp(`^(${TABLE_TAGS})(?![a-z0-9-])`, 'i').test(subject(selector));
}

function findColorLiterals(rules: readonly Rule[]): readonly string[] {
  const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
  return rules.flatMap((rule) =>
    rule.declarations
      .filter((item) => literal.test(item.value))
      .map((item) => `${rule.selectors.join(', ')} { ${item.property}: ${item.value} }`),
  );
}

function findBareOutlineRemovals(rules: readonly Rule[]): readonly string[] {
  const removes = (rule: Rule) =>
    rule.declarations.some(
      (item) =>
        (item.property === 'outline' && /^(none|0)\b/.test(item.value)) ||
        (item.property === 'outline-style' && item.value === 'none'),
    );
  const replacements = rules.filter(
    (rule) =>
      !removes(rule) &&
      rule.selectors.some((selector) => selector.includes(':focus-visible')) &&
      rule.declarations.some((item) => item.property.startsWith('outline')),
  );
  return rules.filter(removes).flatMap((rule) =>
    rule.selectors
      .filter((selector) => {
        const base = selector.replace(/:focus-visible|:focus/g, '');
        return !replacements.some((replacement) =>
          replacement.selectors.some((candidate) => candidate === `${base}:focus-visible`),
        );
      })
      .map((selector) => `${selector} removes the outline`),
  );
}

function findTableDisplay(rules: readonly Rule[]): readonly string[] {
  return rules
    .filter((rule) => rule.selectors.some(isTableSubject))
    .filter((rule) => declarationsOf(rule, 'display').length > 0)
    .map((rule) => rule.selectors.join(', '));
}

function findSrOnlyOnTableElements(rules: readonly Rule[]): readonly string[] {
  return rules.flatMap((rule) =>
    rule.selectors
      .filter((selector) => {
        const last = subject(selector);
        return last.includes('.sr-only') && new RegExp(`^(${TABLE_TAGS})\\b`, 'i').test(last);
      })
      .map((selector) => selector),
  );
}

const OVERFLOW_ALLOWED = [/\.review-rail\b/, /#export-preview\b/, /Export preview/];

function findDisallowedOverflow(rules: readonly Rule[]): readonly string[] {
  return rules
    .filter((rule) =>
      rule.declarations.some(
        (item) => /^overflow(-[xy])?$/.test(item.property) && /\b(auto|scroll)\b/.test(item.value),
      ),
    )
    .filter(
      (rule) =>
        !rule.selectors.every((selector) =>
          OVERFLOW_ALLOWED.some((allowed) => allowed.test(selector)),
        ),
    )
    .map((rule) => rule.selectors.join(', '));
}

const sources = readdirSync(STYLES)
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => ({ name, css: readFileSync(join(STYLES, name), 'utf8') }));
const tokenCss = sources.find((source) => source.name === 'tokens.css')?.css ?? '';
const nonTokenRules = sources
  .filter((source) => source.name !== 'tokens.css')
  .flatMap((source) => parseRules(source.css));
const allRules = sources.flatMap((source) => parseRules(source.css));

describe('static CSS checkers catch what they are meant to catch', () => {
  it('flags hex and rgb colours', () => {
    expect(
      findColorLiterals(parseRules('a { color: #fff; border: 1px solid rgb(0 0 0) }')),
    ).toHaveLength(2);
    expect(
      findColorLiterals(parseRules('a { color: var(--fg); outline: 2px solid Highlight }')),
    ).toEqual([]);
  });

  it('ignores id selectors that look like hex', () => {
    expect(findColorLiterals(parseRules('#bad { color: var(--fg) }'))).toEqual([]);
  });

  it('flags outline removal without a focus-visible replacement', () => {
    expect(findBareOutlineRemovals(parseRules('a:focus { outline: none }'))).toHaveLength(1);
    expect(
      findBareOutlineRemovals(
        parseRules('a:focus { outline: none } a:focus-visible { outline: 2px solid red }'),
      ),
    ).toEqual([]);
  });

  it('flags display on table elements', () => {
    expect(findTableDisplay(parseRules('.t td { display: block }'))).toHaveLength(1);
    expect(findTableDisplay(parseRules('table { display: grid }'))).toHaveLength(1);
    expect(
      findTableDisplay(parseRules('.sr-only { display: block } .box { display: grid }')),
    ).toEqual([]);
  });

  it('flags .sr-only on table elements', () => {
    expect(findSrOnlyOnTableElements(parseRules('th.sr-only { position: absolute }'))).toHaveLength(
      1,
    );
    expect(
      findSrOnlyOnTableElements(parseRules('caption .sr-only { position: absolute }')),
    ).toEqual([]);
  });

  it('flags overflow auto or scroll outside the allowed selectors', () => {
    expect(findDisallowedOverflow(parseRules('.hunk { overflow: auto }'))).toHaveLength(1);
    expect(findDisallowedOverflow(parseRules('.x { overflow-x: scroll }'))).toHaveLength(1);
    expect(findDisallowedOverflow(parseRules('.review-rail { overflow: auto }'))).toEqual([]);
    expect(findDisallowedOverflow(parseRules('#export-preview { overflow: auto }'))).toEqual([]);
    expect(findDisallowedOverflow(parseRules('.hunk { overflow: hidden }'))).toEqual([]);
  });

  it('reads rules inside layers and media queries', () => {
    const rules = parseRules('@layer a { @media (x) { p { color: red } } }');
    expect(rules[0]?.context).toEqual(['@layer a', '@media (x)']);
  });
});

describe('stylesheets', () => {
  it('finds the three expected files', () => {
    expect(sources.map((source) => source.name)).toEqual(
      expect.arrayContaining(['base.css', 'forced-colors.css', 'tokens.css']),
    );
  });

  it('keeps every hex and rgb() colour in tokens.css', () => {
    expect(findColorLiterals(nonTokenRules)).toEqual([]);
  });

  it('never removes an outline without a :focus-visible replacement', () => {
    expect(findBareOutlineRemovals(allRules)).toEqual([]);
  });

  it('never sets display on table elements', () => {
    expect(findTableDisplay(allRules)).toEqual([]);
  });

  it('never applies .sr-only to table elements in CSS', () => {
    expect(findSrOnlyOnTableElements(allRules)).toEqual([]);
  });

  it('never applies .sr-only to table elements in markup', () => {
    const files = readdirSync(join(ROOT, 'src/ui'), { recursive: true, withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name),
      )
      .map((entry) => join(entry.parentPath, entry.name));
    const offenders = files.filter((file) =>
      new RegExp(`<(${TABLE_TAGS})\\b[^>]*sr-only`).test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('allows overflow auto or scroll only on the rail and the export preview', () => {
    expect(findDisallowedOverflow(allRules)).toEqual([]);
  });

  it('keeps hover styles inside @media (hover: hover)', () => {
    const outside = allRules
      .filter((rule) => rule.selectors.some((selector) => selector.includes(':hover')))
      .filter((rule) => !rule.context.some((entry) => /\(hover:\s*hover\)/.test(entry)));
    expect(outside.map((rule) => rule.selectors.join(', '))).toEqual([]);
  });

  it('allows no shadow except on dialogs, and no gradients or blur', () => {
    const shadows = allRules
      .filter((rule) => declarationsOf(rule, 'box-shadow').some((value) => value !== 'none'))
      .map((rule) => rule.selectors.join(', '));
    expect(shadows).toEqual(['dialog']);
    const everything = allRules.flatMap((rule) =>
      rule.declarations.map((item) => item.value + item.property),
    );
    expect(everything.filter((value) => /gradient\(|blur\(|backdrop-filter/.test(value))).toEqual(
      [],
    );
  });

  it('transitions only colour and opacity, in 150ms or less', () => {
    const fade = /--fade:\s*(\d+)ms/.exec(tokenCss)?.[1];
    expect(Number(fade)).toBeLessThanOrEqual(150);
    const allowed = new Set([
      'color',
      'background-color',
      'border-color',
      'outline-color',
      'opacity',
    ]);
    for (const rule of allRules) {
      for (const value of declarationsOf(rule, 'transition')) {
        for (const part of splitOutside(value, ',')) {
          const [property, duration] = part.trim().split(' ');
          expect(allowed.has(property ?? ''), `${rule.selectors.join(', ')}: ${part}`).toBe(true);
          const milliseconds =
            duration === 'var(--fade)' ? Number(fade) : Number.parseFloat(duration ?? '0');
          expect(milliseconds, `${rule.selectors.join(', ')}: ${part}`).toBeLessThanOrEqual(150);
        }
      }
    }
  });

  it('never enables smooth scrolling and zeroes transitions under reduced motion', () => {
    const smooth = allRules.filter((rule) =>
      declarationsOf(rule, 'scroll-behavior').some((value) => value.startsWith('smooth')),
    );
    expect(smooth).toEqual([]);
    const reduced = allRules.filter((rule) =>
      rule.context.some((entry) => entry.includes('prefers-reduced-motion: reduce')),
    );
    expect(
      reduced.some((rule) =>
        declarationsOf(rule, 'transition-duration').some((value) => value.startsWith('0s')),
      ),
    ).toBe(true);
  });

  it('defines .sr-only as visually hidden without a display value', () => {
    const rule = allRules.find((candidate) => candidate.selectors.includes('.sr-only'));
    expect(rule).toBeDefined();
    if (rule === undefined) return;
    expect(declarationsOf(rule, 'position')).toEqual(['absolute']);
    expect(declarationsOf(rule, 'overflow')).toEqual(['hidden']);
    expect(declarationsOf(rule, 'display')).toEqual([]);
  });

  it('wraps diff code and keeps line numbers out of selection', () => {
    const code = allRules.find((rule) => rule.selectors.includes('.diff-code'));
    expect(code && declarationsOf(code, 'white-space')).toEqual(['pre-wrap']);
    expect(code && declarationsOf(code, 'overflow-wrap')).toEqual(['anywhere']);
    const gutter = allRules.find((rule) => rule.selectors.includes('.diff-line-number'));
    expect(gutter && declarationsOf(gutter, 'user-select')).toEqual(['none']);
  });

  it('sizes dialogs as the spec says', () => {
    const dialog = allRules.find((rule) => rule.selectors.includes('dialog'));
    expect(dialog && declarationsOf(dialog, 'inline-size')).toEqual(['min(40rem, 100% - 2rem)']);
    expect(dialog && declarationsOf(dialog, 'max-block-size')).toEqual(['100dvh']);
  });
});

describe('forced-colors.css', () => {
  const forced = parseRules(
    sources.find((source) => source.name === 'forced-colors.css')?.css ?? '',
  ).filter((rule) => rule.context.some((entry) => entry === '@media (forced-colors: active)'));

  function find(fragment: string) {
    return forced.filter((rule) => rule.selectors.some((selector) => selector.includes(fragment)));
  }

  it('has a forced-colors: active block', () => {
    expect(forced.length).toBeGreaterThan(0);
  });

  it('paints pressed buttons Highlight on HighlightText', () => {
    const rules = find("[aria-pressed='true']");
    expect(rules.some((rule) => declarationsOf(rule, 'background').includes('Highlight'))).toBe(
      true,
    );
    expect(rules.some((rule) => declarationsOf(rule, 'color').includes('HighlightText'))).toBe(
      true,
    );
  });

  it('gives the current hunk and file a 4px inline-start Highlight border', () => {
    for (const fragment of ['.hunk[aria-current]', '.file-list-row[aria-current]']) {
      const rules = find(fragment);
      expect(
        rules.some((rule) =>
          declarationsOf(rule, 'border-inline-start').includes('4px solid Highlight'),
        ),
        fragment,
      ).toBe(true);
    }
  });

  it('draws the progress fill in Highlight on a Canvas track with a CanvasText border', () => {
    const fill = find('.review-progress-fill');
    expect(fill.some((rule) => declarationsOf(rule, 'background').includes('Highlight'))).toBe(
      true,
    );
    const track = find('.review-progress-bar');
    expect(track.some((rule) => declarationsOf(rule, 'background').includes('Canvas'))).toBe(true);
    expect(
      track.some((rule) => declarationsOf(rule, 'border').includes('1px solid CanvasText')),
    ).toBe(true);
  });

  it('gives chips and banners a 1px solid border and never border none', () => {
    const rules = [...find('.chip'), ...find('.banner')];
    expect(
      rules.some((rule) => declarationsOf(rule, 'border').includes('1px solid CanvasText')),
    ).toBe(true);
    const none = forced.filter((rule) =>
      rule.declarations.some(
        (item) => item.property.startsWith('border') && /\bnone\b/.test(item.value),
      ),
    );
    expect(none).toEqual([]);
  });

  it('focuses with outline, not box-shadow', () => {
    const rules = find(':focus-visible');
    expect(
      rules.some((rule) => declarationsOf(rule, 'outline').includes('2px solid Highlight')),
    ).toBe(true);
    expect(rules.some((rule) => declarationsOf(rule, 'box-shadow').includes('none'))).toBe(true);
  });
});
