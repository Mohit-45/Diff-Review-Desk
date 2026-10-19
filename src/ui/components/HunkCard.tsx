import { useId, useState } from 'react';
import type { DiffFile, Flag, Hunk, HunkReview, ReviewState } from '../../core/types';
import { selectHunkReview } from '../../core/review/selectors';
import { SafeText } from './SafeText';
import {
  ApprovedIcon,
  CommentIcon,
  InfoIcon,
  PendingIcon,
  RejectedIcon,
  RiskHighIcon,
  RiskLowIcon,
  RiskMediumIcon,
} from './Icons';
import { CommentEditor } from './CommentEditor';
import { DiffTable } from './DiffTable';

type Decision = HunkReview['decision'];

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
  readonly onDecision?: (decision: Decision) => void;
  readonly onReviewChange?: (review: HunkReview) => void;
  readonly onApprove?: () => void;
  readonly onReject?: () => void;
  readonly onClear?: () => void;
  readonly onComment?: (comment: string) => void;
  readonly onCommentOpen?: () => void;
  readonly className?: string;
};

function pathFor(file: DiffFile | undefined, filePath: string | undefined): string {
  return filePath ?? file?.displayPath ?? file?.newPath ?? file?.oldPath ?? 'diff';
}

function hunkLines(hunk: Hunk): { readonly start: number; readonly end: number } {
  const start = Math.min(hunk.oldStart, hunk.newStart);
  const oldEnd = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart + hunk.oldCount - 1;
  const newEnd = hunk.newCount === 0 ? hunk.newStart : hunk.newStart + hunk.newCount - 1;
  return { start, end: Math.max(oldEnd, newEnd) };
}

function metaReason(reason: Hunk['meta'][number]): string {
  switch (reason) {
    case 'rename':
      return 'This file was renamed; there are no line changes to review.';
    case 'copy':
      return 'This file was copied; there are no line changes to review.';
    case 'mode-change':
      return 'This hunk records a file mode change.';
    case 'type-change':
      return 'This hunk records a file type change.';
    case 'binary':
      return 'This is a binary change and has no text diff to display.';
    case 'empty-file':
      return 'This hunk records an empty file.';
    case 'no-hunks':
      return 'This file has no text hunks.';
    case 'content-omitted':
      return 'The file content was omitted from the diff.';
    case 'combined':
      return 'This combined diff is shown as metadata.';
    case 'unparsed':
      return 'Some diff lines could not be parsed. Review them as raw text.';
  }
}

function flagIcon(severity: Flag['severity']) {
  if (severity === 'high') {
    return <RiskHighIcon />;
  }
  if (severity === 'medium') {
    return <RiskMediumIcon />;
  }
  return <RiskLowIcon />;
}

function decisionIcon(decision: Decision) {
  if (decision === 'approved') {
    return <ApprovedIcon />;
  }
  if (decision === 'rejected') {
    return <RejectedIcon />;
  }
  return <PendingIcon />;
}

function decisionLabel(decision: Decision): string {
  if (decision === 'approved') {
    return 'Approved';
  }
  if (decision === 'rejected') {
    return 'Rejected';
  }
  return 'Pending';
}

function highestSeverity(flags: readonly Flag[]): Flag['severity'] | null {
  if (flags.some((flag) => flag.severity === 'high')) {
    return 'high';
  }
  if (flags.some((flag) => flag.severity === 'medium')) {
    return 'medium';
  }
  if (flags.some((flag) => flag.severity === 'low')) {
    return 'low';
  }
  return null;
}

export function HunkCard({
  hunk,
  file,
  filePath,
  hunkNumber = hunk.index + 1,
  totalHunks = hunkNumber,
  flags = [],
  review,
  reviewState,
  decision,
  comment,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapseChange,
  onDecision,
  onReviewChange,
  onApprove,
  onReject,
  onClear,
  onComment,
  onCommentOpen,
  className,
}: HunkCardProps) {
  const headingId = useId();
  const summaryId = useId();
  const fileHeadingId = useId();
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);
  const [localReview, setLocalReview] = useState<HunkReview>({
    decision: decision ?? null,
    comment: comment ?? '',
  });
  const [editingComment, setEditingComment] = useState(false);
  const path = pathFor(file, filePath);
  const selectedReview =
    reviewState === undefined ? undefined : selectHunkReview(reviewState, hunk.id);
  const currentReview = review ?? selectedReview ?? localReview;
  const currentDecision = decision !== undefined ? decision : currentReview.decision;
  const currentComment = comment !== undefined ? comment : currentReview.comment;
  const isCollapsed = controlledCollapsed ?? localCollapsed;
  const relevantFlags = flags.filter((flag) => {
    if (file !== undefined && flag.fileId !== file.id) {
      return false;
    }
    return flag.hunkId === null || flag.hunkId === hunk.id;
  });
  const highest = highestSeverity(relevantFlags);
  const range = hunkLines(hunk);
  const summary = `${decisionLabel(currentDecision)}. ${relevantFlags.length} flag${relevantFlags.length === 1 ? '' : 's'}, highest ${highest ?? 'none'}. Comment: ${currentComment.trim().length > 0 ? 'yes' : 'no'}.`;
  const articleClass = className === undefined ? 'hunk' : `hunk ${className}`;

  const setDecision = (next: Decision) => {
    const nextReview = { decision: next, comment: currentComment };
    if (
      review === undefined &&
      reviewState === undefined &&
      decision === undefined &&
      comment === undefined
    ) {
      setLocalReview(nextReview);
    }
    onDecision?.(next);
    onReviewChange?.(nextReview);
  };

  const chooseDecision = (next: Exclude<Decision, null>) => {
    const cleared = currentDecision === next;
    if (cleared) {
      onClear?.();
      setDecision(null);
      return;
    }
    if (next === 'approved') {
      onApprove?.();
    } else {
      onReject?.();
    }
    setDecision(next);
    if (next === 'rejected') {
      setEditingComment(true);
    }
  };

  const commitComment = (next: string) => {
    if (
      review === undefined &&
      reviewState === undefined &&
      decision === undefined &&
      comment === undefined
    ) {
      setLocalReview({ decision: currentDecision, comment: next });
    }
    onComment?.(next);
    onReviewChange?.({ decision: currentDecision, comment: next });
    setEditingComment(false);
  };

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    if (controlledCollapsed === undefined) {
      setLocalCollapsed(next);
    }
    onCollapseChange?.(next);
  };

  return (
    <article
      className={articleClass}
      aria-labelledby={`${fileHeadingId} ${headingId}`}
      aria-describedby={summaryId}
      tabIndex={-1}
    >
      <h2 id={fileHeadingId}>
        <SafeText>{path}</SafeText>
      </h2>
      <div id={summaryId} className="sr-only">
        {summary}
      </div>
      <header className="hunk-header">
        <h3 id={headingId}>
          Hunk {hunkNumber} of {totalHunks}, lines {range.start}–{range.end}
        </h3>
        <span className={`decision decision-${currentDecision ?? 'pending'}`}>
          {decisionIcon(currentDecision)}
          <span>{decisionLabel(currentDecision)}</span>
        </span>
      </header>

      {relevantFlags.length > 0 ? (
        <div className="risk-chips" aria-label="Risk flags">
          {relevantFlags.map((flag, index) => (
            <span className={`risk-chip risk-${flag.severity}`} key={`${flag.ruleId}-${index}`}>
              {flagIcon(flag.severity)}
              <SafeText>{flag.severity}</SafeText>
              <SafeText>{flag.title}</SafeText>
            </span>
          ))}
        </div>
      ) : null}

      {relevantFlags.length > 0 ? (
        <details className="flag-details">
          <summary>Why flagged ({relevantFlags.length})</summary>
          <ul>
            {relevantFlags.map((flag, index) => (
              <li key={`${flag.ruleId}-detail-${index}`}>
                <strong>
                  <SafeText>{flag.title}</SafeText>
                </strong>
                <p>
                  <SafeText>{flag.why}</SafeText>
                </p>
                {flag.evidence === undefined ? null : (
                  <p className="flag-evidence">
                    <SafeText>{flag.evidence}</SafeText>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="no-flags">
          <InfoIcon /> No heuristic flags matched.
        </p>
      )}

      <div className="hunk-toolbar" aria-label="Hunk actions">
        <button
          type="button"
          aria-pressed={currentDecision === 'approved'}
          onClick={() => {
            chooseDecision('approved');
          }}
        >
          Approve
        </button>
        <button
          type="button"
          aria-pressed={currentDecision === 'rejected'}
          onClick={() => {
            chooseDecision('rejected');
          }}
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingComment(true);
            onCommentOpen?.();
          }}
        >
          <CommentIcon /> Comment
        </button>
        {hunk.kind === 'text' ? (
          <button type="button" onClick={toggleCollapsed} aria-expanded={!isCollapsed}>
            {isCollapsed ? 'Expand hunk' : 'Collapse hunk'}
          </button>
        ) : null}
      </div>

      {editingComment ? (
        <CommentEditor
          value={currentComment}
          onCommit={commitComment}
          onClose={() => {
            setEditingComment(false);
          }}
          filePath={path}
          hunkNumber={hunkNumber}
          totalHunks={totalHunks}
        />
      ) : currentComment.length > 0 ? (
        <p className="hunk-comment">
          <strong>Comment:</strong> <SafeText>{currentComment}</SafeText>
        </p>
      ) : null}

      {hunk.kind === 'meta' ? (
        <>
          <p className="meta-hunk-message">
            <SafeText>{metaReason(hunk.meta[0] ?? 'unparsed')}</SafeText>
          </p>
          {hunk.lines.length > 0 ? (
            <pre className="meta-hunk-lines">
              <SafeText>{hunk.lines.map((line) => line.text).join('\n')}</SafeText>
            </pre>
          ) : null}
        </>
      ) : isCollapsed ? null : (
        <DiffTable
          hunk={hunk}
          file={file}
          filePath={path}
          hunkNumber={hunkNumber}
          totalHunks={totalHunks}
        />
      )}
    </article>
  );
}

export type { Decision };
