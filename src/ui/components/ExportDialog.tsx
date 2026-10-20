import { useEffect, useRef, useState } from 'react';
import type { DiffFile, Flag, ParseWarning, ReviewState } from '../../core/types';
import { LIMITS } from '../../core/limits';
import { truncateCodePoints } from '../../core/review/reducer';
import { DIALOG_TITLE_IDS } from '../dialogIds';
import { copyText, downloadText } from './exportClipboard';
import type { ExportFormat, ExportWarningTarget } from './exportTypes';
import { ExportNotes, FormatFieldset, OverallNoteField, PreviewFields } from './ExportSections';
import { useExportPreview } from './useExportPreview';

export type { ExportFormat, ExportWarningTarget } from './exportTypes';

export type ExportDialogProps = {
  readonly state?: ReviewState;
  readonly reviewState?: ReviewState;
  readonly files: readonly DiffFile[];
  readonly flags?: readonly Flag[];
  readonly warnings?: readonly ParseWarning[] | readonly string[];
  /** The injected time used by the deterministic exporters and filename. */
  readonly generatedAt?: string;
  readonly time?: string;
  readonly format?: ExportFormat;
  readonly initialFormat?: ExportFormat;
  readonly open?: boolean;
  readonly overallNote?: string;
  readonly onOverallNoteChange?: (note: string) => void;
  /**
   * The typed note, once per edit session: on blur, on Esc and on Close. The review keeps it as
   * one undo step instead of one per keystroke.
   */
  readonly onOverallNoteCommit?: (note: string) => void;
  readonly onFormatChange?: (format: ExportFormat) => void;
  readonly onClose?: () => void;
  readonly onCopy?: (text: string) => void | Promise<void>;
  readonly onDownload?: (text: string, filename: string) => void | Promise<void>;
  readonly onGoToFirst?: (target: ExportWarningTarget) => void;
  /** Alias retained for callers that call these links navigation callbacks. */
  readonly onNavigate?: (target: ExportWarningTarget) => void;
};

type ExportPanelProps = Omit<ExportDialogProps, 'state' | 'reviewState'> & {
  readonly reviewState: ReviewState;
};

// Stable defaults: a fresh `[]` per render would defeat the preview memoization.
const NO_FLAGS: readonly Flag[] = [];
const NO_WARNINGS: readonly ParseWarning[] = [];

const COPIED_MESSAGE = 'Copied export to clipboard.';
const SELECT_MANUALLY_MESSAGE =
  "Couldn't copy automatically. The text is selected: press Ctrl+C (Cmd+C on Mac).";
const DOWNLOAD_STARTED_MESSAGE = 'Download started.';
const DOWNLOAD_BLOCKED_MESSAGE =
  'If nothing downloaded, your browser may be blocking it. Use Copy instead.';

function clipNote(value: string): string {
  return truncateCodePoints(value, LIMITS.maxOverallNoteChars);
}

/**
 * Export controls and preview. The surrounding App/Dialog owns showModal,
 * focus restoration and lifecycle; this component only exposes callbacks.
 */
export function ExportDialog({ state, reviewState, ...panelProps }: ExportDialogProps) {
  const current = state ?? reviewState;
  if (current === undefined) {
    return (
      <div className="dialog-content">
        <h2 id={DIALOG_TITLE_IDS.export}>Export review</h2>
        <p>No review is loaded.</p>
      </div>
    );
  }
  return <ExportPanel {...panelProps} reviewState={current} />;
}

function ExportPanel({
  reviewState,
  files,
  flags = NO_FLAGS,
  warnings = NO_WARNINGS,
  generatedAt,
  time,
  format,
  initialFormat = 'agent-feedback',
  onFormatChange,
  overallNote,
  onOverallNoteChange,
  onOverallNoteCommit,
  onClose,
  onCopy,
  onDownload,
  onGoToFirst,
  onNavigate,
}: ExportPanelProps) {
  const [uncontrolledFormat, setUncontrolledFormat] = useState<ExportFormat>(initialFormat);
  const [uncontrolledNote, setUncontrolledNote] = useState(clipNote(reviewState.overallNote));
  const [status, setStatus] = useState('');
  // True from the first keystroke until the note is handed to the review.
  const noteDirty = useRef(false);
  const [previewElement, setPreviewElement] = useState<HTMLTextAreaElement | null>(null);
  const [copyFallbackElement, setCopyFallbackElement] = useState<HTMLTextAreaElement | null>(null);
  const selectedFormat = format ?? uncontrolledFormat;
  const note = overallNote === undefined ? uncontrolledNote : clipNote(overallNote);
  const preview = useExportPreview({
    reviewState,
    note,
    files,
    flags,
    warnings,
    format: selectedFormat,
    timestamp: generatedAt ?? time ?? '',
  });

  useEffect(() => {
    if (overallNote === undefined) {
      setUncontrolledNote(clipNote(reviewState.overallNote));
      noteDirty.current = false;
    }
  }, [reviewState.overallNote, overallNote]);

  function chooseFormat(next: ExportFormat) {
    if (format === undefined) {
      setUncontrolledFormat(next);
    }
    onFormatChange?.(next);
  }

  function changeOverallNote(value: string) {
    const clipped = clipNote(value);
    if (overallNote === undefined) {
      setUncontrolledNote(clipped);
    }
    noteDirty.current = true;
    onOverallNoteChange?.(clipped);
  }

  function commitOverallNote() {
    if (!noteDirty.current) {
      return;
    }
    noteDirty.current = false;
    onOverallNoteCommit?.(note);
  }

  async function tryCopy(): Promise<boolean> {
    try {
      if (onCopy !== undefined) {
        await onCopy(preview.text);
        return true;
      }
      return await copyText(preview.text, copyFallbackElement);
    } catch {
      return false;
    }
  }

  async function copyPreview() {
    if (await tryCopy()) {
      setStatus(COPIED_MESSAGE);
      return;
    }
    previewElement?.focus();
    previewElement?.select();
    setStatus(SELECT_MANUALLY_MESSAGE);
  }

  async function downloadPreview() {
    try {
      if (onDownload !== undefined) {
        await onDownload(preview.text, preview.filename);
      } else if (!downloadText(preview.text, preview.filename)) {
        setStatus(DOWNLOAD_BLOCKED_MESSAGE);
        return;
      }
      setStatus(DOWNLOAD_STARTED_MESSAGE);
    } catch {
      setStatus(DOWNLOAD_BLOCKED_MESSAGE);
    }
  }

  function goToFirst(target: ExportWarningTarget) {
    onGoToFirst?.(target);
    if (onGoToFirst === undefined) {
      onNavigate?.(target);
    }
  }

  return (
    <div className="dialog-content">
      <div className="dialog-header">
        <div>
          <h2 id={DIALOG_TITLE_IDS.export}>Export review</h2>
          <p>Choose an export for a human reviewer or the coding agent.</p>
        </div>
        {onClose !== undefined ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              commitOverallNote();
              onClose();
            }}
          >
            Close
          </button>
        ) : null}
      </div>

      <FormatFieldset selected={selectedFormat} onChoose={chooseFormat} />

      <OverallNoteField value={note} onChange={changeOverallNote} onCommit={commitOverallNote} />

      <PreviewFields
        text={preview.text}
        onPreviewElement={setPreviewElement}
        onFallbackElement={setCopyFallbackElement}
      />

      <div className="button-row">
        <button type="button" className="button button-primary" onClick={() => void copyPreview()}>
          Copy
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void downloadPreview()}
        >
          Download
        </button>
      </div>

      <ExportNotes notes={preview.notes} onGoToFirst={goToFirst} />

      <p aria-live="polite">{status}</p>
    </div>
  );
}
