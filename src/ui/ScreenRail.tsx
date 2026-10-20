import type { RefObject } from 'react';
import type { DiffFile, Flag, ReviewState } from '../core/types';
import type { ReviewFilters } from './components/Filters';
import { ReviewRail } from './components/ReviewRail';
import { goToFile, runCommand, type CommandDeps } from './reviewCommands';
import { findEntry, type Entry } from './reviewModel';

type ScreenRailProps = {
  readonly files: readonly DiffFile[];
  readonly state: ReviewState;
  readonly flags: readonly Flag[];
  readonly filters: ReviewFilters;
  readonly onFiltersChange: (filters: ReviewFilters) => void;
  readonly entries: readonly Entry[];
  readonly deps: CommandDeps;
  readonly pathInputRef: RefObject<HTMLInputElement | null>;
  readonly navRef: RefObject<HTMLElement | null>;
};

/** The rail wired to the screen's commands: every control goes through the same model as a key. */
export function ScreenRail({
  files,
  state,
  flags,
  filters,
  onFiltersChange,
  entries,
  deps,
  pathInputRef,
  navRef,
}: ScreenRailProps) {
  const { currentId, actions } = deps;
  return (
    <ReviewRail
      files={files}
      reviewState={state}
      flags={flags}
      filters={filters}
      onFiltersChange={onFiltersChange}
      currentHunkId={currentId}
      currentFileId={findEntry(entries, currentId)?.file.id ?? null}
      onSelectFile={(fileId) => {
        goToFile(deps, fileId);
      }}
      onSelectHunk={actions.goTo}
      onNavigate={(command) => {
        runCommand(command, deps);
      }}
      pathInputRef={pathInputRef}
      navRef={navRef}
      onFilterLeave={() => {
        if (currentId !== null) actions.goTo(currentId);
      }}
    />
  );
}
