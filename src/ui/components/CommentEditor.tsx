import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { LIMITS } from '../../core/limits';
import type { Hunk } from '../../core/types';
import { SafeText } from './SafeText';

export type CommentEditorProps = {
  readonly value: string;
  readonly onChange?: (value: string) => void;
  readonly onCommit: (value: string) => void;
  readonly onClose?: () => void;
  /** Alias for consumers that call the close action cancel. Esc still commits first. */
  readonly onCancel?: () => void;
  readonly hunk?: Hunk;
  readonly filePath?: string;
  readonly hunkNumber?: number;
  readonly totalHunks?: number;
  readonly autoFocus?: boolean;
  readonly disabled?: boolean;
};

function capComment(value: string): string {
  const points = Array.from(value);
  return points.length <= LIMITS.maxCommentChars
    ? value
    : points.slice(0, LIMITS.maxCommentChars).join('');
}

function safePath(filePath: string | undefined): string {
  return filePath ?? 'this file';
}

export function CommentEditor({
  value,
  onChange,
  onCommit,
  onClose,
  onCancel,
  filePath,
  hunkNumber = 1,
  totalHunks = hunkNumber,
  autoFocus = true,
  disabled = false,
}: CommentEditorProps) {
  const [draft, setDraft] = useState(() => capComment(value));
  const committed = useRef(false);
  const lastCommittedValue = useRef<string | undefined>(undefined);
  const textareaId = useId();
  const counterId = useId();

  useEffect(() => {
    const next = capComment(value);
    setDraft(next);
    if (committed.current && lastCommittedValue.current !== next) {
      committed.current = false;
    }
  }, [value]);

  const close = () => {
    if (onClose !== undefined) {
      onClose();
    } else {
      onCancel?.();
    }
  };

  const commit = () => {
    if (committed.current) {
      return;
    }
    committed.current = true;
    const next = capComment(draft);
    lastCommittedValue.current = next;
    onCommit(next);
    close();
  };

  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = capComment(event.currentTarget.value);
    setDraft(next);
    onChange?.(next);
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      commit();
    }
  };

  const blur = (_event: FocusEvent<HTMLTextAreaElement>) => {
    commit();
  };

  const length = Array.from(draft).length;
  const labelPath = safePath(filePath);

  return (
    <div className="comment-editor">
      <label htmlFor={textareaId}>
        Comment for the AI agent on hunk {hunkNumber} of {totalHunks} in{' '}
        <SafeText>{labelPath}</SafeText>
      </label>
      <textarea
        id={textareaId}
        value={draft}
        onChange={change}
        onKeyDown={keyDown}
        onBlur={blur}
        maxLength={LIMITS.maxCommentChars}
        aria-describedby={counterId}
        autoFocus={autoFocus}
        disabled={disabled}
        rows={4}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
      <span id={counterId} className="comment-counter" aria-live="polite">
        {length.toLocaleString()} / {LIMITS.maxCommentChars.toLocaleString()}
      </span>
      <button type="button" className="button button-primary" onClick={commit} disabled={disabled}>
        Done
      </button>
    </div>
  );
}
