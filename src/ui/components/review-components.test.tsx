import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, DiffLine, Flag, Hunk } from '../../core/types';
import { CommentEditor, type CommentCloseReason } from './CommentEditor';
import { DiffTable } from './DiffTable';
import { HunkCard } from './HunkCard';
import { SafeText } from './SafeText';

function makeHunk(lines: readonly DiffLine[] = []): Hunk {
  return {
    id: 'file:hunk',
    fileId: 'file',
    index: 0,
    kind: 'text',
    meta: [],
    header: '@@ -1 +1 @@ section',
    section: ' section',
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 1,
    lines,
    added: 1,
    removed: 0,
    truncated: false,
    countMismatch: false,
    hash: 'hash',
  };
}

function makeFile(): DiffFile {
  return {
    id: 'file',
    displayPath: 'src/<unsafe>.ts',
    oldPath: 'src/<unsafe>.ts',
    newPath: 'src/<unsafe>.ts',
    status: 'modified',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated: false,
    hunks: [makeHunk()],
    added: 1,
    removed: 0,
    incomplete: false,
  };
}

describe('review display components', () => {
  afterEach(() => {
    cleanup();
  });

  it('visualizes hidden characters and masks known secrets without retaining raw values', () => {
    const hidden = '\u202e';
    const secret = ['gh', 'p_', '123456789012345678901234567890123456'].join('');
    render(<SafeText>{`before${hidden}${secret}after`}</SafeText>);

    expect(screen.getByRole('img', { name: /right-to-left override/i }).textContent).toBe(
      '[U+202E]',
    );
    expect(screen.getByRole('img', { name: /masked secret/i }).textContent).toBe('ghp_****[48]');
    expect(document.body.textContent).not.toContain(hidden);
    expect(document.body.textContent).not.toContain(secret);
    expect(
      [...document.querySelectorAll('[aria-label]')].some((node) =>
        node.getAttribute('aria-label')?.includes(hidden),
      ),
    ).toBe(false);
  });

  it('renders a structurally labelled unified table and visualizes code text', () => {
    const line: DiffLine = {
      kind: 'add',
      text: 'const value = "<unsafe>";\u202e',
      oldNo: null,
      newNo: 2,
    };
    render(
      <DiffTable
        hunk={makeHunk([line])}
        filePath="src/<unsafe>.ts"
        hunkNumber={2}
        totalHunks={4}
      />,
    );

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
    expect(screen.getByText('added')).toBeTruthy();
    expect(screen.getByText('[U+202E]')).toBeTruthy();
    expect(screen.getByRole<HTMLTableElement>('table').caption?.textContent).toContain(
      'Changes in',
    );
    expect(document.body.textContent).not.toContain('\u202e');
  });

  it('caps comments by code points and commits once when Done follows blur', () => {
    const onCommit = vi.fn<(value: string, reason: CommentCloseReason) => void>();
    render(<CommentEditor value="" onCommit={onCommit} filePath="src/<unsafe>.ts" />);
    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: `${'a'.repeat(2_000)}😀` } });
    expect((editor as HTMLTextAreaElement).value).toBe('a'.repeat(2_000));
    expect(editor.getAttribute('maxlength')).toBe('2000');
    fireEvent.blur(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(Array.from(onCommit.mock.calls[0]?.[0] ?? '')).toHaveLength(2_000);
  });

  it('keeps the action toolbar for meta hunks and exposes flags as text', () => {
    const metaHunk = { ...makeHunk(), kind: 'meta' as const, meta: ['binary' as const], lines: [] };
    const flag: Flag = {
      ruleId: 'binary-file',
      severity: 'medium',
      title: 'Binary file changed',
      why: 'Binary changes need a manual review.',
      fileId: 'file',
      hunkId: metaHunk.id,
      lines: [],
      count: 1,
    };
    const onDecision = vi.fn();
    render(<HunkCard hunk={metaHunk} file={makeFile()} flags={[flag]} onDecision={onDecision} />);

    expect(screen.getAllByText(/binary change/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Why flagged (1)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecision).toHaveBeenCalledWith('approved');
    expect(screen.queryByRole('table')).toBeNull();
  });
});
