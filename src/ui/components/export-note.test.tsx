import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decidedState, parsedFiles, smallDiff } from '../../app/appFixtures';
import type { ParseWarning } from '../../core/types';
import { ExportDialog } from './ExportDialog';
import { buildExportWarnings } from './exportWarnings';
import { normalizeExportInput } from '../../core/export/model';

afterEach(cleanup);

const text = smallDiff();
const { files } = parsedFiles(text);
const state = decidedState(text);

function note(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Overall note' });
}

function warning(level: ParseWarning['level']): ParseWarning {
  return {
    code: level === 'warn' ? 'hunk-truncated' : 'fence-unwrapped',
    level,
    message: 'a message',
    fileId: null,
    srcLine: null,
    count: 1,
    samples: [],
  };
}

describe('EX-OVERALL-NOTE the dialog hands the note to the review once per edit', () => {
  it('commits on blur after typing, and only once', () => {
    const onCommit = vi.fn();
    render(<ExportDialog state={state} files={files} onOverallNoteCommit={onCommit} />);
    fireEvent.change(note(), { target: { value: 'first' } });
    fireEvent.change(note(), { target: { value: 'first second' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(note());
    fireEvent.blur(note());
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('first second');
  });

  it('commits on Esc and on Close', () => {
    const onCommit = vi.fn();
    render(
      <ExportDialog state={state} files={files} onOverallNoteCommit={onCommit} onClose={vi.fn()} />,
    );
    fireEvent.change(note(), { target: { value: 'one' } });
    fireEvent.keyDown(note(), { key: 'Escape' });
    fireEvent.change(note(), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCommit.mock.calls).toEqual([['one'], ['two']]);
  });

  it('commits nothing when the note was not edited', () => {
    const onCommit = vi.fn();
    render(<ExportDialog state={state} files={files} onOverallNoteCommit={onCommit} />);
    fireEvent.blur(note());
    fireEvent.keyDown(note(), { key: 'Escape' });
    fireEvent.keyDown(note(), { key: 'a' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows the note the review holds, and follows it when an undo changes it', () => {
    const onCommit = vi.fn();
    const withNote = { ...state, overallNote: 'held' };
    const { rerender } = render(
      <ExportDialog state={withNote} files={files} onOverallNoteCommit={onCommit} />,
    );
    expect(note().value).toBe('held');
    fireEvent.change(note(), { target: { value: 'held and more' } });
    rerender(
      <ExportDialog
        state={{ ...state, overallNote: 'older' }}
        files={files}
        onOverallNoteCommit={onCommit}
      />,
    );
    expect(note().value).toBe('older');
    fireEvent.blur(note());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('cuts a note at the 4,000 character cap by code points before handing it over', () => {
    const onCommit = vi.fn();
    render(<ExportDialog state={state} files={files} onOverallNoteCommit={onCommit} />);
    fireEvent.change(note(), { target: { value: '\u{1F600}'.repeat(4_001) } });
    fireEvent.blur(note());
    expect(Array.from(String(onCommit.mock.calls[0]?.[0] ?? '')).length).toBe(4_000);
  });
});

describe('IN-WARN-EXPORT only warnings count as parse notes', () => {
  function parseNotes(warnings: readonly ParseWarning[]): number {
    const input = normalizeExportInput(state, files, [], warnings, '');
    return buildExportWarnings(input).find((entry) => entry.target === 'parse-notes')?.count ?? 0;
  }

  it('counts the warn items and leaves the informational ones out', () => {
    expect(parseNotes([warning('warn'), warning('info'), warning('warn')])).toBe(2);
  });

  it('lists no parse notes when every item is informational', () => {
    expect(parseNotes([warning('info')])).toBe(0);
  });

  it('counts a plain-text note as a warning', () => {
    const input = normalizeExportInput(state, files, [], ['plain note'], '');
    expect(buildExportWarnings(input).some((entry) => entry.target === 'parse-notes')).toBe(true);
  });
});
