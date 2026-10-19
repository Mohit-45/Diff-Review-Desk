import type { DiffFile, Flag, ReviewState } from '../../core/types';
import { selectDecision, selectHunkReview } from '../../core/review/selectors';
import { SafeText } from './SafeText';

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
    default:
      return null;
  }
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
  return (
    <div className="file-list" aria-label="Changed file list">
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
                  aria-current={isCurrent ? 'location' : undefined}
                  onClick={() => {
                    onSelectFile?.(file.id);
                  }}
                >
                  <span className="file-list-status" aria-hidden="true">
                    {statusSymbol(status)}
                  </span>
                  <span className="sr-only">
                    <SafeText>{status}</SafeText>
                  </span>
                  <span className="file-list-count">
                    <SafeText>{`${counts.decided}/${counts.total}`}</SafeText>
                  </span>
                  <span className="file-list-path">
                    <SafeText>{file.displayPath}</SafeText>
                  </span>
                  <span className="file-list-lines">
                    <SafeText>{`+${file.added} −${file.removed}`}</SafeText>
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
                      <SafeText>{`${counts.comments} comment${counts.comments === 1 ? '' : 's'}`}</SafeText>
                    </span>
                  ) : null}
                </button>
                {onSelectHunk && file.hunks.length > 0 ? (
                  <div className="file-list-hunk-links" aria-label="Hunks in file">
                    {file.hunks.map((hunk) => (
                      <button
                        key={hunk.id}
                        type="button"
                        onClick={() => {
                          onSelectHunk(hunk.id);
                        }}
                        aria-current={currentHunkId === hunk.id ? 'location' : undefined}
                      >
                        <SafeText>{`Hunk ${hunk.index + 1}`}</SafeText>
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
