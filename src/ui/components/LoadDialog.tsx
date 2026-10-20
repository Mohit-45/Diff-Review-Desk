import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { PendingChoice, PendingLoad } from '../../app/loadPlan';
import type { ParseError } from '../../core/types';
import type { BuiltInSample } from '../../samples';
import { DIALOG_TITLE_IDS } from '../dialogIds';
import { DocumentPasteListener } from './DocumentPasteListener';
import { DropZone } from './DropZone';
import { ErrorPanel } from './ErrorPanel';
import { LoadDecision } from './LoadDecision';
import {
  emptyError,
  fileError,
  isBlank,
  loadedStatus,
  unreadableFileError,
} from './intakeValidation';
import { appMessages } from '../messages/app';
import { SafeText } from './SafeText';
import { SampleButtons } from './SampleButtons';

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
  /** Present while the error on show is a file that could not be read: reads that file again. */
  readonly onRetry?: (() => void) | null;
};

export type LoadDialogProps = {
  readonly open: boolean;
  readonly initialText?: string;
  readonly error?: ParseError | null;
  readonly status?: string;
  readonly loading?: boolean;
  /**
   * Render a labelled section instead of a native dialog, for a parent that
   * already owns the `<dialog>` element. Nesting two dialogs gives assistive
   * technology a dialog inside a dialog.
   */
  readonly embedded?: boolean;
  readonly onClose: () => void;
  readonly onLoadText: (text: string) => void;
  readonly onLoadFile: LoadFileCallback;
  readonly onLoadSample: (sample: BuiltInSample) => void;
  readonly onError?: (error: ParseError) => void;
  readonly onRetry?: (() => void) | null;
  /** Step 2: a parsed diff that waits for the user to pick what happens to the open review. */
  readonly pending?: PendingLoad | null;
  readonly onResolvePending?: (choice: PendingChoice) => void;
  readonly onCancelPending?: () => void;
};

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
  onRetry = null,
}: IntakeControlsProps) {
  const [localError, setLocalError] = useState<ParseError | null>(null);
  const [localStatus, setLocalStatus] = useState('');
  const pickerRef = useRef<HTMLInputElement>(null);
  const textareaId = `${idPrefix}-input`;
  const displayedError = error ?? localError;
  // The parse itself blocks the page, so this line is what stays on screen while it runs.
  const displayedStatus = loading ? appMessages.reading : (status ?? localStatus);

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

  function handleFile(file: File, ignoredFileCount: number): void {
    const validation = fileError(file);
    if (validation !== null) {
      reportError(validation);
      return;
    }
    setLocalError(null);
    setLocalStatus(loadedStatus(file, ignoredFileCount));
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
      <DropZone
        id={`${idPrefix}-drop-zone`}
        onFile={handleFile}
        onUnreadable={() => {
          reportError(unreadableFileError());
        }}
      />
      {showPrivacyLine && (
        <p className="privacy-line">
          Private by design. Your diff, comments and decisions never leave this browser. This page
          makes no network requests. Diff text is kept in this tab&apos;s session storage. Decisions
          and comments are saved in this browser.
        </p>
      )}
      <SampleButtons disabled={loading} onLoadSample={loadSample} />
      {displayedError !== null && (
        <ErrorPanel error={displayedError} onLoadSample={loadSample} onRetry={onRetry} />
      )}
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

function DialogFrame({
  embedded,
  labelId,
  loading,
  children,
}: {
  readonly embedded: boolean;
  readonly labelId: string;
  readonly loading: boolean;
  readonly children: ReactNode;
}) {
  if (embedded) {
    // A plain block: the parent's dialog carries the name, and a second labelled region here
    // would add a landmark inside it.
    return (
      <div className="load-dialog" aria-busy={loading || undefined}>
        {children}
      </div>
    );
  }
  return (
    <dialog open aria-labelledby={labelId} aria-busy={loading || undefined}>
      {children}
    </dialog>
  );
}

export function LoadDialog({
  open,
  initialText = '',
  error,
  status,
  loading = false,
  embedded = false,
  onClose,
  onLoadText,
  onLoadFile,
  onLoadSample,
  onError,
  onRetry,
  pending = null,
  onResolvePending,
  onCancelPending,
}: LoadDialogProps) {
  const [value, setValue] = useState(initialText);
  const dialogId = DIALOG_TITLE_IDS.load;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const wasPending = useRef(false);
  // Going back from step 2 removes the button that held focus, so the title takes it.
  useEffect(() => {
    if (wasPending.current && pending === null) {
      titleRef.current?.focus();
    }
    wasPending.current = pending !== null;
  }, [pending]);
  if (!open) {
    return null;
  }
  return (
    <DialogFrame embedded={embedded} labelId={dialogId} loading={loading}>
      <div className="dialog-header">
        <h2 id={dialogId} ref={titleRef} tabIndex={-1}>
          Load a diff
        </h2>
        <button type="button" className="button button-secondary" onClick={onClose}>
          Close
        </button>
      </div>
      {pending !== null && onResolvePending !== undefined && onCancelPending !== undefined ? (
        <LoadDecision pending={pending} onResolve={onResolvePending} onCancel={onCancelPending} />
      ) : (
        <IntakeControls
          value={value}
          onValueChange={setValue}
          onLoadText={onLoadText}
          onLoadFile={onLoadFile}
          onLoadSample={onLoadSample}
          onError={onError}
          onRetry={onRetry}
          error={error}
          status={status}
          loading={loading}
          idPrefix="load-dialog-diff"
        />
      )}
    </DialogFrame>
  );
}
