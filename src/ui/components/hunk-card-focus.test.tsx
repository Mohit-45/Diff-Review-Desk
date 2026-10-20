import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, DiffLine, Hunk } from '../../core/types';
import { CommentEditor, type CommentCloseReason } from './CommentEditor';
import { HunkCard } from './HunkCard';

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
    displayPath: 'src/example.ts',
    oldPath: 'src/example.ts',
    newPath: 'src/example.ts',
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

afterEach(() => {
  cleanup();
});

describe('comment editor and hunk card focus contract', () => {
  it('COMMENT-REASONS reports done, shortcut, escape and blur so the screen can decide whether to advance', () => {
    const reasons: CommentCloseReason[] = [];
    const onCommit = (_value: string, reason: CommentCloseReason) => {
      reasons.push(reason);
    };
    for (const act of ['done', 'shortcut', 'escape', 'blur'] as const) {
      const { unmount } = render(<CommentEditor value="" onCommit={onCommit} />);
      const editor = screen.getByRole('textbox');
      if (act === 'done') fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      if (act === 'shortcut') fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
      if (act === 'escape') fireEvent.keyDown(editor, { key: 'Escape' });
      if (act === 'blur') fireEvent.blur(editor);
      unmount();
    }
    expect(reasons).toEqual(['done', 'shortcut', 'escape', 'blur']);
  });

  it('COMMENT-FOCUS focuses the textarea on mount and keeps the editor open while focus moves to Done', () => {
    const onCommit = vi.fn<(value: string, reason: CommentCloseReason) => void>();
    render(<CommentEditor value="" onCommit={onCommit} />);
    const editor = screen.getByRole('textbox');
    const done = screen.getByRole('button', { name: 'Done' });

    expect(document.activeElement).toBe(editor);
    fireEvent.blur(editor, { relatedTarget: done });
    fireEvent.blur(done, { relatedTarget: editor });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(done, { relatedTarget: null });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('COMMENT-CAP-STATUS announces once near the cap and once at the cap, not on every key', () => {
    render(<CommentEditor value={'a'.repeat(1_799)} onCommit={vi.fn()} />);
    const status = screen.getByRole('status');
    const editor = screen.getByRole('textbox');

    expect(status.textContent).toBe('');
    fireEvent.change(editor, { target: { value: 'a'.repeat(1_800) } });
    expect(status.textContent).toBe('Comment is close to the 2,000 character limit.');
    fireEvent.change(editor, { target: { value: 'a'.repeat(2_000) } });
    expect(status.textContent).toBe('Comment limit reached.');
    expect(screen.getByText('2,000 / 2,000')).toBeTruthy();
  });

  it('HUNK-ROVING marks only the current card as the tab stop and reports focus inside it', () => {
    const onFocusHunk = vi.fn();
    const { rerender } = render(
      <HunkCard hunk={makeHunk()} file={makeFile()} current onFocusHunk={onFocusHunk} />,
    );
    const card = screen.getByRole('article');
    expect(card.tabIndex).toBe(0);
    expect(card.getAttribute('aria-current')).toBe('true');

    fireEvent.focus(screen.getByRole('button', { name: 'Approve' }));
    expect(onFocusHunk).toHaveBeenCalledTimes(1);

    rerender(<HunkCard hunk={makeHunk()} file={makeFile()} current={false} />);
    expect(card.tabIndex).toBe(-1);
    expect(card.getAttribute('aria-current')).toBeNull();
  });

  it('HUNK-EDITING is controlled by the parent and Esc returns focus to the Comment button', () => {
    const onEditingChange = vi.fn();
    const onCommentClose = vi.fn();
    const { rerender } = render(
      <HunkCard
        hunk={makeHunk()}
        file={makeFile()}
        editing
        onEditingChange={onEditingChange}
        onCommentClose={onCommentClose}
      />,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    expect(onCommentClose).toHaveBeenCalledWith('escape');

    rerender(
      <HunkCard
        hunk={makeHunk()}
        file={makeFile()}
        editing={false}
        onEditingChange={onEditingChange}
      />,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Comment/ }));
  });

  it('HUNK-CLEAR shows Clear decision only for a decided hunk and hands focus to Approve', () => {
    const onDecision = vi.fn();
    render(
      <HunkCard hunk={makeHunk()} file={makeFile()} decision="approved" onDecision={onDecision} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear decision' }));

    expect(onDecision).toHaveBeenCalledWith(null);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Approve' }));
  });

  it('HUNK-COLLAPSE hides the table when controlled collapsed and reports the toggle', () => {
    const onCollapseChange = vi.fn();
    const line: DiffLine = { kind: 'add', text: 'x', oldNo: null, newNo: 1 };
    render(
      <HunkCard
        hunk={makeHunk([line])}
        file={makeFile()}
        collapsed
        onCollapseChange={onCollapseChange}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand hunk' }));
    expect(onCollapseChange).toHaveBeenCalledWith(false);
  });
});
