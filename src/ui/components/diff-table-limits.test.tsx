import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parsedFiles } from '../../app/appFixtures';
import { LIMITS } from '../../core/limits';
import type { DiffFile, Hunk } from '../../core/types';
import { FAKE, longHunkDiff, longLine, oneLineDiff, secretsDiff } from '../diffFixtures';
import { DiffTable } from './DiffTable';

afterEach(() => {
  cleanup();
});

const RLO = String.fromCodePoint(0x202e);

function firstHunk(text: string, path?: string): { file: DiffFile; hunk: Hunk } {
  const files = parsedFiles(text).files;
  const file = path === undefined ? files[0] : files.find((item) => item.displayPath === path);
  const hunk = file?.hunks[0];
  if (file === undefined || hunk === undefined) throw new Error('The fixture has no such hunk.');
  return { file, hunk };
}

function attributeValues(root: Element): string {
  return [root, ...root.querySelectorAll('*')]
    .flatMap((element) => Array.from(element.attributes).map((attribute) => attribute.value))
    .join('\n');
}

function lineRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('tr.diff-line'));
}

describe('DIFF-MASK display masking reaches every line kind', () => {
  it('DIFF-MASK-KINDS masks a known token on added, removed and context lines', () => {
    const text = [
      'diff --git a/src/k.ts b/src/k.ts',
      'index 1111111..2222222 100644',
      '--- a/src/k.ts',
      '+++ b/src/k.ts',
      '@@ -1,3 +1,3 @@',
      ` const ctx = "${FAKE.awsKey}";`,
      `-const old = "${FAKE.awsKey}";`,
      `+const next = "${FAKE.awsKey}";`,
      '',
    ].join('\n');
    const { file, hunk } = firstHunk(text);
    const { container } = render(<DiffTable hunk={hunk} file={file} />);

    expect(container.innerHTML).not.toContain(FAKE.awsKey);
    expect(attributeValues(container)).not.toContain(FAKE.awsKey);
    expect(
      within(container).getAllByRole('img', { name: 'Masked secret, 20 characters' }),
    ).toHaveLength(3);
    expect(container.textContent).toContain('AKIA****[24]');
  });

  it('DIFF-MASK-PEM masks a private key across lines, keeps text after END, and hides the body', () => {
    const { file, hunk } = firstHunk(secretsDiff(), 'certs/deploy.txt');
    const { container } = render(<DiffTable hunk={hunk} file={file} />);

    expect(container.innerHTML).not.toContain(FAKE.pemBodyOne);
    expect(container.innerHTML).not.toContain(FAKE.pemBodyTwo);
    const rows = lineRows(container);
    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 4).every((row) => row.querySelector('[role="img"]') !== null)).toBe(true);
    expect(rows[4]?.textContent).toContain('after the key');
  });

  it('DIFF-MASK-SENSITIVE masks every line of .env, a deleted .env and a pem file, never .env.example', () => {
    for (const path of ['.env', 'old/.env']) {
      const { file, hunk } = firstHunk(secretsDiff(), path);
      const { container, unmount } = render(<DiffTable hunk={hunk} file={file} />);
      const text = container.textContent;

      expect(text).not.toContain(FAKE.envValue);
      expect(text).not.toContain(FAKE.deletedEnvValue);
      expect(text).not.toContain('visible-setting');
      expect(lineRows(container).every((row) => row.textContent.includes('[REDACTED:'))).toBe(true);
      unmount();
    }
    const example = firstHunk(oneLineDiff('config/.env.example', 'API_URL=http://localhost'));
    const { container } = render(<DiffTable hunk={example.hunk} file={example.file} />);
    expect(container.textContent).toContain('API_URL=http://localhost');
  });

  it('DIFF-MASK-SECTION masks the @@ section text of a sensitive file', () => {
    const base = firstHunk(secretsDiff(), '.env');
    const hunk: Hunk = {
      ...base.hunk,
      header: `@@ -1 +1 @@ ${FAKE.envValue}=1`,
      section: FAKE.envValue,
    };
    const { container } = render(<DiffTable hunk={hunk} file={base.file} />);

    expect(container.innerHTML).not.toContain(FAKE.envValue);
    expect(container.querySelector('.diff-range')?.textContent).toContain('@@ -1 +1 @@');
  });

  it('DIFF-REVEAL shows the raw text once revealed, but hidden characters stay chips', () => {
    const { file, hunk } = firstHunk(secretsDiff(), 'src/config.ts');
    const { container, rerender } = render(<DiffTable hunk={hunk} file={file} />);
    expect(container.innerHTML).not.toContain(FAKE.awsKey);
    expect(container.innerHTML).not.toContain(FAKE.assignValue);

    rerender(<DiffTable hunk={hunk} file={file} revealed />);

    expect(container.textContent).toContain(FAKE.awsKey);
    expect(container.textContent).toContain(FAKE.assignValue);
    expect(container.innerHTML).not.toContain(RLO);
    expect(
      within(container).getByRole('img', { name: 'U+202E right-to-left override' }).textContent,
    ).toBe('[U+202E]');
    expect(container.querySelector('[role="img"][aria-label^="Masked"]')).toBeNull();
  });

  it('DIFF-REVEAL-SENSITIVE reveals a sensitive file line by line text', () => {
    const { file, hunk } = firstHunk(secretsDiff(), '.env');
    const { container } = render(<DiffTable hunk={hunk} file={file} revealed />);

    expect(container.textContent).toContain(`DB_PASSWORD=${FAKE.envValue}`);
  });
});

describe('DIFF-LONG lines over the limit are cut', () => {
  it('DIFF-LONG-CUT cuts a 100,000 character line at 1,000 and offers the rest', () => {
    const text = longLine(100_000);
    const { file, hunk } = firstHunk(oneLineDiff('src/long.ts', text));
    const { container } = render(<DiffTable hunk={hunk} file={file} />);
    const cell = container.querySelector<HTMLElement>('td.diff-code');
    const button = screen.getByRole('button', { name: 'Show 99000 more characters' });

    expect(cell?.querySelector('code')?.textContent).toBe(text.slice(0, LIMITS.maxLineChars));
    fireEvent.click(button);

    expect(container.querySelector('td.diff-code code')?.textContent).toBe(text);
    expect(screen.queryByRole('button', { name: /more characters/ })).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('td.diff-code'));
  });

  it('DIFF-LONG-PAIR never splits a surrogate pair at the cut', () => {
    const text = `x${'\u{1f600}'.repeat(2000)}`;
    const { file, hunk } = firstHunk(oneLineDiff('src/emoji.ts', text));
    const { container } = render(<DiffTable hunk={hunk} file={file} />);
    const shown = container.querySelector('td.diff-code code')?.textContent ?? '';

    expect(shown).toBe(text.slice(0, 999));
    expect(
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(shown),
    ).toBe(false);
    expect(
      screen.getByRole('button', { name: `Show ${String(text.length - 999)} more characters` }),
    ).toBeTruthy();
  });

  it('DIFF-LONG-MASK never shows part of a secret that straddles the cut', () => {
    const text = `${'a'.repeat(990)} ${FAKE.awsKey} ${'b'.repeat(200)}`;
    const { file, hunk } = firstHunk(oneLineDiff('src/straddle.ts', text));
    const { container } = render(<DiffTable hunk={hunk} file={file} />);

    expect(container.innerHTML).not.toContain(FAKE.awsKey.slice(0, 6));
    expect(container.textContent).toContain('AKIA****[24]');
  });

  it('DIFF-LONG-SHORT leaves a line of exactly 1,000 characters whole', () => {
    const text = longLine(LIMITS.maxLineChars);
    const { file, hunk } = firstHunk(oneLineDiff('src/edge.ts', text));
    const { container } = render(<DiffTable hunk={hunk} file={file} />);

    expect(container.querySelector('td.diff-code code')?.textContent).toBe(text);
    expect(screen.queryByRole('button', { name: /more characters/ })).toBeNull();
  });
});

describe('DIFF-PAGE hunks over 500 lines page by 500', () => {
  it('DIFF-PAGE-FIRST renders 500 rows of a 1,200 line hunk, and the pager says so', () => {
    const { file, hunk } = firstHunk(longHunkDiff('src/p.ts', 1200));
    const { container } = render(<DiffTable hunk={hunk} file={file} />);

    expect(lineRows(container)).toHaveLength(500);
    expect(screen.getByText('Showing 500 of 1200 lines.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Show next 500 lines (700 remaining)' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show all 700 remaining lines' })).toBeTruthy();
  });

  it('DIFF-PAGE-NEXT adds one page and hands focus to the first new row', () => {
    const { file, hunk } = firstHunk(longHunkDiff('src/p.ts', 1200));
    const { container } = render(<DiffTable hunk={hunk} file={file} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show next 500 lines (700 remaining)' }));

    const rows = lineRows(container);
    expect(rows).toHaveLength(1000);
    expect(document.activeElement).toBe(rows[500]);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 200 remaining lines' }));
    expect(lineRows(container)).toHaveLength(1200);
    expect(document.activeElement).toBe(lineRows(container)[1000]);
    expect(screen.queryByRole('group', { name: 'More lines' })).toBeNull();
  });

  it('DIFF-PAGE-ALL reveals at most 5,000 more lines per Show all', { timeout: 30_000 }, () => {
    const { file, hunk } = firstHunk(longHunkDiff('src/huge.ts', 6200));
    const { container } = render(<DiffTable hunk={hunk} file={file} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show next 5000 lines (5700 remaining)' }));

    expect(lineRows(container)).toHaveLength(5500);
    expect(screen.getByText('Showing 5500 of 6200 lines.')).toBeTruthy();
    expect(document.activeElement).toBe(lineRows(container)[500]);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 700 remaining lines' }));
    expect(lineRows(container)).toHaveLength(6200);
  });

  it('DIFF-PAGE-BOUND draws the same number of rows however long the hunk is', () => {
    const drawn = [600, 5_000, 50_000].map((count) => {
      const { file, hunk } = firstHunk(longHunkDiff('src/b.ts', count));
      const { container, unmount } = render(<DiffTable hunk={hunk} file={file} />);
      const rows = lineRows(container).length;
      unmount();
      return rows;
    });

    expect(drawn).toEqual([500, 500, 500]);
  });

  it('DIFF-PAGE-FULL shows a hunk of exactly 500 lines without a pager', () => {
    const { file, hunk } = firstHunk(longHunkDiff('src/e.ts', 500));
    const { container } = render(<DiffTable hunk={hunk} file={file} />);

    expect(lineRows(container)).toHaveLength(500);
    expect(screen.queryByRole('group', { name: 'More lines' })).toBeNull();
  });
});
