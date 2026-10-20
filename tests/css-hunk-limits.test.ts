import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '..', 'src/styles/base.css'), 'utf8');

/** The declarations of every rule whose selector list is exactly `selector`, joined. */
function blockOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g');
  return Array.from(css.matchAll(pattern), (match) => match[1] ?? '').join('\n');
}

describe('LIMITS-CSS large diffs stay cheap to draw', () => {
  it('LIMITS-CSS-VISIBILITY skips off-screen hunk cards with content-visibility: auto', () => {
    const block = blockOf('.hunk');

    expect(block).toMatch(/content-visibility:\s*auto;/);
    expect(block).toMatch(/contain-intrinsic-block-size:\s*auto\s+\S+;/);
  });

  it('LIMITS-CSS-TOKENS styles the new controls with tokens only', () => {
    for (const selector of [
      '.file-limit',
      '.diff-paging',
      '.diff-more',
      '.hunk > .hunk-no-comment',
    ]) {
      expect(blockOf(selector), selector).not.toBe('');
      expect(blockOf(selector), selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    }
  });
});
