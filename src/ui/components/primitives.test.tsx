import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiffFile, DiffLine, Hunk } from '../../core/types';
import { DiffTable } from './DiffTable';
import { ChevronIcon, Icon, type ChevronDirection, type IconName } from './Icons';
import { SafeText } from './SafeText';

afterEach(() => {
  cleanup();
});

function makeHunk(overrides: Partial<Hunk> = {}): Hunk {
  const lines: readonly DiffLine[] = [
    { kind: 'context', text: 'keep', oldNo: 10, newNo: 10 },
    { kind: 'remove', text: 'old', oldNo: 11, newNo: null },
    { kind: 'add', text: 'new', oldNo: null, newNo: 11, noEol: true },
  ];
  return {
    id: 'f00000000001:00000000001',
    fileId: 'f00000000001',
    index: 2,
    kind: 'text',
    meta: [],
    header: '@@ -10,2 +10,2 @@ function demo()',
    section: ' function demo()',
    oldStart: 10,
    oldCount: 2,
    newStart: 10,
    newCount: 2,
    lines,
    added: 1,
    removed: 1,
    truncated: false,
    countMismatch: false,
    hash: '00000000001',
    ...overrides,
  };
}

describe('Icon', () => {
  const names: readonly IconName[] = [
    'pending',
    'approved',
    'rejected',
    'risk-high',
    'risk-medium',
    'risk-low',
    'comment',
    'copy',
    'chevron',
    'unchanged',
    'new-or-changed',
    'info',
  ];

  it.each(names)('ICON-%s renders a decorative svg that keeps the caller class', (name) => {
    const { container } = render(<Icon name={name} className="probe" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('class')).toBe('probe');
    expect(svg?.querySelector('path, circle, rect')).not.toBeNull();
  });

  it.each([
    ['right', 'rotate(0 8 8)'],
    ['down', 'rotate(90 8 8)'],
    ['left', 'rotate(180 8 8)'],
    ['up', 'rotate(270 8 8)'],
  ] as const satisfies readonly (readonly [ChevronDirection, string])[])(
    'ICON-CHEVRON turns the %s chevron with %s',
    (direction, transform) => {
      const { container } = render(<Icon name="chevron" direction={direction} />);
      expect(container.querySelector('path')?.getAttribute('transform')).toBe(transform);
    },
  );

  it('ICON-CHEVRON points down by default', () => {
    const { container } = render(<ChevronIcon />);
    expect(container.querySelector('path')?.getAttribute('transform')).toBe('rotate(90 8 8)');
  });
});

describe('SafeText', () => {
  it('SAFE-TEXT keeps plain text as text and labels a hidden character', () => {
    render(<SafeText className="probe">{'plain\u{202E}text'}</SafeText>);
    const hidden = screen.getByRole('img', { name: /right-to-left override/i });
    expect(hidden.textContent).toBe('[U+202E]');
    expect(document.body.textContent).toBe('plain[U+202E]text');
    expect(document.querySelector('span.probe')).not.toBeNull();
  });

  it('SAFE-TEXT passes non-string children through unchanged', () => {
    render(
      <SafeText>
        <b>bold</b>
      </SafeText>,
    );
    expect(screen.getByText('bold').tagName).toBe('B');
  });
});

describe('DiffTable', () => {
  it('DIFF-TABLE uses the header text as the range and states where the hunk starts', () => {
    render(<DiffTable hunk={makeHunk()} filePath="src/a.ts" hunkNumber={3} totalHunks={7} />);
    const table = screen.getByRole<HTMLTableElement>('table');
    expect(table.caption?.textContent).toBe('Changes in src/a.ts, hunk 3 of 7');
    expect(screen.getByText('@@ -10,2 +10,2 @@ function demo()')).toBeTruthy();
    expect(screen.getByText('Starts at old line 10, new line 10.')).toBeTruthy();
  });

  it('DIFF-TABLE rebuilds the range from the counts when the hunk has no header', () => {
    render(<DiffTable hunk={makeHunk({ header: null })} filePath="src/a.ts" />);
    expect(screen.getByText('@@ -10,2 +10,2 @@ function demo()')).toBeTruthy();
  });

  it('DIFF-TABLE defaults the hunk number to the hunk index plus one', () => {
    render(<DiffTable hunk={makeHunk()} filePath="src/a.ts" />);
    expect(screen.getByRole<HTMLTableElement>('table').caption?.textContent).toBe(
      'Changes in src/a.ts, hunk 3 of 3',
    );
  });

  it('DIFF-TABLE names each change and the missing line numbers, and shows the no-EOL note', () => {
    render(<DiffTable hunk={makeHunk()} filePath="src/a.ts" className="extra" />);
    expect(screen.getByRole('table').getAttribute('class')).toBe('diff-table extra');
    expect(screen.getByText('unchanged')).toBeTruthy();
    expect(screen.getByText('removed')).toBeTruthy();
    expect(screen.getByText('added')).toBeTruthy();
    expect(screen.getAllByLabelText('No old line')).toHaveLength(1);
    expect(screen.getAllByLabelText('No new line')).toHaveLength(1);
    expect(screen.getByText('no newline at end of file')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });

  it('DIFF-TABLE names the table after the file, then a plain fallback', () => {
    const file: DiffFile = {
      id: 'f',
      displayPath: 'src/from-file.ts',
      oldPath: 'src/from-file.ts',
      newPath: 'src/from-file.ts',
      status: 'modified',
      similarity: null,
      oldMode: null,
      newMode: null,
      kind: 'regular',
      binary: false,
      generated: false,
      hunks: [],
      added: 0,
      removed: 0,
      incomplete: false,
    };
    const { rerender } = render(<DiffTable hunk={makeHunk()} file={file} />);
    expect(screen.getByRole<HTMLTableElement>('table').caption?.textContent).toContain(
      'Changes in src/from-file.ts',
    );

    rerender(<DiffTable hunk={makeHunk()} file={file} filePath="src/explicit.ts" />);
    expect(screen.getByRole<HTMLTableElement>('table').caption?.textContent).toContain(
      'Changes in src/explicit.ts',
    );

    rerender(<DiffTable hunk={makeHunk()} />);
    expect(screen.getByRole<HTMLTableElement>('table').caption?.textContent).toContain(
      'Changes in diff',
    );
  });
});
