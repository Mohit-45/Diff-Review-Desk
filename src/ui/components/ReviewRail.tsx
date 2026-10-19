import type { DiffFile, Flag, ReviewState } from '../../core/types';
import { selectProgress, selectReviewStats } from '../../core/review/selectors';
import {
  DEFAULT_REVIEW_FILTERS,
  Filters,
  countVisibleHunks,
  filterFiles,
  type ReviewFilters,
} from './Filters';
import { FileList } from './FileList';
import { SafeText } from './SafeText';

export type RailNavigation =
  | 'previous-hunk'
  | 'next-hunk'
  | 'previous-pending'
  | 'next-pending'
  | 'previous-file'
  | 'next-file';

export type ReviewRailProps = {
  readonly files: readonly DiffFile[];
  readonly reviewState: ReviewState;
  readonly flags?: readonly Flag[];
  readonly filters?: ReviewFilters;
  readonly onFiltersChange?: (filters: ReviewFilters) => void;
  readonly currentFileId?: string | null;
  readonly currentHunkId?: string | null;
  readonly newOrChangedHunkIds?: ReadonlySet<string>;
  readonly onSelectFile?: (fileId: string) => void;
  readonly onSelectHunk?: (hunkId: string) => void;
  readonly onNavigate?: (target: RailNavigation) => void;
  readonly onPreviousHunk?: () => void;
  readonly onNextHunk?: () => void;
  readonly onPreviousPending?: () => void;
  readonly onNextPending?: () => void;
  readonly onPreviousFile?: () => void;
  readonly onNextFile?: () => void;
};

function ProgressStrip({ files, reviewState }: Pick<ReviewRailProps, 'files' | 'reviewState'>) {
  const progress = selectProgress(files, reviewState);
  const stats = selectReviewStats(files, reviewState);
  return (
    <section className="review-progress" aria-labelledby="review-progress-title">
      <h2 id="review-progress-title">Review progress</h2>
      <p>
        <SafeText>{`${progress.reviewed} of ${progress.total} hunks decided`}</SafeText>
      </p>
      <div
        className="review-progress-bar"
        role="progressbar"
        aria-label="Review progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <div className="review-progress-fill" style={{ inlineSize: `${progress.percent}%` }} />
      </div>
      <p className="review-progress-counts">
        <SafeText>{`Approved ${stats.approved} · Rejected ${stats.rejected} · Pending ${stats.pending}`}</SafeText>
      </p>
      <p className="review-progress-verdict">
        <SafeText>{stats.verdict}</SafeText>
      </p>
    </section>
  );
}

function NavigationButton({
  label,
  target,
  onNavigate,
  onClick,
}: {
  readonly label: string;
  readonly target: RailNavigation;
  readonly onNavigate?: (target: RailNavigation) => void;
  readonly onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.(target);
        onClick?.();
      }}
    >
      <SafeText>{label}</SafeText>
    </button>
  );
}

function HunkNavigation(
  props: Pick<
    ReviewRailProps,
    | 'onNavigate'
    | 'onPreviousHunk'
    | 'onNextHunk'
    | 'onPreviousPending'
    | 'onNextPending'
    | 'onPreviousFile'
    | 'onNextFile'
  >,
) {
  return (
    <div className="review-navigation" role="group" aria-label="Hunk navigation">
      <NavigationButton
        label="Previous hunk"
        target="previous-hunk"
        {...props}
        onClick={props.onPreviousHunk}
      />
      <NavigationButton
        label="Next hunk"
        target="next-hunk"
        {...props}
        onClick={props.onNextHunk}
      />
      <NavigationButton
        label="Previous pending"
        target="previous-pending"
        {...props}
        onClick={props.onPreviousPending}
      />
      <NavigationButton
        label="Next pending"
        target="next-pending"
        {...props}
        onClick={props.onNextPending}
      />
      <NavigationButton
        label="Previous file"
        target="previous-file"
        {...props}
        onClick={props.onPreviousFile}
      />
      <NavigationButton
        label="Next file"
        target="next-file"
        {...props}
        onClick={props.onNextFile}
      />
    </div>
  );
}

export function ReviewRail({
  files,
  reviewState,
  flags = [],
  filters = DEFAULT_REVIEW_FILTERS,
  onFiltersChange,
  currentFileId,
  currentHunkId,
  newOrChangedHunkIds = new Set<string>(),
  onSelectFile,
  onSelectHunk,
  onNavigate,
  onPreviousHunk,
  onNextHunk,
  onPreviousPending,
  onNextPending,
  onPreviousFile,
  onNextFile,
}: ReviewRailProps) {
  const visibleFiles = filterFiles(files, filters, reviewState, flags, newOrChangedHunkIds);
  const visibleHunks = countVisibleHunks(files, filters, reviewState, flags, newOrChangedHunkIds);
  const totalHunks = files.reduce((sum, file) => sum + file.hunks.length, 0);
  return (
    <aside className="review-rail" aria-label="Review rail">
      <ProgressStrip files={files} reviewState={reviewState} />
      <nav aria-label="Changed files">
        <Filters
          value={filters}
          onChange={(nextFilters) => {
            onFiltersChange?.(nextFilters);
          }}
          fileCount={visibleFiles.length}
          totalFileCount={files.length}
          hunkCount={visibleHunks}
          totalHunkCount={totalHunks}
        />
        <FileList
          files={visibleFiles}
          reviewState={reviewState}
          flags={flags}
          currentFileId={currentFileId}
          currentHunkId={currentHunkId}
          onSelectFile={onSelectFile}
          onSelectHunk={onSelectHunk}
        />
      </nav>
      <HunkNavigation
        onNavigate={onNavigate}
        onPreviousHunk={onPreviousHunk}
        onNextHunk={onNextHunk}
        onPreviousPending={onPreviousPending}
        onNextPending={onNextPending}
        onPreviousFile={onPreviousFile}
        onNextFile={onNextFile}
      />
    </aside>
  );
}
