import { useState, type KeyboardEvent } from 'react';
import type { DiffFile, Flag, ReviewState } from '../../core/types';
import { selectDecision, selectHunkReview } from '../../core/review/selectors';
import { FILE_ROW_SELECTOR, FileHunkLinks, HUNK_LINKS_SELECTOR } from './FileHunkLinks';
import { SafeText } from './SafeText';
import { rovingTarget } from './rovingTarget';

export type FileListProps = {
  readonly files: readonly DiffFile[];
  readonly reviewState: ReviewState;
  readonly flags?: readonly Flag[];
  readonly currentFileId?: string | null;
  readonly currentHunkId?: string | null;
  readonly onSelectFile?: (fileId: string) => void;
  readonly onSelectHunk?: (hunkId: string) => void;
};

type Severity = Flag['severity'];

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { high: 3, medium: 2, low: 1 };

function topRisk(file: DiffFile, flags: readonly Flag[]): Flag | undefined {
  return flags
    .filter((flag) => flag.fileId === file.id)
    .sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity])[0];
}

function fileDecisionCounts(file: DiffFile, reviewState: ReviewState) {
  let decided = 0;
  let approved = 0;
  let rejected = 0;
  let comments = 0;
  for (const hunk of file.hunks) {
    const decision = selectDecision(reviewState, hunk.id);
    if (decision !== null) {
      decided += 1;
      if (decision === 'approved') {
        approved += 1;
      } else {
        rejected += 1;
      }
    }
    if (selectHunkReview(reviewState, hunk.id).comment.length > 0) {
      comments += 1;
    }
  }
  return { decided, approved, rejected, comments, total: file.hunks.length };
}

function statusWord(counts: ReturnType<typeof fileDecisionCounts>): string {
  if (counts.total > 0 && counts.decided === counts.total) {
    return counts.rejected > 0 ? 'Rejected' : 'Approved';
  }
  return counts.decided === 0 ? 'Pending' : 'In progress';
}

function statusSymbol(status: string): string {
  switch (status) {
    case 'Approved':
      return '✓';
    case 'Rejected':
      return '×';
    default:
      return '•';
  }
}

function fileBadge(file: DiffFile): string | null {
  if (file.binary) {
    return 'Binary';
  }
  switch (file.status) {
    case 'added':
      return 'Added';
    case 'deleted':
      return 'Deleted';
    case 'renamed':
      return 'Renamed';
    case 'copied':
      return 'Copied';
    case 'modified':
      return null;
  }
}

/** The file rows are one Tab stop: arrows, Home and End move between them, Right enters the hunks. */
function moveBetweenRows(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  const item = event.currentTarget.closest('li');
  if (event.key === 'ArrowRight') {
    const first = item?.querySelector<HTMLElement>(`${HUNK_LINKS_SELECTOR} button`);
    if (first) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  const rows = Array.from(
    event.currentTarget.closest('ul')?.querySelectorAll<HTMLButtonElement>(FILE_ROW_SELECTOR) ?? [],
  );
  const next = rovingTarget(event.key, rows.indexOf(event.currentTarget), rows.length);
  if (next === null) {
    return;
  }
  event.preventDefault();
  rows[next]?.focus();
}

type RowStop = {
  readonly stopId: string | undefined;
  /** Only this file draws Hunk links, so the list's size does not grow with the diff. */
  readonly linkedId: string | undefined;
  readonly rove: (fileId: string) => void;
};

function useRowStop(
  files: readonly DiffFile[],
  currentFileId: string | null | undefined,
  currentHunkId: string | null | undefined,
): RowStop {
  // The Tab stop follows the current file until a row is focused, then follows the focus; a
  // row focused while another file was current stops counting once the current file changes.
  const [rover, setRover] = useState<{ readonly after: string | null; readonly id: string } | null>(
    null,
  );
  const current = currentFileId ?? null;
  const remembered =
    rover !== null && rover.after === current && files.some((file) => file.id === rover.id)
      ? rover.id
      : null;
  const currentFile = files.find(
    (file) => file.id === currentFileId || file.hunks.some((hunk) => hunk.id === currentHunkId),
  )?.id;
  return {
    stopId: remembered ?? currentFile ?? files[0]?.id,
    linkedId: currentFile ?? files[0]?.id,
    rove: (fileId) => {
      setRover((previous) =>
        previous?.id === fileId && previous.after === current
          ? previous
          : { after: current, id: fileId },
      );
    },
  };
}

export function FileList({
  files,
  reviewState,
  flags = [],
  currentFileId,
  currentHunkId,
  onSelectFile,
  onSelectHunk,
}: FileListProps) {
  const { stopId, linkedId, rove } = useRowStop(files, currentFileId, currentHunkId);
  return (
    <div className="file-list" role="group" aria-label="Changed file list">
      {files.length === 0 ? (
        <p className="file-list-empty">No files match these filters.</p>
      ) : (
        <ul>
          {files.map((file) => {
            const counts = fileDecisionCounts(file, reviewState);
            const status = statusWord(counts);
            const risk = topRisk(file, flags);
            const badge = fileBadge(file);
            const isCurrent =
              currentFileId === file.id || file.hunks.some((hunk) => hunk.id === currentHunkId);
            return (
              <li key={file.id}>
                <button
                  type="button"
                  className="file-list-row"
                  tabIndex={file.id === stopId ? 0 : -1}
                  aria-current={isCurrent ? 'location' : undefined}
                  onFocus={() => {
                    rove(file.id);
                  }}
                  onKeyDown={moveBetweenRows}
                  onClick={() => {
                    onSelectFile?.(file.id);
                  }}
                >
                  <span
                    className="file-list-status"
                    data-status={status.toLowerCase().replace(' ', '-')}
                    aria-hidden="true"
                  >
                    {statusSymbol(status)}
                  </span>
                  <span className="sr-only">
                    <SafeText>{status}</SafeText>
                  </span>
                  <span className="file-list-count">
                    <SafeText>{`${String(counts.decided)}/${String(counts.total)}`}</SafeText>
                  </span>
                  <span className="file-list-path">
                    <SafeText>{file.displayPath}</SafeText>
                  </span>
                  <span className="file-list-lines">
                    <SafeText>{`+${String(file.added)} −${String(file.removed)}`}</SafeText>
                  </span>
                  {risk ? (
                    <span className={`file-list-risk risk-${risk.severity}`}>
                      <SafeText>{`${risk.severity} risk: ${risk.title}`}</SafeText>
                    </span>
                  ) : (
                    <span className="file-list-risk">No flags</span>
                  )}
                  {badge ? (
                    <span className="file-list-badge">
                      <SafeText>{badge}</SafeText>
                    </span>
                  ) : null}
                  {counts.comments > 0 ? (
                    <span className="file-list-comments">
                      <SafeText>{`${String(counts.comments)} comment${counts.comments === 1 ? '' : 's'}`}</SafeText>
                    </span>
                  ) : null}
                </button>
                {onSelectHunk && file.id === linkedId && file.hunks.length > 0 ? (
                  <FileHunkLinks
                    hunks={file.hunks}
                    currentHunkId={currentHunkId}
                    onSelectHunk={onSelectHunk}
                    onFocusWithin={() => {
                      rove(file.id);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
