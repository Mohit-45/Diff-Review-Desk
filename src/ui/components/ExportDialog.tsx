import { useEffect, useMemo, useState } from 'react';
import type { DiffFile, Flag, ParseWarning, ReviewState } from '../../core/types';
import { LIMITS } from '../../core/limits';
import { generateAgentFeedback } from '../../core/export/agentFeedback';
import { exportEntries, normalizeExportInput } from '../../core/export/model';
import { exportFilename, type ExportFilenameKind } from '../../core/export/filename';
import { generateMarkdownSummary } from '../../core/export/summary';
import { isSensitivePath, redactTextWithCount } from '../../core/export/redact';
import { selectReviewStats } from '../../core/review/selectors';

export type ExportFormat = 'agent-feedback' | 'summary';

export type ExportWarningTarget = 'pending' | 'rejected-comment' | 'parse-notes' | 'redactions';

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
  readonly onFormatChange?: (format: ExportFormat) => void;
  readonly onClose?: () => void;
  readonly onCopy?: (text: string) => void | Promise<void>;
  readonly onDownload?: (text: string, filename: string) => void | Promise<void>;
  readonly onGoToFirst?: (target: ExportWarningTarget) => void;
  /** Alias retained for callers that call these links navigation callbacks. */
  readonly onNavigate?: (target: ExportWarningTarget) => void;
};

type ExportWarning = {
  readonly target: ExportWarningTarget;
  readonly label: string;
  readonly count: number;
};

const EMPTY_REVIEW_STATE: ReviewState = {
  fingerprint: '',
  round: 0,
  label: 'Review',
  overallNote: '',
  hunks: {},
  hunkIds: [],
  prior: null,
};

function countRedactions(
  state: ReviewState,
  files: readonly DiffFile[],
  flags: readonly Flag[],
  warnings: readonly ParseWarning[] | readonly string[],
): number {
  let count = 0;
  const add = (value: string | null | undefined) => {
    if (value !== null && value !== undefined && value.length > 0) {
      count += redactTextWithCount(value).count;
    }
  };

  add(state.label);
  add(state.overallNote);
  for (const file of files) {
    add(file.displayPath);
    add(file.oldPath);
    add(file.newPath);
    for (const hunk of file.hunks) {
      add(hunk.header);
      add(hunk.section);
      for (const line of hunk.lines) {
        const result = redactTextWithCount(line.text, {
          sensitiveFile: isSensitivePath(file.displayPath),
        });
        count += result.count;
      }
    }
  }
  for (const flag of flags) {
    add(flag.title);
    add(flag.why);
    add(flag.evidence);
  }
  for (const warning of warnings) {
    add(typeof warning === 'string' ? warning : warning.message);
  }
  for (const review of Object.values(state.hunks)) {
    add(review.comment);
  }
  return count;
}

function fallbackCopy(preview: HTMLTextAreaElement): boolean {
  if (typeof document.execCommand !== 'function') {
    return false;
  }
  preview.focus();
  preview.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

function defaultTime(generatedAt: string | undefined, time: string | undefined): string {
  return generatedAt ?? time ?? '';
}

function clipNote(value: string): string {
  return [...value].slice(0, LIMITS.maxOverallNoteChars).join('');
}

/**
 * Export controls and preview. The surrounding App/Dialog owns showModal,
 * focus restoration and lifecycle; this component only exposes callbacks.
 */
export function ExportDialog({
  state,
  reviewState: reviewStateProp,
  files,
  flags = [],
  warnings = [],
  generatedAt,
  time,
  format,
  initialFormat = 'agent-feedback',
  onFormatChange,
  overallNote,
  onOverallNoteChange,
  onClose,
  onCopy,
  onDownload,
  onGoToFirst,
  onNavigate,
}: ExportDialogProps) {
  const reviewState = state ?? reviewStateProp;
  const activeState = reviewState ?? EMPTY_REVIEW_STATE;
  const [uncontrolledFormat, setUncontrolledFormat] = useState<ExportFormat>(initialFormat);
  const controlledNote = overallNote;
  const [uncontrolledNote, setUncontrolledNote] = useState(clipNote(activeState.overallNote));
  const [status, setStatus] = useState('');
  const [previewElement, setPreviewElement] = useState<HTMLTextAreaElement | null>(null);
  const [copyFallbackElement, setCopyFallbackElement] = useState<HTMLTextAreaElement | null>(null);
  const selectedFormat = format ?? uncontrolledFormat;
  const timestamp = defaultTime(generatedAt, time);
  const note = controlledNote === undefined ? uncontrolledNote : clipNote(controlledNote);
  const exportState: ReviewState = { ...activeState, overallNote: note };

  useEffect(() => {
    if (controlledNote === undefined) {
      setUncontrolledNote(clipNote(activeState.overallNote));
    }
  }, [activeState.overallNote, controlledNote]);

  const preview = useMemo(() => {
    const input = normalizeExportInput(exportState, files, flags, warnings, timestamp);
    return selectedFormat === 'agent-feedback'
      ? generateAgentFeedback(input)
      : generateMarkdownSummary(input);
  }, [exportState, files, flags, selectedFormat, timestamp, warnings]);

  const filename = useMemo(() => {
    const kind: ExportFilenameKind =
      selectedFormat === 'agent-feedback' ? 'agent-feedback' : 'summary';
    return exportFilename(kind, activeState.label, activeState.round, timestamp);
  }, [activeState.label, activeState.round, selectedFormat, timestamp]);

  const warningsToShow = useMemo<readonly ExportWarning[]>(() => {
    const entries = exportEntries(
      normalizeExportInput(exportState, files, flags, warnings, timestamp),
    );
    const stats = selectReviewStats(files, activeState);
    const rejectedWithoutComment = entries.filter(
      (entry) => entry.review.decision === 'rejected' && !/\S/u.test(entry.review.comment),
    ).length;
    const redactions = countRedactions(exportState, files, flags, warnings);
    const allWarnings: ExportWarning[] = [
      { target: 'pending', label: 'Pending hunks', count: stats.pending },
      {
        target: 'rejected-comment',
        label: 'Rejected hunks without a comment',
        count: rejectedWithoutComment,
      },
      { target: 'parse-notes', label: 'Parse notes', count: warnings.length },
      { target: 'redactions', label: 'Redactions applied', count: redactions },
    ];
    return allWarnings.filter((warning) => warning.count > 0);
  }, [exportState, files, flags, timestamp, warnings]);

  function chooseFormat(next: ExportFormat) {
    if (format === undefined) {
      setUncontrolledFormat(next);
    }
    onFormatChange?.(next);
  }

  function changeOverallNote(value: string) {
    const clipped = clipNote(value);
    if (controlledNote === undefined) {
      setUncontrolledNote(clipped);
    }
    onOverallNoteChange?.(clipped);
  }

  async function copyPreview() {
    try {
      if (onCopy !== undefined) {
        await onCopy(preview);
        setStatus('Copied export to clipboard.');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
        try {
          await navigator.clipboard.writeText(preview);
          setStatus('Copied export to clipboard.');
          return;
        } catch {
          // Continue through the browser-compatible selection fallback.
        }
      }
      if (copyFallbackElement !== null && fallbackCopy(copyFallbackElement)) {
        setStatus('Copied export to clipboard.');
      } else {
        previewElement?.focus();
        previewElement?.select();
        setStatus(
          "Couldn't copy automatically. The text is selected: press Ctrl+C (Cmd+C on Mac).",
        );
      }
    } catch {
      previewElement?.focus();
      previewElement?.select();
      setStatus("Couldn't copy automatically. The text is selected: press Ctrl+C (Cmd+C on Mac).");
    }
  }

  async function downloadPreview() {
    try {
      if (onDownload !== undefined) {
        await onDownload(preview, filename);
        setStatus('Download started.');
        return;
      }
      if (
        typeof Blob === 'undefined' ||
        typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function'
      ) {
        setStatus('If nothing downloaded, your browser may be blocking it. Use Copy instead.');
        return;
      }
      const url = URL.createObjectURL(new Blob([preview], { type: 'text/markdown;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1_000);
      setStatus('Download started.');
    } catch {
      setStatus('If nothing downloaded, your browser may be blocking it. Use Copy instead.');
    }
  }

  function goToFirst(target: ExportWarningTarget) {
    onGoToFirst?.(target);
    if (onGoToFirst === undefined) {
      onNavigate?.(target);
    }
  }

  if (reviewState === undefined) {
    return (
      <section className="dialog-content" aria-labelledby="export-dialog-title">
        <h2 id="export-dialog-title">Export review</h2>
        <p>No review is loaded.</p>
      </section>
    );
  }

  return (
    <section className="dialog-content" aria-labelledby="export-dialog-title">
      <header className="dialog-header">
        <div>
          <h2 id="export-dialog-title">Export review</h2>
          <p>Choose an export for a human reviewer or the coding agent.</p>
        </div>
        {onClose !== undefined ? (
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        ) : null}
      </header>

      <fieldset>
        <legend>Export format</legend>
        <label>
          <input
            type="radio"
            name="export-format"
            value="agent-feedback"
            checked={selectedFormat === 'agent-feedback'}
            onChange={() => {
              chooseFormat('agent-feedback');
            }}
          />
          Agent feedback
        </label>
        <label>
          <input
            type="radio"
            name="export-format"
            value="summary"
            checked={selectedFormat === 'summary'}
            onChange={() => {
              chooseFormat('summary');
            }}
          />
          Markdown summary
        </label>
      </fieldset>

      <label htmlFor="export-overall-note">Overall note</label>
      <textarea
        id="export-overall-note"
        value={note}
        onChange={(event) => {
          changeOverallNote(event.currentTarget.value);
        }}
        maxLength={LIMITS.maxOverallNoteChars}
        rows={4}
        spellCheck
      />

      <label htmlFor="export-preview">Export preview</label>
      <textarea
        id="export-preview"
        aria-label="Export preview"
        ref={setPreviewElement}
        value={preview}
        readOnly
        spellCheck={false}
        rows={18}
      />
      <textarea
        ref={setCopyFallbackElement}
        value={preview}
        readOnly
        hidden
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Copy fallback"
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

      {warningsToShow.length > 0 ? (
        <aside aria-label="Export notes">
          <h3>Before you send it</h3>
          <ul>
            {warningsToShow.map((warning) => (
              <li key={warning.target}>
                <span>
                  {warning.label}: {warning.count}
                </span>{' '}
                <button
                  type="button"
                  onClick={() => {
                    goToFirst(warning.target);
                  }}
                >
                  Go to first
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <p aria-live="polite">{status}</p>
    </section>
  );
}
