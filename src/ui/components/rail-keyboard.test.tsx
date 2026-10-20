import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, Hunk, ReviewState } from '../../core/types';
import { ShortcutHintsContext } from '../KeyHint';
import { FileList } from './FileList';
import {
  DEFAULT_REVIEW_FILTERS,
  Filters,
  createFilterContext,
  fileMatchesFilters,
  hunkMatchesFilters,
  type ReviewFilters,
} from './Filters';
import { ReviewRail } from './ReviewRail';

function makeHunk(id: string, fileId: string, index: number): Hunk {
  return {
    id,
    fileId,
    index,
    kind: 'text',
    meta: [],
    header: null,
    section: '',
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 1,
    lines: [],
    added: 1,
    removed: 0,
    truncated: false,
    countMismatch: false,
    hash: id,
  };
}

function makeFile(id: string, path: string, hunkIds: readonly string[]): DiffFile {
  return {
    id,
    displayPath: path,
    oldPath: path,
    newPath: path,
    status: 'modified',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated: false,
    hunks: hunkIds.map((hunkId, index) => makeHunk(hunkId, id, index)),
    added: 1,
    removed: 0,
    incomplete: false,
  };
}

const files = [makeFile('fa', 'src/a.ts', ['a1', 'a2']), makeFile('fb', 'docs/b.md', ['b1'])];

function state(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    fingerprint: 'f',
    round: 1,
    label: 'L',
    overallNote: '',
    hunks: {},
    hunkIds: ['a1', 'a2', 'b1'],
    prior: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('Filters keyboard behaviour', () => {
  it('FILTER-ESC clears the path on the first Esc and leaves on the second', () => {
    const onChange = vi.fn<(filters: ReviewFilters) => void>();
    const onLeave = vi.fn();
    const { rerender } = render(
      <Filters
        value={{ ...DEFAULT_REVIEW_FILTERS, path: 'src' }}
        onChange={onChange}
        onLeave={onLeave}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText('Path'), { key: 'Escape' });
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_REVIEW_FILTERS);
    expect(onLeave).not.toHaveBeenCalled();

    rerender(<Filters value={DEFAULT_REVIEW_FILTERS} onChange={onChange} onLeave={onLeave} />);
    fireEvent.keyDown(screen.getByLabelText('Path'), { key: 'Escape' });
    expect(onLeave).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Path'), { key: 'x' });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('FILTER-CLEAR hands focus to the path field when Clear filters removes itself', () => {
    const inputRef = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(
      <Filters
        value={{ ...DEFAULT_REVIEW_FILTERS, status: 'pending' }}
        onChange={onChange}
        inputRef={inputRef}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onChange).toHaveBeenCalledWith(DEFAULT_REVIEW_FILTERS);
    expect(document.activeElement).toBe(inputRef.current);
  });

  it('FILTER-OWN-REF focuses its own path field when no ref is supplied', () => {
    render(<Filters value={{ ...DEFAULT_REVIEW_FILTERS, risk: 'high' }} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(document.activeElement).toBe(screen.getByLabelText('Path'));
  });

  it('FILTER-HUNK applies path, status, risk and new-or-changed to a single hunk', () => {
    const [fileA, fileB] = files;
    if (fileA === undefined || fileB === undefined) throw new Error('fixture');
    const [a1] = fileA.hunks;
    if (a1 === undefined) throw new Error('fixture');
    const prior = {
      round: 1,
      unchangedIds: ['a2', 'b1'],
      carried: {},
      goneCount: 0,
      goneRejected: 0,
    };
    const context = createFilterContext(
      state({ prior, hunks: { a1: { decision: 'approved', comment: 'c' } } }),
      [],
    );

    expect(hunkMatchesFilters(fileA, a1, DEFAULT_REVIEW_FILTERS, context)).toBe(true);
    expect(
      hunkMatchesFilters(fileA, a1, { ...DEFAULT_REVIEW_FILTERS, status: 'approved' }, context),
    ).toBe(true);
    expect(
      hunkMatchesFilters(fileA, a1, { ...DEFAULT_REVIEW_FILTERS, status: 'has-comment' }, context),
    ).toBe(true);
    expect(
      hunkMatchesFilters(fileA, a1, { ...DEFAULT_REVIEW_FILTERS, status: 'rejected' }, context),
    ).toBe(false);
    expect(
      hunkMatchesFilters(
        fileA,
        a1,
        { ...DEFAULT_REVIEW_FILTERS, status: 'new-or-changed' },
        context,
      ),
    ).toBe(true);
    expect(
      hunkMatchesFilters(fileA, a1, { ...DEFAULT_REVIEW_FILTERS, path: 'docs' }, context),
    ).toBe(false);
    expect(
      hunkMatchesFilters(fileA, a1, { ...DEFAULT_REVIEW_FILTERS, risk: 'flagged' }, context),
    ).toBe(false);
    expect(
      fileMatchesFilters(
        fileB,
        { ...DEFAULT_REVIEW_FILTERS, status: 'new-or-changed' },
        state({ prior }),
      ),
    ).toBe(false);
    expect(
      fileMatchesFilters(fileA, { ...DEFAULT_REVIEW_FILTERS, status: 'pending' }, state()),
    ).toBe(true);
  });
});

describe('ReviewRail keyboard wiring', () => {
  it('RAIL-NAMES gives the navigation buttons plain text names inside the Changed files nav', () => {
    const onNavigate = vi.fn();
    render(<ReviewRail files={files} reviewState={state()} onNavigate={onNavigate} />);
    const nav = screen.getByRole('navigation', { name: 'Changed files' });

    const group = within(nav).getByRole('group', { name: 'Hunk navigation' });
    for (const label of [
      'Previous hunk',
      'Next hunk',
      'Previous pending',
      'Next pending',
      'Previous file',
      'Next file',
    ]) {
      const button = within(group).getByRole('button', { name: label });
      expect(button.querySelector('span')).toBeNull();
    }
    fireEvent.click(within(group).getByRole('button', { name: 'Previous pending' }));
    expect(onNavigate).toHaveBeenCalledWith('previous-pending');
  });

  it('RAIL-HINTS shows decorative key hints only while shortcuts are on, without changing names', () => {
    const { rerender } = render(
      <ShortcutHintsContext value>
        <ReviewRail files={files} reviewState={state()} />
      </ShortcutHintsContext>,
    );
    const hint = screen.getByRole('button', { name: 'Next hunk' }).querySelector('kbd');
    expect(hint?.textContent).toBe('j');
    expect(hint?.getAttribute('aria-hidden')).toBe('true');

    rerender(
      <ShortcutHintsContext value={false}>
        <ReviewRail files={files} reviewState={state()} />
      </ShortcutHintsContext>,
    );
    expect(document.querySelectorAll('kbd')).toHaveLength(0);
  });

  it('RAIL-SELECT reports file and hunk selection from the file list', () => {
    const onSelectFile = vi.fn();
    const onSelectHunk = vi.fn();
    render(
      <FileList
        files={files}
        reviewState={state()}
        onSelectFile={onSelectFile}
        onSelectHunk={onSelectHunk}
      />,
    );

    fireEvent.click(screen.getByText('docs/b.md').closest('button') as HTMLElement);
    expect(onSelectFile).toHaveBeenCalledWith('fb');
    fireEvent.click(screen.getAllByRole('button', { name: 'Hunk 2' })[0] as HTMLElement);
    expect(onSelectHunk).toHaveBeenCalledWith('a2');
  });

  it('RAIL-PATH-REF exposes the path field to the screen for the slash shortcut', () => {
    const pathInputRef = createRef<HTMLInputElement>();
    const onFilterLeave = vi.fn();
    render(
      <ReviewRail
        files={files}
        reviewState={state()}
        pathInputRef={pathInputRef}
        onFilterLeave={onFilterLeave}
      />,
    );

    expect(pathInputRef.current).toBe(screen.getByLabelText('Path'));
    fireEvent.keyDown(screen.getByLabelText('Path'), { key: 'Escape' });
    expect(onFilterLeave).toHaveBeenCalledTimes(1);
  });
});

describe('RAIL-ROVING file list hunk links', () => {
  const ids = (count: number) =>
    Array.from({ length: count }, (_unused, index) => `h${String(index)}`);
  const linkLabels = () =>
    Array.from(document.querySelectorAll('.file-list-hunk-links button[data-position]')).map(
      (button) => button.textContent,
    );

  it('RAIL-ROVING-LINKS-OFF draws no links without a hunk handler', () => {
    render(<FileList files={files} reviewState={state()} />);

    expect(document.querySelector('.file-list-hunk-links')).toBeNull();
  });

  it('RAIL-ROVING-LINKS-CURRENT draws links for the current file only, not for the others', () => {
    render(
      <FileList files={files} reviewState={state()} currentHunkId="b1" onSelectHunk={vi.fn()} />,
    );

    const lists = document.querySelectorAll('.file-list-hunk-links');
    expect(lists).toHaveLength(1);
    expect(lists[0]?.closest('li')?.textContent).toContain('docs/b.md');
    expect(linkLabels()).toEqual(['Hunk 1']);
  });

  it('RAIL-ROVING-LINKS-SHRINK falls back to a first page when the file loses hunks', () => {
    const big = makeFile('fa', 'src/a.ts', ids(250));
    const { rerender } = render(
      <FileList files={[big]} reviewState={state()} currentFileId="fa" onSelectHunk={vi.fn()} />,
    );
    expect(linkLabels()).toHaveLength(100);
    const more = Array.from(document.querySelectorAll('.file-list-hunk-links button')).at(-1);
    fireEvent.click(more as HTMLElement);
    expect(linkLabels()).toHaveLength(200);
    expect(document.activeElement?.textContent).toBe('Hunk 101');

    rerender(
      <FileList
        files={[makeFile('fa', 'src/a.ts', ids(150))]}
        reviewState={state()}
        currentFileId="fa"
        onSelectHunk={vi.fn()}
      />,
    );

    expect(linkLabels()).toHaveLength(100);
    expect(document.querySelectorAll('.file-list-hunk-links button')).toHaveLength(101);
  });

  it('RAIL-ROVING-LINKS-ROW-STOP keeps the row as the Tab stop while a link has focus', () => {
    render(
      <ReviewRail files={files} reviewState={state()} currentFileId="fa" onSelectHunk={vi.fn()} />,
    );
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('.file-list-row'));
    act(() => {
      rows[1]?.focus();
    });
    expect(rows.map((row) => row.tabIndex)).toEqual([-1, 0]);

    act(() => {
      document.querySelector<HTMLButtonElement>('.file-list-hunk-links button')?.focus();
    });

    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1]);
  });
});
