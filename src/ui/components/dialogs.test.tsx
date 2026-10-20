import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, Hunk, KeymapRow, Prefs, ReviewState } from '../../core/types';
import { ExportDialog } from './ExportDialog';
import { HelpDialog } from './HelpDialog';
import { SettingsDialog } from './SettingsDialog';

afterEach(() => {
  cleanup();
});

const SECRET = ['sk', 'live', '1234567890abcdef'].join('_');

function hunk(id: string, lineText: string): Hunk {
  return {
    id,
    fileId: 'f00000000001',
    index: 0,
    kind: 'text',
    meta: [],
    header: '@@ -1 +1 @@',
    section: '',
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 1,
    lines: [{ kind: 'add', text: lineText, oldNo: null, newNo: 1 }],
    added: 1,
    removed: 0,
    truncated: false,
    countMismatch: false,
    hash: '00000000001',
  };
}

function fixture() {
  const currentHunk = hunk('f00000000001:00000000001', `const token = "${SECRET}";`);
  const file: DiffFile = {
    id: 'f00000000001',
    displayPath: 'src/feature.ts',
    oldPath: 'src/feature.ts',
    newPath: 'src/feature.ts',
    status: 'modified',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated: false,
    hunks: [currentHunk],
    added: 1,
    removed: 0,
    incomplete: false,
  };
  const state: ReviewState = {
    fingerprint: '00000000001',
    round: 1,
    label: 'Review',
    overallNote: '',
    hunks: { [currentHunk.id]: { decision: 'rejected', comment: '' } },
    hunkIds: [currentHunk.id],
    prior: null,
  };
  return { file, state };
}

describe('ExportDialog', () => {
  it('keeps the redacted exporter output in an inert preview and exposes format/copy actions', async () => {
    const { file, state } = fixture();
    const onCopy = vi.fn<(text: string) => void>();
    render(<ExportDialog state={state} files={[file]} onCopy={onCopy} />);

    const preview = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Export preview' });
    expect(preview.value).toContain('[REDACTED:secret-assignment]');
    expect(preview.value).not.toContain(SECRET);
    expect(screen.getByText('Rejected hunks without a comment: 1')).toBeTruthy();
    expect(screen.getByText('Redactions applied: 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Markdown summary' }));
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Export preview' }).value,
    ).toContain('# Diff review:');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(onCopy).toHaveBeenCalledWith(expect.stringContaining('# Diff review:'));
  });

  it('sends a non-blocking warning target to the navigation callback', () => {
    const { file, state } = fixture();
    const onGoToFirst = vi.fn();
    render(<ExportDialog state={state} files={[file]} onGoToFirst={onGoToFirst} />);
    const rejectedWarning = screen
      .getAllByText('Rejected hunks without a comment: 1')
      .at(-1)?.parentElement;
    expect(rejectedWarning).not.toBeNull();
    fireEvent.click(
      within(rejectedWarning as HTMLElement).getByRole('button', { name: 'Go to first' }),
    );
    expect(onGoToFirst).toHaveBeenCalledWith('rejected-comment');
  });
});

describe('HelpDialog', () => {
  it('renders the supplied keymap as labelled keyboard help', () => {
    const rows: readonly KeymapRow[] = [
      {
        id: 'approve',
        keys: ['a'],
        help: 'Approve current hunk',
        buttonLabel: 'Approve',
        contextual: false,
      },
      { id: 'close', keys: ['Esc'], help: 'Close dialog', buttonLabel: null, contextual: true },
    ];
    render(<HelpDialog keymap={rows} />);
    expect(screen.getByRole('heading', { name: 'Shortcuts and help' })).toBeTruthy();
    expect(screen.getByText('Approve current hunk')).toBeTruthy();
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('Contextual')).toBeTruthy();
  });
});

describe('SettingsDialog', () => {
  it('emits preference changes and requires confirmation before clearing saved data', () => {
    const prefs: Prefs = {
      theme: 'system',
      shortcutsEnabled: true,
      autoAdvance: true,
      rememberDiff: false,
    };
    const onPrefsChange = vi.fn();
    const onClearData = vi.fn();
    render(
      <SettingsDialog prefs={prefs} onPrefsChange={onPrefsChange} onClearData={onClearData} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(onPrefsChange).toHaveBeenCalledWith({ ...prefs, theme: 'dark' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember diff text in this browser' }));
    expect(onPrefsChange).toHaveBeenCalledWith({ ...prefs, rememberDiff: true });

    fireEvent.click(screen.getByRole('button', { name: 'Clear all saved data' }));
    expect(onClearData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all saved data' }));
    expect(onClearData).toHaveBeenCalledTimes(1);
  });
});
