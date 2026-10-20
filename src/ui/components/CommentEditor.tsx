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

/**
 * Why the editor closed. Done and Ctrl/Cmd+Enter advance the review; Esc keeps the
 * reviewer where they are; blur just saves, because the user already moved on.
 */
export type CommentCloseReason = 'done' | 'shortcut' | 'escape' | 'blur';

export type CommentEditorProps = {
  readonly value: string;
  readonly onChange?: (value: string) => void;
  readonly onCommit: (value: string, reason: CommentCloseReason) => void;
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

/** The counter is announced once when it nears the cap and once at the cap, not per key. */
const NEAR_CAP = 1_800;

function capComment(value: string): string {
  const points = Array.from(value);
  return points.length <= LIMITS.maxCommentChars
    ? value
    : points.slice(0, LIMITS.maxCommentChars).join('');
}

function capStatus(length: number): string {
  if (length >= LIMITS.maxCommentChars) {
    return 'Comment limit reached.';
  }
  return length >= NEAR_CAP ? 'Comment is close to the 2,000 character limit.' : '';
}

export function CommentEditor({
  value,
  onChange,
  onCommit,
  onClose,
  onCancel,
  filePath = 'this file',
  hunkNumber = 1,
  totalHunks = hunkNumber,
  autoFocus = true,
  disabled = false,
}: CommentEditorProps) {
  const [draft, setDraft] = useState(() => capComment(value));
  const committed = useRef(false);
  const lastCommittedValue = useRef<string | undefined>(undefined);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const textareaId = useId();
  const counterId = useId();

  useEffect(() => {
    if (autoFocus) {
      areaRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const next = capComment(value);
    setDraft(next);
    if (committed.current && lastCommittedValue.current !== next) {
      committed.current = false;
    }
  }, [value]);

  const commit = (reason: CommentCloseReason) => {
    if (committed.current) {
      return;
    }
    committed.current = true;
    const next = capComment(draft);
    lastCommittedValue.current = next;
    onCommit(next, reason);
    (onClose ?? onCancel)?.();
  };

  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = capComment(event.currentTarget.value);
    setDraft(next);
    onChange?.(next);
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      commit('escape');
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit('shortcut');
    }
  };

  // Moving between the textarea and Done must not close the editor; only leaving it does.
  const blur = (event: FocusEvent<HTMLElement>) => {
    if (event.relatedTarget === areaRef.current || event.relatedTarget === doneRef.current) {
      return;
    }
    commit('blur');
  };

  const length = Array.from(draft).length;

  return (
    <div className="comment-editor">
      <label htmlFor={textareaId}>
        Comment for the AI agent on hunk {String(hunkNumber)} of {String(totalHunks)} in{' '}
        <SafeText>{filePath}</SafeText>
      </label>
      <textarea
        ref={areaRef}
        id={textareaId}
        value={draft}
        onChange={change}
        onKeyDown={keyDown}
        onBlur={blur}
        maxLength={LIMITS.maxCommentChars}
        aria-describedby={counterId}
        disabled={disabled}
        rows={4}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
      <span id={counterId} className="comment-counter">
        {length.toLocaleString('en-US')} / {LIMITS.maxCommentChars.toLocaleString('en-US')}
      </span>
      <span className="sr-only" role="status">
        {capStatus(length)}
      </span>
      <button
        ref={doneRef}
        type="button"
        className="button button-primary"
        onMouseDown={(event) => {
          // Keep focus in the textarea so the click still lands on Done instead of blurring first.
          event.preventDefault();
        }}
        onBlur={blur}
        onClick={() => {
          commit('done');
        }}
        disabled={disabled}
      >
        Done
      </button>
    </div>
  );
}
