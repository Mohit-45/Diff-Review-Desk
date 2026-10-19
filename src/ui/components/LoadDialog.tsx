import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import type { ParseError } from '../../core/types';
import { LIMITS } from '../../core/limits';
import { BUILT_IN_SAMPLES, type BuiltInSample } from '../../samples';
import { SafeText } from './SafeText';

export type LoadFileCallback = (file: File, ignoredFileCount?: number) => void;

export type IntakeControlsProps = {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onLoadText: (text: string) => void;
  readonly onLoadFile: LoadFileCallback;
  readonly onLoadSample: (sample: BuiltInSample) => void;
  readonly onError?: (error: ParseError) => void;
  readonly error?: ParseError | null;
  readonly status?: string;
  readonly loading?: boolean;
  readonly idPrefix: string;
  readonly enableDocumentPaste?: boolean;
  readonly showPrivacyLine?: boolean;
};

export type LoadDialogProps = {
  readonly open: boolean;
  readonly initialText?: string;
  readonly error?: ParseError | null;
  readonly status?: string;
  readonly loading?: boolean;
  readonly onClose: () => void;
  readonly onLoadText: (text: string) => void;
  readonly onLoadFile: LoadFileCallback;
  readonly onLoadSample: (sample: BuiltInSample) => void;
  readonly onError?: (error: ParseError) => void;
};

function emptyError(detail = 'Paste a unified diff or try a sample.'): ParseError {
  return {
    code: 'empty',
    title: 'Nothing to review',
    detail,
    hint: null,
    suggestion: 'Paste a unified diff or try a sample.',
  };
}

function tooLargeError(size: number): ParseError {
  return {
    code: 'too-large',
    title: 'This diff is too large',
    detail: `The input is ${size} bytes; the limit is ${LIMITS.maxInputBytes} bytes.`,
    hint: 'generic',
    suggestion: 'Review a narrower change with `git diff -- src/`.',
  };
}

function unreadableFileError(): ParseError {
  return {
    code: 'internal',
    title: "That file isn't text",
    detail: 'The dropped item could not be read as a text diff.',
    hint: 'generic',
    suggestion: 'Choose a text diff or paste the diff text.',
  };
}

function fileError(file: File): ParseError | null {
  if (file.size === 0) {
    return emptyError(`The selected file ${file.name || 'this file'} is empty.`);
  }
  if (file.size > LIMITS.maxInputBytes) {
    return tooLargeError(file.size);
  }
  return null;
}

function isBlank(value: string): boolean {
  return /^\s*$/u.test(value);
}

export function ErrorPanel({
  error,
  onLoadSample,
}: {
  readonly error: ParseError;
  readonly onLoadSample: (sample: BuiltInSample) => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [error]);
  return (
    <section className="intake-error" aria-labelledby={headingId} tabIndex={-1}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1}>
        <SafeText>{error.title}</SafeText>
      </h3>
      <p>
        <SafeText>{error.detail}</SafeText>
      </p>
      {error.suggestion !== null && (
        <textarea
          aria-label="Suggested fix command"
          readOnly
          rows={2}
          value={error.suggestion}
          spellCheck={false}
        />
      )}
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          onLoadSample(BUILT_IN_SAMPLES[0] as BuiltInSample);
        }}
      >
        Load sample
      </button>
    </section>
  );
}

export function IntakeControls({
  value,
  onValueChange,
  onLoadText,
  onLoadFile,
  onLoadSample,
  onError,
  error,
  status,
  loading = false,
  idPrefix,
  enableDocumentPaste = false,
  showPrivacyLine = false,
}: IntakeControlsProps) {
  const [localError, setLocalError] = useState<ParseError | null>(null);
  const [localStatus, setLocalStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const textareaId = `${idPrefix}-input`;
  const dropId = `${idPrefix}-drop-zone`;
  const displayedError = error ?? localError;
  const displayedStatus = status ?? localStatus;

  function reportError(nextError: ParseError): void {
    setLocalError(nextError);
    setLocalStatus('');
    onError?.(nextError);
  }

  function submitText(): void {
    if (isBlank(value)) {
      reportError(emptyError());
      return;
    }
    setLocalError(null);
    setLocalStatus('');
    onLoadText(value);
  }

  function handleFile(file: File, ignoredFileCount = 0): void {
    const validation = fileError(file);
    if (validation !== null) {
      reportError(validation);
      return;
    }
    setLocalError(null);
    setLocalStatus(
      ignoredFileCount > 0
        ? `Loaded ${file.name || 'the selected file'}. Ignored ${ignoredFileCount} other files.`
        : `Loaded ${file.name || 'the selected file'}.`,
    );
    onLoadFile(file, ignoredFileCount);
  }

  function handlePickerChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = event.currentTarget.files;
    const first = files?.[0];
    const ignoredFileCount = files === null ? 0 : Math.max(0, files.length - 1);
    event.currentTarget.value = '';
    if (first === undefined) {
      return;
    }
    handleFile(first, ignoredFileCount);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    const files = event.dataTransfer?.files;
    const first = files?.[0];
    if (first === undefined) {
      reportError(unreadableFileError());
      return;
    }
    handleFile(first, Math.max(0, (files?.length ?? 1) - 1));
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submitText();
    }
  }

  function loadSample(sample: BuiltInSample): void {
    setLocalError(null);
    setLocalStatus(`Loading ${sample.title}.`);
    onLoadSample(sample);
  }

  return (
    <div className="intake-controls">
      <label htmlFor={textareaId}>Paste a unified diff</label>
      <textarea
        id={textareaId}
        value={value}
        onChange={(event) => {
          onValueChange(event.currentTarget.value);
        }}
        onKeyDown={handleTextKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        data-gramm="false"
        rows={12}
        aria-invalid={displayedError !== null}
        disabled={loading}
      />
      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          onClick={submitText}
          disabled={loading}
        >
          Load diff
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => pickerRef.current?.click()}
          disabled={loading}
        >
          Choose file
        </button>
        <input
          ref={pickerRef}
          type="file"
          accept=".diff,.patch,text/plain,text/x-diff"
          multiple
          onChange={handlePickerChange}
          aria-label="Choose a text diff file"
          tabIndex={-1}
          hidden
        />
      </div>
      <div
        id={dropId}
        className="drop-zone"
        aria-label="Drop a unified diff"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={handleDrop}
        data-dragging={dragging ? 'true' : undefined}
      >
        <strong>{dragging ? 'Release to load the diff' : 'Drop a diff here'}</strong>
        <span>or choose a text file from your device.</span>
      </div>
      {showPrivacyLine && (
        <p className="privacy-line">
          <SafeText>
            Private by design. Your diff, comments and decisions never leave this browser. This page
            makes no network requests. Diff text is kept in this tab&apos;s session storage.
            Decisions and comments are saved in this browser.
          </SafeText>
        </p>
      )}
      <div className="button-row sample-row" aria-label="Built-in samples">
        {BUILT_IN_SAMPLES.map((sample) => (
          <button
            key={sample.id}
            type="button"
            className="button button-secondary"
            onClick={() => {
              loadSample(sample);
            }}
            disabled={loading}
          >
            <SafeText>{sample.title}</SafeText>
          </button>
        ))}
      </div>
      {displayedError !== null && <ErrorPanel error={displayedError} onLoadSample={loadSample} />}
      <p className="status-line" aria-live="polite">
        <SafeText>{displayedStatus}</SafeText>
      </p>
      {enableDocumentPaste && (
        <DocumentPasteListener
          disabled={loading}
          onLoadText={(text) => {
            setLocalError(null);
            onLoadText(text);
          }}
          onError={reportError}
        />
      )}
    </div>
  );
}

function DocumentPasteListener({
  disabled,
  onLoadText,
  onError,
}: {
  readonly disabled: boolean;
  readonly onLoadText: (text: string) => void;
  readonly onError: (error: ParseError) => void;
}) {
  // Kept as a component so the landing screen can opt into document paste
  // without making a load dialog intercept pastes intended for its textarea.
  const listener = (event: ClipboardEvent) => {
    if (disabled) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('textarea, input, button') !== null) {
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    if (isBlank(text)) {
      onError({
        code: 'empty',
        title: 'Clipboard has no text',
        detail: 'Paste plain text from a unified diff, or choose a file.',
        hint: null,
        suggestion: 'Paste a unified diff or try a sample.',
      });
      return;
    }
    onLoadText(text);
  };

  // The listener is registered by the parent effect below. This small helper
  // returns no DOM and keeps the input surface itself declarative.
  useDocumentListener(listener);
  return null;
}

function useDocumentListener(listener: (event: ClipboardEvent) => void): void {
  useEffect(() => {
    const preventWindowDrop = (event: globalThis.DragEvent) => {
      event.preventDefault();
    };
    document.addEventListener('paste', listener);
    window.addEventListener('dragover', preventWindowDrop);
    window.addEventListener('drop', preventWindowDrop);
    return () => {
      document.removeEventListener('paste', listener);
      window.removeEventListener('dragover', preventWindowDrop);
      window.removeEventListener('drop', preventWindowDrop);
    };
  }, [listener]);
}

export function LoadDialog({
  open,
  initialText = '',
  error,
  status,
  loading = false,
  onClose,
  onLoadText,
  onLoadFile,
  onLoadSample,
  onError,
}: LoadDialogProps) {
  const [value, setValue] = useState(initialText);
  const dialogId = useId();
  if (!open) {
    return null;
  }
  return (
    <dialog open aria-labelledby={dialogId} aria-busy={loading || undefined}>
      <h2 id={dialogId}>Load a diff</h2>
      <button type="button" className="button button-secondary" onClick={onClose}>
        Close
      </button>
      <IntakeControls
        value={value}
        onValueChange={setValue}
        onLoadText={onLoadText}
        onLoadFile={onLoadFile}
        onLoadSample={onLoadSample}
        onError={onError}
        error={error}
        status={status}
        loading={loading}
        idPrefix="load-dialog-diff"
      />
    </dialog>
  );
}
