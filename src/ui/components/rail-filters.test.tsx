import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiffFile, Flag, Hunk, ReviewState } from '../../core/types';
import { FileList } from './FileList';
import { DEFAULT_REVIEW_FILTERS, Filters, filterFiles, type ReviewFilters } from './Filters';
import { ReviewRail } from './ReviewRail';

function makeHunk(id: string, fileId: string, index: number): Hunk {
  return {
    id,
    fileId,
    index,
    kind: 'text',
    meta: [],
    header: '@@ -1 +1 @@',
    section: '',
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 1,
    lines: [],
    added: 1,
    removed: 1,
    truncated: false,
    countMismatch: false,
    hash: '00000000001',
  };
}

function makeFile(id: string, path: string, hunks: readonly Hunk[]): DiffFile {
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
    hunks,
    added: hunks.length,
    removed: hunks.length,
    incomplete: false,
  };
}

function makeState(ids: readonly string[], decisions: ReviewState['hunks'] = {}): ReviewState {
  return {
    fingerprint: '00000000001',
    round: 1,
    label: 'Review',
    overallNote: '',
    hunks: decisions,
    hunkIds: ids,
    prior: null,
  };
}

const firstFileId = 'f00000000001';
const secondFileId = 'f00000000002';
const firstHunk = makeHunk('f00000000001:00000000001', firstFileId, 0);
const secondHunk = makeHunk('f00000000002:00000000001', secondFileId, 0);
const files = [
  makeFile(firstFileId, 'src/feature/<review>.ts', [firstHunk]),
  makeFile(secondFileId, 'tests/feature.test.ts', [secondHunk]),
];

describe('Filters', () => {
  it('ANDs path terms and reports status changes through its callback', () => {
    const onChange = vi.fn<(filters: ReviewFilters) => void>();
    render(<Filters value={DEFAULT_REVIEW_FILTERS} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'src feature' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_REVIEW_FILTERS, path: 'src feature' });

    fireEvent.click(screen.getByLabelText('Approved'));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_REVIEW_FILTERS, status: 'approved' });
  });

  it('filters files by status and high-risk flags without putting path data in attributes', () => {
    const state = makeState([firstHunk.id, secondHunk.id], {
      [firstHunk.id]: { decision: 'approved', comment: '' },
    });
    const highFlag: Flag = {
      ruleId: 'debug-leftover',
      severity: 'high',
      title: 'Debug marker',
      why: 'Needs review',
      fileId: firstFileId,
      hunkId: firstHunk.id,
      lines: [1],
      count: 1,
    };
    expect(
      filterFiles(files, { ...DEFAULT_REVIEW_FILTERS, status: 'approved' }, state),
    ).toHaveLength(1);
    expect(
      filterFiles(files, { ...DEFAULT_REVIEW_FILTERS, risk: 'high' }, state, [highFlag]),
    ).toHaveLength(1);

    render(<FileList files={files} reviewState={state} />);
    expect(screen.getByText('src/feature/<review>.ts')).toBeTruthy();
    expect(
      screen.getByText('src/feature/<review>.ts').closest('button')?.getAttribute('aria-label'),
    ).not.toBe('src/feature/<review>.ts');
  });
});

describe('ReviewRail', () => {
  it('renders progress, visible filter summary, file rows and all navigation controls', () => {
    const state = makeState([firstHunk.id, secondHunk.id], {
      [firstHunk.id]: { decision: 'approved', comment: '' },
    });
    const onNavigate = vi.fn();
    render(
      <ReviewRail
        files={files}
        reviewState={state}
        filters={DEFAULT_REVIEW_FILTERS}
        onNavigate={onNavigate}
        currentFileId={firstFileId}
      />,
    );

    expect(screen.getByText('1 of 2 hunks decided')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText('2 of 2 files, 2 of 2 hunks')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous hunk' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next pending' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(onNavigate).toHaveBeenCalledWith('next-file');
  });
});
