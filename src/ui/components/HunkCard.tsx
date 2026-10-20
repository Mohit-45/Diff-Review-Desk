import { useEffect, useId, useRef, useState } from 'react';
import type { CarryBadge } from '../../app/carryFacts';
import type { DiffFile, Flag, Hunk, HunkReview, ReviewState } from '../../core/types';
import { selectHunkReview } from '../../core/review/selectors';
import { isSensitiveFile, maskHunk } from '../hunkMasking';
import { hunkMessages } from '../messages/hunk';
import { CarryBadges } from './CarryBadges';
import { SafeText } from './SafeText';
import { CommentEditor, type CommentCloseReason } from './CommentEditor';
import {
  FlagSection,
  HunkBody,
  HunkHeader,
  hunkSummary,
  pathFor,
  relevantFlagsFor,
  type Decision,
} from './HunkCardParts';
import { HunkToolbar } from './HunkToolbar';

export type HunkCardProps = {
  readonly hunk: Hunk;
  readonly file?: DiffFile;
  readonly filePath?: string;
  readonly hunkNumber?: number;
  readonly totalHunks?: number;
  readonly flags?: readonly Flag[];
  readonly review?: HunkReview;
  readonly reviewState?: ReviewState;
  readonly decision?: Decision;
  readonly comment?: string;
  readonly collapsed?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly onCollapseChange?: (collapsed: boolean) => void;
  /** Whether this hunk shows its secrets as typed. Session memory only, never saved. */
  readonly revealed?: boolean;
  readonly onRevealChange?: (revealed: boolean) => void;
  /** Controlled comment editor; without it the card keeps its own open state. */
  readonly editing?: boolean;
  readonly onEditingChange?: (editing: boolean) => void;
  readonly onCommentClose?: (reason: CommentCloseReason) => void;
  /** Every keystroke in the open editor, before it commits, so the screen can tell a draft is at risk. */
  readonly onDraftChange?: (text: string) => void;
  /** True for the one hunk that holds the roving tab stop. */
  readonly current?: boolean;
  /** Fires when focus lands anywhere inside the card, so the screen can track the current hunk. */
  readonly onFocusHunk?: () => void;
  readonly articleRef?: (element: HTMLElement | null) => void;
  readonly onDecision?: (decision: Decision) => void;
  readonly onReviewChange?: (review: HunkReview) => void;
  readonly onApprove?: () => void;
  readonly onReject?: () => void;
  readonly onClear?: () => void;
  readonly onComment?: (comment: string) => void;
  readonly onCommentOpen?: () => void;
  readonly className?: string;
  /** Where this hunk stands against the previous round; absent in round 1. */
  readonly carry?: CarryBadge | null;
};

/** A prop wins when the parent supplies it; otherwise the card keeps its own copy. */
function useControllable<T>(
  controlled: T | undefined,
  initial: T,
  onChange: ((next: T) => void) | undefined,
): readonly [T, (next: T) => void] {
  const [local, setLocal] = useState(initial);
  const set = (next: T) => {
    setLocal(next);
    onChange?.(next);
  };
  return [controlled ?? local, set];
}

function useHunkReview(props: HunkCardProps) {
  const { hunk, review, reviewState, decision, comment } = props;
  const [localReview, setLocalReview] = useState<HunkReview>({
    decision: decision ?? null,
    comment: comment ?? '',
  });
  const standalone =
    review === undefined &&
    reviewState === undefined &&
    decision === undefined &&
    comment === undefined;
  const selected = reviewState === undefined ? undefined : selectHunkReview(reviewState, hunk.id);
  const base = review ?? selected ?? localReview;
  const current: HunkReview = {
    decision: decision !== undefined ? decision : base.decision,
    comment: comment !== undefined ? comment : base.comment,
  };

  const setDecision = (next: Decision) => {
    const nextReview = { decision: next, comment: current.comment };
    if (standalone) {
      setLocalReview(nextReview);
    }
    props.onDecision?.(next);
    props.onReviewChange?.(nextReview);
  };

  const setComment = (next: string) => {
    if (standalone) {
      setLocalReview({ decision: current.decision, comment: next });
    }
    props.onComment?.(next);
    props.onReviewChange?.({ decision: current.decision, comment: next });
  };

  return { ...current, setDecision, setComment };
}

/** The saved comment, or the reminder that a rejected hunk has none. */
function HunkNote({
  decision,
  comment,
}: {
  readonly decision: Decision;
  readonly comment: string;
}) {
  if (comment.length > 0) {
    return (
      <p className="hunk-comment">
        <strong>Comment:</strong> <SafeText>{comment}</SafeText>
      </p>
    );
  }
  return decision === 'rejected' ? (
    <p className="hunk-no-comment">{hunkMessages.noCommentYet}</p>
  ) : null;
}

export function HunkCard(props: HunkCardProps) {
  const { hunk, file, flags = [], current = false, onFocusHunk, articleRef } = props;
  const hunkNumber = props.hunkNumber ?? hunk.index + 1;
  const totalHunks = props.totalHunks ?? hunkNumber;
  const headingId = useId();
  const summaryId = useId();
  const fileHeadingId = useId();
  const commentRef = useRef<HTMLButtonElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const focusTable = useRef(false);
  const review = useHunkReview(props);
  const [collapsed, setCollapsed] = useControllable(
    props.collapsed,
    props.defaultCollapsed ?? false,
    props.onCollapseChange,
  );
  const [editing, setEditing] = useControllable(props.editing, false, props.onEditingChange);
  const [revealed, setRevealed] = useControllable(props.revealed, false, props.onRevealChange);
  const path = pathFor(file, props.filePath);
  const rovingTabIndex = current ? 0 : -1;
  const relevantFlags = relevantFlagsFor(flags, file, hunk);
  const hasMasked = maskHunk(hunk, isSensitiveFile(file, props.filePath)).hasMasked;

  // Closing the editor by hand puts focus back on Comment; a blur must not steal it.
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      commentRef.current?.focus();
    }
  }, [editing]);

  const choose = (next: 'approved' | 'rejected') => {
    if (review.decision === next) {
      props.onClear?.();
      review.setDecision(null);
      return;
    }
    (next === 'approved' ? props.onApprove : props.onReject)?.();
    review.setDecision(next);
    if (next === 'rejected') {
      setEditing(true);
    }
  };

  const closeEditor = (next: string, reason: CommentCloseReason) => {
    review.setComment(next);
    returnFocus.current = reason !== 'blur';
    setEditing(false);
    props.onCommentClose?.(reason);
  };

  return (
    <article
      ref={articleRef}
      className={props.className === undefined ? 'hunk' : `hunk ${props.className}`}
      aria-labelledby={`${fileHeadingId} ${headingId}`}
      aria-describedby={summaryId}
      aria-current={current ? 'true' : undefined}
      tabIndex={rovingTabIndex}
      onFocusCapture={() => {
        onFocusHunk?.();
      }}
    >
      <h2 id={fileHeadingId}>
        <SafeText>{path}</SafeText>
      </h2>
      <div id={summaryId} className="sr-only">
        {hunkSummary(review.decision, relevantFlags, review.comment)}
      </div>
      <HunkHeader
        id={headingId}
        hunk={hunk}
        hunkNumber={hunkNumber}
        totalHunks={totalHunks}
        decision={review.decision}
      />
      <CarryBadges badge={props.carry} />
      <FlagSection flags={relevantFlags} />
      <HunkToolbar
        decision={review.decision}
        collapsed={collapsed}
        collapsible={hunk.kind === 'text'}
        approveRef={approveRef}
        commentRef={commentRef}
        onChoose={choose}
        onClear={() => {
          props.onClear?.();
          review.setDecision(null);
          approveRef.current?.focus();
        }}
        onComment={() => {
          setEditing(true);
          props.onCommentOpen?.();
        }}
        onToggleCollapse={() => {
          setCollapsed(!collapsed);
        }}
        reveal={
          hasMasked
            ? {
                revealed,
                onToggle: () => {
                  setRevealed(!revealed);
                },
              }
            : null
        }
      />
      {editing ? (
        <CommentEditor
          value={review.comment}
          onChange={props.onDraftChange}
          onCommit={closeEditor}
          filePath={path}
          hunkNumber={hunkNumber}
          totalHunks={totalHunks}
        />
      ) : (
        <HunkNote decision={review.decision} comment={review.comment} />
      )}
      <HunkBody
        hunk={hunk}
        file={file}
        path={path}
        hunkNumber={hunkNumber}
        totalHunks={totalHunks}
        collapsed={collapsed}
        revealed={revealed}
        onShowDiff={() => {
          focusTable.current = true;
          setCollapsed(false);
        }}
        claimFocus={() => {
          const wanted = focusTable.current;
          focusTable.current = false;
          return wanted;
        }}
      />
    </article>
  );
}

export type { Decision };
