import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { newOrChangedIdsOf } from '../../app/carryFacts';
import type { DiffFile, Flag, Hunk, ReviewState } from '../../core/types';
import { selectDecision, selectHunkReview } from '../../core/review/selectors';

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
  /** Lets the review screen focus the path field for `/` and for Clear filters. */
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  /** The "New or changed" status exists only from round 2, when there is a previous round. */
  readonly showNewOrChanged?: boolean;
  /** Called by the second Esc in the path field, when there is nothing left to clear. */
  readonly onLeave?: () => void;
};

export type FilterContext = {
  readonly state: ReviewState;
  readonly flags: readonly Flag[];
  readonly newOrChanged: ReadonlySet<string>;
};

type Option<T extends string> = { readonly value: T; readonly label: string };

const STATUS_OPTIONS: readonly Option<FilterStatus>[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'has-comment', label: 'Has comment' },
  { value: 'new-or-changed', label: 'New or changed' },
];

const RISK_OPTIONS: readonly Option<FilterRisk>[] = [
  { value: 'any', label: 'Any' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'high', label: 'High only' },
];

export function createFilterContext(state: ReviewState, flags: readonly Flag[]): FilterContext {
  return { state, flags, newOrChanged: new Set(newOrChangedIdsOf(state)) };
}

function flagsForHunk(file: DiffFile, hunkId: string, flags: readonly Flag[]): readonly Flag[] {
  return flags.filter(
    (flag) => flag.fileId === file.id && (flag.hunkId === null || flag.hunkId === hunkId),
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
      return context.newOrChanged.has(hunkId);
  }
}

function matchesRisk(file: DiffFile, hunkId: string, risk: FilterRisk, flags: readonly Flag[]) {
  if (risk === 'any') {
    return true;
  }
  const relevant = flagsForHunk(file, hunkId, flags);
  return risk === 'high' ? relevant.some((flag) => flag.severity === 'high') : relevant.length > 0;
}

function pathTerms(path: string): readonly string[] {
  return path
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 0);
}

function pathMatches(file: DiffFile, path: string): boolean {
  const lowerPath = file.displayPath.toLocaleLowerCase();
  return pathTerms(path).every((term) => lowerPath.includes(term));
}

/** Path, status and risk all apply to one hunk; used to build the visible hunk list. */
export function hunkMatchesFilters(
  file: DiffFile,
  hunk: Hunk,
  filters: ReviewFilters,
  context: FilterContext,
): boolean {
  return (
    pathMatches(file, filters.path) &&
    matchesStatus(hunk.id, filters.status, context) &&
    matchesRisk(file, hunk.id, filters.risk, context.flags)
  );
}

export function fileMatchesFilters(
  file: DiffFile,
  filters: ReviewFilters,
  state: ReviewState,
  flags: readonly Flag[] = [],
): boolean {
  if (!pathMatches(file, filters.path)) {
    return false;
  }
  if (file.hunks.length === 0) {
    return filters.status === 'all' && filters.risk === 'any';
  }
  const context = createFilterContext(state, flags);
  return file.hunks.some((hunk) => hunkMatchesFilters(file, hunk, filters, context));
}

export function filterFiles(
  files: readonly DiffFile[],
  filters: ReviewFilters,
  state: ReviewState,
  flags: readonly Flag[] = [],
): readonly DiffFile[] {
  return files.filter((file) => fileMatchesFilters(file, filters, state, flags));
}

export function countVisibleHunks(
  files: readonly DiffFile[],
  filters: ReviewFilters,
  state: ReviewState,
  flags: readonly Flag[],
): number {
  const context = createFilterContext(state, flags);
  return files.reduce(
    (count, file) =>
      count + file.hunks.filter((hunk) => hunkMatchesFilters(file, hunk, filters, context)).length,
    0,
  );
}

type RadioFilterProps<T extends string> = {
  readonly legend: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onSelect: (value: T) => void;
};

function RadioFilter<T extends string>({ legend, options, value, onSelect }: RadioFilterProps<T>) {
  const name = useId();
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="filter-options">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onSelect(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type SummaryProps = Pick<
  FiltersProps,
  'fileCount' | 'totalFileCount' | 'hunkCount' | 'totalHunkCount'
>;

function FilterSummary({ fileCount, totalFileCount, hunkCount, totalHunkCount }: SummaryProps) {
  if (
    fileCount === undefined ||
    totalFileCount === undefined ||
    hunkCount === undefined ||
    totalHunkCount === undefined
  ) {
    return null;
  }
  return (
    <p className="filter-summary" aria-live="polite">
      {`${String(fileCount)} of ${String(totalFileCount)} files, ${String(hunkCount)} of ${String(totalHunkCount)} hunks`}
    </p>
  );
}

export function Filters({
  value,
  onChange,
  children,
  inputRef,
  onLeave,
  showNewOrChanged = true,
  ...counts
}: FiltersProps) {
  const pathId = useId();
  const ownRef = useRef<HTMLInputElement>(null);
  const pathRef = inputRef ?? ownRef;
  const hasActiveFilters = value.path.length > 0 || value.status !== 'all' || value.risk !== 'any';

  function handlePathKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    if (value.path.length > 0) {
      onChange({ ...value, path: '' });
      return;
    }
    onLeave?.();
  }

  return (
    <section className="review-filters" aria-labelledby={pathId}>
      <h2 id={pathId}>Filters</h2>
      <div className="filter-control">
        <label htmlFor={`${pathId}-input`}>Path</label>
        <input
          ref={pathRef}
          id={`${pathId}-input`}
          type="search"
          value={value.path}
          onChange={(event) => {
            onChange({ ...value, path: event.currentTarget.value });
          }}
          onKeyDown={handlePathKey}
          placeholder="Filter paths"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <RadioFilter
        legend="Status"
        options={
          showNewOrChanged
            ? STATUS_OPTIONS
            : STATUS_OPTIONS.filter((option) => option.value !== 'new-or-changed')
        }
        value={value.status}
        onSelect={(status) => {
          onChange({ ...value, status });
        }}
      />
      <RadioFilter
        legend="Risk"
        options={RISK_OPTIONS}
        value={value.risk}
        onSelect={(risk) => {
          onChange({ ...value, risk });
        }}
      />
      <FilterSummary {...counts} />
      {hasActiveFilters ? (
        <button
          type="button"
          className="clear-filters"
          onClick={() => {
            onChange(DEFAULT_REVIEW_FILTERS);
            pathRef.current?.focus();
          }}
        >
          Clear filters
        </button>
      ) : null}
      {children}
    </section>
  );
}
