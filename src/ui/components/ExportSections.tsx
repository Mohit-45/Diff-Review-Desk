import { LIMITS } from '../../core/limits';
import type { ExportFormat, ExportWarning, ExportWarningTarget } from './exportTypes';

type FormatOption = {
  readonly value: ExportFormat;
  readonly label: string;
};

const FORMAT_OPTIONS: readonly FormatOption[] = [
  { value: 'agent-feedback', label: 'Agent feedback' },
  { value: 'summary', label: 'Markdown summary' },
];

export function FormatFieldset({
  selected,
  onChoose,
}: {
  readonly selected: ExportFormat;
  readonly onChoose: (format: ExportFormat) => void;
}) {
  return (
    <fieldset>
      <legend>Export format</legend>
      {FORMAT_OPTIONS.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name="export-format"
            value={option.value}
            checked={selected === option.value}
            onChange={() => {
              onChoose(option.value);
            }}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function ExportNotes({
  notes,
  onGoToFirst,
}: {
  readonly notes: readonly ExportWarning[];
  readonly onGoToFirst: (target: ExportWarningTarget) => void;
}) {
  if (notes.length === 0) {
    return null;
  }
  return (
    <aside aria-label="Export notes">
      <h3>Before you send it</h3>
      <ul>
        {notes.map((note) => (
          <li key={note.target}>
            <span>
              {note.label}: {note.count}
            </span>{' '}
            <button
              type="button"
              onClick={() => {
                onGoToFirst(note.target);
              }}
            >
              Go to first
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * The visible preview plus a hidden copy of it. The hidden one is the target
 * of the execCommand copy fallback, so the visible selection stays untouched.
 */
export function PreviewFields({
  text,
  onPreviewElement,
  onFallbackElement,
}: {
  readonly text: string;
  readonly onPreviewElement: (element: HTMLTextAreaElement | null) => void;
  readonly onFallbackElement: (element: HTMLTextAreaElement | null) => void;
}) {
  return (
    <>
      <label htmlFor="export-preview">Export preview</label>
      <textarea
        id="export-preview"
        aria-label="Export preview"
        ref={onPreviewElement}
        value={text}
        readOnly
        spellCheck={false}
        rows={18}
      />
      <textarea
        ref={onFallbackElement}
        value={text}
        readOnly
        hidden
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Copy fallback"
      />
    </>
  );
}

/**
 * The note the export opens with. Typing stays local to the dialog; the review hears about it on
 * blur and on Esc, so one edit is one undo step rather than one per keystroke.
 */
export function OverallNoteField({
  value,
  onChange,
  onCommit,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCommit: () => void;
}) {
  return (
    <>
      <label htmlFor="export-overall-note">Overall note</label>
      <textarea
        id="export-overall-note"
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          // Esc closes the dialog without a blur, so the note is handed over first.
          if (event.key === 'Escape') {
            onCommit();
          }
        }}
        maxLength={LIMITS.maxOverallNoteChars}
        rows={4}
        spellCheck
      />
    </>
  );
}
