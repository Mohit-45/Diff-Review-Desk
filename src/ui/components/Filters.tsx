import { useId } from 'react';
import type { ReactNode } from 'react';
import type { DiffFile, Flag, ReviewState } from '../../core/types';
import { selectDecision, selectHunkReview } from '../../core/review/selectors';
import { SafeText } from './SafeText';

export type FilterStatus =
  'all' | 'pending' | 'approved' | 'rejected' | 'has-comment' | 'new-or-changed';

export type FilterRisk = 'any' | 'flagged' | 'high';

export type ReviewFilters = {
  readonly path: string;
  readonly status: FilterStatus;
  readonly risk: FilterRisk;
};

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  path: '',
  status: 'all',
  risk: 'any',
};

export type FiltersProps = {
  readonly value: ReviewFilters;
  readonly onChange: (filters: ReviewFilters) => void;
  readonly fileCount?: number;
  readonly totalFileCount?: number;
  readonly hunkCount?: number;
  readonly totalHunkCount?: number;
  readonly children?: ReactNode;
};

type FilterContext = {
  readonly state: ReviewState;
  readonly flags: readonly Flag[];
  readonly newOrChangedHunkIds: ReadonlySet<string>;
};

const STATUS_OPTIONS: readonly { readonly value: FilterStatus; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'has-comment', label: 'Has comment' },
  { value: 'new-or-changed', label: 'New or changed' },
];

const RISK_OPTIONS: readonly { readonly value: FilterRisk; readonly label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'high', label: 'High only' },
];

function hasFlagForHunk(file: DiffFile, hunkId: string, flags: readonly Flag[]): boolean {
  return flags.some(
    (flag) => flag.fileId === file.id && (flag.hunkId === null || flag.hunkId === hunkId),
  );
}

function hasHighFlagForHunk(file: DiffFile, hunkId: string, flags: readonly Flag[]): boolean {
  return flags.some(
    (flag) =>
      flag.fileId === file.id &&
      flag.severity === 'high' &&
      (flag.hunkId === null || flag.hunkId === hunkId),
  );
}

function matchesStatus(hunkId: string, status: FilterStatus, context: FilterContext): boolean {
  const decision = selectDecision(context.state, hunkId);
  switch (status) {
    case 'all':
      return true;
    case 'pending':
      return decision === null;
    case 'approved':
      return decision === 'approved';
    case 'rejected':
      return decision === 'rejected';
    case 'has-comment':
      return selectHunkReview(context.state, hunkId).comment.length > 0;
    case 'new-or-changed':
      return context.newOrChangedHunkIds.has(hunkId);
    default:
      return false;
  }
}

function matchesRisk(
  file: DiffFile,
  hunkId: string,
  risk: FilterRisk,
  flags: readonly Flag[],
): boolean {
  if (risk === 'any') {
    return true;
  }
  return risk === 'high'
    ? hasHighFlagForHunk(file, hunkId, flags)
    : hasFlagForHunk(file, hunkId, flags);
}

function pathTerms(path: string): readonly string[] {
  return path
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 0);
}

export function fileMatchesFilters(
  file: DiffFile,
  filters: ReviewFilters,
  state: ReviewState,
  flags: readonly Flag[] = [],
  newOrChangedHunkIds: ReadonlySet<string> = new Set<string>(),
): boolean {
  const terms = pathTerms(filters.path);
  const lowerPath = file.displayPath.toLocaleLowerCase();
  if (terms.some((term) => !lowerPath.includes(term))) {
    return false;
  }
  if (file.hunks.length === 0) {
    return filters.status === 'all' && filters.risk === 'any';
  }
  const context: FilterContext = { state, flags, newOrChangedHunkIds };
  return file.hunks.some(
    (hunk) =>
      matchesStatus(hunk.id, filters.status, context) &&
      matchesRisk(file, hunk.id, filters.risk, flags),
  );
}

export function filterFiles(
  files: readonly DiffFile[],
  filters: ReviewFilters,
  state: ReviewState,
  flags: readonly Flag[] = [],
  newOrChangedHunkIds: ReadonlySet<string> = new Set<string>(),
): readonly DiffFile[] {
  return files.filter((file) =>
    fileMatchesFilters(file, filters, state, flags, newOrChangedHunkIds),
  );
}

function countVisibleHunks(
  files: readonly DiffFile[],
  filters: ReviewFilters,
  state: ReviewState,
  flags: readonly Flag[],
  newOrChangedHunkIds: ReadonlySet<string>,
): number {
  const context: FilterContext = { state, flags, newOrChangedHunkIds };
  const terms = pathTerms(filters.path);
  return files.reduce(
    (count, file) =>
      terms.some((term) => !file.displayPath.toLocaleLowerCase().includes(term))
        ? count
        : count +
          file.hunks.filter(
            (hunk) =>
              matchesStatus(hunk.id, filters.status, context) &&
              matchesRisk(file, hunk.id, filters.risk, flags),
          ).length,
    0,
  );
}

export function Filters({
  value,
  onChange,
  fileCount,
  totalFileCount,
  hunkCount,
  totalHunkCount,
  children,
}: FiltersProps) {
  const pathId = useId();
  const statusId = useId();
  const riskId = useId();

  function setPath(path: string) {
    onChange({ ...value, path });
  }

  function setStatus(status: FilterStatus) {
    onChange({ ...value, status });
  }

  function setRisk(risk: FilterRisk) {
    onChange({ ...value, risk });
  }

  const hasSummary =
    fileCount !== undefined &&
    totalFileCount !== undefined &&
    hunkCount !== undefined &&
    totalHunkCount !== undefined;
  const hasActiveFilters = value.path.length > 0 || value.status !== 'all' || value.risk !== 'any';

  return (
    <section className="review-filters" aria-labelledby={pathId}>
      <h2 id={pathId}>Filters</h2>
      <div className="filter-control">
        <label htmlFor={`${pathId}-input`}>Path</label>
        <input
          id={`${pathId}-input`}
          type="search"
          value={value.path}
          onChange={(event) => {
            setPath(event.currentTarget.value);
          }}
          placeholder="Filter paths"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <fieldset>
        <legend id={statusId}>Status</legend>
        <div className="filter-options">
          {STATUS_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`${statusId}-options`}
                value={option.value}
                checked={value.status === option.value}
                onChange={() => {
                  setStatus(option.value);
                }}
              />
              <SafeText>{option.label}</SafeText>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend id={riskId}>Risk</legend>
        <div className="filter-options">
          {RISK_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`${riskId}-options`}
                value={option.value}
                checked={value.risk === option.value}
                onChange={() => {
                  setRisk(option.value);
                }}
              />
              <SafeText>{option.label}</SafeText>
            </label>
          ))}
        </div>
      </fieldset>
      {hasSummary ? (
        <p className="filter-summary" aria-live="polite">
          <SafeText>
            {`${fileCount} of ${totalFileCount} files, ${hunkCount} of ${totalHunkCount} hunks`}
          </SafeText>
        </p>
      ) : null}
      {hasActiveFilters ? (
        <button
          type="button"
          className="clear-filters"
          onClick={() => {
            onChange(DEFAULT_REVIEW_FILTERS);
          }}
        >
          Clear filters
        </button>
      ) : null}
      {children}
    </section>
  );
}

export { countVisibleHunks };
