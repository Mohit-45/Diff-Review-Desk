import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, Hunk, HunkReview, ReviewState } from '../../core/types';
import { ExportDialog } from './ExportDialog';

const SECRET = ['sk', 'live', '1234567890abcdef'].join('_');
const COPIED = 'Copied export to clipboard.';
const SELECT_MANUALLY =
  "Couldn't copy automatically. The text is selected: press Ctrl+C (Cmd+C on Mac).";
const DOWNLOAD_BLOCKED =
  'If nothing downloaded, your browser may be blocking it. Use Copy instead.';

type FixtureOptions = {
  readonly path?: string;
  readonly lineText?: string;
  readonly review?: HunkReview;
  readonly label?: string;
  readonly overallNote?: string;
};

function buildReview({
  path = 'src/feature.ts',
  lineText = 'const answer = 42;',
  review = { decision: 'rejected', comment: 'Revert this.' },
  label = 'Review',
  overallNote = '',
}: FixtureOptions = {}) {
  const hunk: Hunk = {
    id: 'f00000000001:00000000001',
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
  const file: DiffFile = {
    id: 'f00000000001',
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
    hunks: [hunk],
    added: 1,
    removed: 0,
    incomplete: false,
  };
  const state: ReviewState = {
    fingerprint: '00000000001',
    round: 1,
    label,
    overallNote,
    hunks: { [hunk.id]: review },
    hunkIds: [hunk.id],
    prior: null,
  };
  return { file, state };
}

function previewField(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Export preview' });
}

function fallbackField(): HTMLTextAreaElement {
  const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Copy fallback"]');
  if (field === null) {
    throw new Error('The hidden copy fallback textarea is missing.');
  }
  return field;
}

function defineClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

function defineExecCommand(execCommand: (commandId: string) => boolean): void {
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
}

// Node's own URL class provides these in the jsdom environment, so they are
// restored rather than deleted, and each test states what it needs.
const ORIGINAL_BLOB_URL_API = {
  createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
};

function defineBlobUrlApi(createObjectURL: unknown, revokeObjectURL: unknown): void {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
}

function restoreBlobUrlApi(): void {
  for (const [name, descriptor] of Object.entries(ORIGINAL_BLOB_URL_API)) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(URL, name);
    } else {
      Object.defineProperty(URL, name, descriptor);
    }
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
  restoreBlobUrlApi();
});

describe('ExportDialog copy', () => {
  it('EXPORT-COPY-API writes through the async clipboard API before anything else', async () => {
    const { file, state } = buildReview();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const execCommand = vi.fn<(commandId: string) => boolean>(() => true);
    defineClipboard(writeText);
    defineExecCommand(execCommand);
    render(<ExportDialog state={state} files={[file]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(COPIED)).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(previewField().value);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('EXPORT-COPY-FALLBACK selects the hidden textarea and runs execCommand when the API rejects', async () => {
    const { file, state } = buildReview();
    const execCommand = vi.fn<(commandId: string) => boolean>(() => true);
    defineClipboard(() => Promise.reject(new Error('denied')));
    defineExecCommand(execCommand);
    render(<ExportDialog state={state} files={[file]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(COPIED)).toBeTruthy();
    expect(execCommand).toHaveBeenCalledWith('copy');
    const fallback = fallbackField();
    expect(fallback.selectionStart).toBe(0);
    expect(fallback.selectionEnd).toBe(fallback.value.length);
  });

  it('EXPORT-COPY-FALLBACK uses execCommand when there is no clipboard API at all', async () => {
    const { file, state } = buildReview();
    const execCommand = vi.fn<(commandId: string) => boolean>(() => true);
    defineExecCommand(execCommand);
    render(<ExportDialog state={state} files={[file]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(COPIED)).toBeTruthy();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('EXPORT-COPY-MANUAL selects the visible preview when every copy path fails', async () => {
    const { file, state } = buildReview();
    render(<ExportDialog state={state} files={[file]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(SELECT_MANUALLY)).toBeTruthy();
    const preview = previewField();
    expect(document.activeElement).toBe(preview);
    expect(preview.selectionStart).toBe(0);
    expect(preview.selectionEnd).toBe(preview.value.length);
  });

  it('EXPORT-COPY-MANUAL treats execCommand returning false as a failed copy', async () => {
    const { file, state } = buildReview();
    defineExecCommand(() => false);
    render(<ExportDialog state={state} files={[file]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(SELECT_MANUALLY)).toBeTruthy();
  });

  it('EXPORT-COPY-MANUAL treats a throwing execCommand as a failed copy', async () => {
    const { file, state } = buildReview();
    defineExecCommand(() => {
      throw new Error('blocked');
    });
    render(<ExportDialog state={state} files={[file]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(SELECT_MANUALLY)).toBeTruthy();
    expect(document.activeElement).toBe(previewField());
  });

  it('EXPORT-COPY-CALLBACK reports success and failure of an injected copy handler', async () => {
    const { file, state } = buildReview();
    const onCopy = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const { rerender } = render(<ExportDialog state={state} files={[file]} onCopy={onCopy} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText(COPIED)).toBeTruthy();

    rerender(
      <ExportDialog
        state={state}
        files={[file]}
        onCopy={() => Promise.reject(new Error('nope'))}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText(SELECT_MANUALLY)).toBeTruthy();
    expect(screen.queryByText(COPIED)).toBeNull();
  });
});

describe('ExportDialog download', () => {
  it('EXPORT-DOWNLOAD-UNSUPPORTED says so when Blob URLs are unavailable', () => {
    defineBlobUrlApi(undefined, undefined);
    const { file, state } = buildReview();
    render(<ExportDialog state={state} files={[file]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(screen.getByText(DOWNLOAD_BLOCKED)).toBeTruthy();
  });

  it('EXPORT-DOWNLOAD-ANCHOR clicks a detached anchor and revokes the Blob URL after one second', () => {
    vi.useFakeTimers();
    const { file, state } = buildReview();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:fake');
    const revokeObjectURL = vi.fn<(url: string) => void>();
    defineBlobUrlApi(createObjectURL, revokeObjectURL);
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    render(<ExportDialog state={state} files={[file]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(screen.getByText('Download started.')).toBeTruthy();
    expect(downloads).toEqual(['agent-feedback-review-r1-00000000-0000.md']);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('text/markdown;charset=utf-8');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('EXPORT-DOWNLOAD-CALLBACK passes the preview text and a dated filename to the handler', async () => {
    const { file, state } = buildReview();
    const onDownload = vi.fn<(text: string, filename: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    render(
      <ExportDialog
        state={state}
        files={[file]}
        generatedAt="2026-01-02T03:04:05Z"
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByText('Download started.')).toBeTruthy();
    expect(onDownload).toHaveBeenCalledWith(
      previewField().value,
      'agent-feedback-review-r1-20260102-0304.md',
    );
  });

  it('EXPORT-DOWNLOAD-CALLBACK names the Markdown summary like a review', async () => {
    const { file, state } = buildReview({ label: 'My Feature!' });
    const onDownload = vi.fn<(text: string, filename: string) => void>();
    render(
      <ExportDialog
        state={state}
        files={[file]}
        time="2026-01-02T03:04:05Z"
        initialFormat="summary"
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(onDownload).toHaveBeenCalledWith(
        expect.stringContaining('# Diff review:'),
        'review-my-feature-r1-20260102-0304.md',
      );
    });
  });

  it('EXPORT-DOWNLOAD-CALLBACK reports a failed handler', async () => {
    const { file, state } = buildReview();
    render(
      <ExportDialog
        state={state}
        files={[file]}
        onDownload={() => Promise.reject(new Error('nope'))}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByText(DOWNLOAD_BLOCKED)).toBeTruthy();
  });
});

describe('ExportDialog note and format', () => {
  it('EXPORT-NOTE-CLIP cuts the overall note at 4,000 code points without splitting a pair', () => {
    const { file, state } = buildReview();
    const onOverallNoteChange = vi.fn<(note: string) => void>();
    render(<ExportDialog state={state} files={[file]} onOverallNoteChange={onOverallNoteChange} />);
    const note = screen.getByLabelText<HTMLTextAreaElement>('Overall note');

    fireEvent.change(note, { target: { value: `${'x'.repeat(3_999)}\u{1F600}\u{1F600}` } });

    expect(note.value).toBe(`${'x'.repeat(3_999)}\u{1F600}`);
    expect(Array.from(note.value)).toHaveLength(4_000);
    expect(onOverallNoteChange).toHaveBeenCalledWith(note.value);
    expect(note.maxLength).toBe(4_000);
  });

  it('EXPORT-NOTE-CONTROLLED shows the supplied note clipped and leaves the value to the owner', () => {
    const { file, state } = buildReview();
    const onOverallNoteChange = vi.fn<(note: string) => void>();
    render(
      <ExportDialog
        state={state}
        files={[file]}
        overallNote={'y'.repeat(4_005)}
        onOverallNoteChange={onOverallNoteChange}
      />,
    );
    const note = screen.getByLabelText<HTMLTextAreaElement>('Overall note');
    expect(note.value).toBe('y'.repeat(4_000));

    fireEvent.change(note, { target: { value: 'typed' } });

    expect(onOverallNoteChange).toHaveBeenCalledWith('typed');
    expect(note.value).toBe('y'.repeat(4_000));
  });

  it('EXPORT-NOTE-SYNC follows the review state note until the user is in control', () => {
    const first = buildReview({ overallNote: 'first note' });
    const { rerender } = render(<ExportDialog state={first.state} files={[first.file]} />);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Overall note').value).toBe('first note');

    const second = buildReview({ overallNote: 'second note' });
    rerender(<ExportDialog state={second.state} files={[second.file]} />);

    expect(screen.getByLabelText<HTMLTextAreaElement>('Overall note').value).toBe('second note');
    expect(previewField().value).toContain('second note');
  });

  it('EXPORT-FORMAT-CONTROLLED reports a choice without changing a controlled format', () => {
    const { file, state } = buildReview();
    const onFormatChange = vi.fn<(format: 'agent-feedback' | 'summary') => void>();
    render(
      <ExportDialog
        state={state}
        files={[file]}
        format="summary"
        onFormatChange={onFormatChange}
      />,
    );
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Markdown summary' }).checked).toBe(
      true,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Agent feedback' }));

    expect(onFormatChange).toHaveBeenCalledWith('agent-feedback');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Markdown summary' }).checked).toBe(
      true,
    );
    expect(previewField().value).toContain('# Diff review:');
  });

  it('EXPORT-FORMAT-DEFAULT starts on agent feedback and switches the preview', () => {
    const { file, state } = buildReview();
    render(<ExportDialog state={state} files={[file]} />);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Agent feedback' }).checked).toBe(
      true,
    );
    expect(previewField().value).toContain('# Code review feedback');
    expect(previewField().value).toContain('Revert this.');

    fireEvent.click(screen.getByRole('radio', { name: 'Markdown summary' }));

    expect(previewField().value).toContain('# Diff review:');
  });
});

describe('ExportDialog frame and notes', () => {
  it('EXPORT-EMPTY says no review is loaded when there is no state', () => {
    render(<ExportDialog files={[]} />);
    expect(screen.getByRole('heading', { name: 'Export review' })).toBeTruthy();
    expect(screen.getByText('No review is loaded.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('EXPORT-ALIAS accepts the review state under the reviewState name and closes', () => {
    const { file, state } = buildReview();
    const onClose = vi.fn();
    render(<ExportDialog reviewState={state} files={[file]} onClose={onClose} />);
    expect(previewField().value).toContain('Revert this.');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('EXPORT-NOTES-NONE leaves out the notes panel when nothing needs attention', () => {
    const { file, state } = buildReview({ review: { decision: 'approved', comment: 'Fine.' } });
    render(<ExportDialog state={state} files={[file]} />);
    expect(screen.queryByRole('complementary', { name: 'Export notes' })).toBeNull();
  });

  it('EXPORT-NOTES-PENDING counts pending hunks and parse notes with a go-to link each', () => {
    const { file, state } = buildReview({ review: { decision: null, comment: '' } });
    const onGoToFirst = vi.fn();
    const onNavigate = vi.fn();
    render(
      <ExportDialog
        state={state}
        files={[file]}
        warnings={['first note', 'second note']}
        onGoToFirst={onGoToFirst}
        onNavigate={onNavigate}
      />,
    );
    const notes = screen.getByRole('complementary', { name: 'Export notes' });
    expect(notes.textContent).toContain('Pending hunks: 1');
    expect(notes.textContent).toContain('Parse notes: 2');

    const links = screen.getAllByRole('button', { name: 'Go to first' });
    expect(links).toHaveLength(2);
    fireEvent.click(links[1] as HTMLElement);

    expect(onGoToFirst).toHaveBeenCalledWith('parse-notes');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('EXPORT-NOTES-NAVIGATE falls back to onNavigate when onGoToFirst is absent', () => {
    const { file, state } = buildReview({ review: { decision: null, comment: '' } });
    const onNavigate = vi.fn();
    render(<ExportDialog state={state} files={[file]} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to first' }));

    expect(onNavigate).toHaveBeenCalledWith('pending');
  });

  it('EXPORT-REDACTION-COUNT counts secrets in lines, comments, the note and the label', () => {
    const { file, state } = buildReview({
      lineText: `const token = "${SECRET}";`,
      review: { decision: 'approved', comment: `Seen ${SECRET} in the log.` },
      label: `Review ${SECRET}`,
      overallNote: `Do not ship ${SECRET}.`,
    });
    render(<ExportDialog state={state} files={[file]} />);

    expect(screen.getByText('Redactions applied: 4')).toBeTruthy();
    expect(previewField().value).not.toContain(SECRET);
  });

  it('EXPORT-REDACTION-SENSITIVE-FILE redacts every line of a sensitive file', () => {
    const { file, state } = buildReview({
      path: '.env',
      lineText: 'PLAIN_SETTING=value',
      review: { decision: 'approved', comment: '' },
    });
    render(<ExportDialog state={state} files={[file]} />);

    expect(screen.getByText('Redactions applied: 1')).toBeTruthy();
    expect(previewField().value).not.toContain('PLAIN_SETTING=value');
  });
});
