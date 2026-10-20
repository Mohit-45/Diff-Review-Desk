import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WIDE_RAIL } from './useWideRail';

const STYLES = join(import.meta.dirname, '../styles');
const base = readFileSync(join(STYLES, 'base.css'), 'utf8');
const forced = readFileSync(join(STYLES, 'forced-colors.css'), 'utf8');

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
}

/** The declarations of every rule whose selector list is exactly `selector`. */
function declarations(css: string, selector: string): string[] {
  const pattern = new RegExp(`(?:^|[{};\\s])${escaped(selector)}\\s*\\{([^}]*)\\}`, 'g');
  return Array.from(css.matchAll(pattern), (match) => (match[1] ?? '').replace(/\s+/g, ' ').trim());
}

describe('UI-CSS-CHIP the risk chip never splits its severity word', () => {
  it('keeps the severity span at its own width on one line', () => {
    const rules = declarations(base, '.risk-chip > span:first-of-type').join(' ');
    expect(rules).toContain('flex: none');
    expect(rules).toContain('white-space: nowrap');
  });

  it('lets the message beside it shrink and wrap', () => {
    expect(declarations(base, '.risk-chip > span + span').join(' ')).toContain(
      'min-inline-size: 0',
    );
  });
});

describe('UI-CSS-LOAD-DIALOG the Load dialog is padded like the others', () => {
  it('pads the body with the same space as .dialog-content, and less on a phone', () => {
    const content = declarations(base, '.dialog-content').join(' ');
    expect(content).toContain('padding: var(--space-6)');
    expect(declarations(base, '.load-dialog').join(' ')).toContain('padding: var(--space-6)');
    const narrow = base.slice(base.indexOf('/* ---------- Skip links, dialogs'));
    expect(declarations(narrow, '.load-dialog').join(' ')).toContain('padding: var(--space-4)');
  });
});

describe('UI-CSS-DISCLOSURE the Files disclosure and the rail share one breakpoint', () => {
  it('hides the summary only at the size where the rail is a sticky column', () => {
    expect(base).toContain(
      `@media ${WIDE_RAIL} {\n    .rail-disclosure > summary {\n      display: none;`,
    );
    expect(base).toContain(`@media ${WIDE_RAIL} {\n    .review-layout {`);
  });

  it('has a toggle target of at least the target size and a chevron that turns when open', () => {
    expect(declarations(base, '.rail-disclosure > summary').join(' ')).toContain(
      'min-block-size: var(--target)',
    );
    expect(declarations(base, '.rail-disclosure[open] > summary::before').join(' ')).toContain(
      'rotate(45deg)',
    );
  });

  it('keeps the summary readable in forced colors', () => {
    expect(forced).toContain('.rail-disclosure > summary');
  });
});

describe('UI-CSS-SKIP the skip links are hidden until they have focus', () => {
  it('spells out the button look on top of .skip-link, and shows it on focus', () => {
    expect(declarations(base, '.skip-link').join(' ')).toContain('translateY(-300%)');
    expect(declarations(base, '.skip-link:focus').join(' ')).toContain('translateY(0)');
    expect(declarations(base, 'button.skip-link').join(' ')).toContain(
      'border-color: var(--accent)',
    );
  });
});
