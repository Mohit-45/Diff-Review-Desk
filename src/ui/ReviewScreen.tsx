import { useMemo, useReducer, useState } from 'react';
import { createReviewHistory, reviewHistoryReducer } from '../core/review/history';
import { selectPending } from '../core/review/selectors';
import type { Command, DiffFile, ParseWarning, Prefs, ReviewState } from '../core/types';
import { DEFAULT_REVIEW_FILTERS } from './components/Filters';
import { useAnnouncer, type Announcement } from './announce';
import { carryBannerModel } from './carryOverActions';
import { ShortcutHintsContext } from './KeyHint';
import { runCommand, type CommandDeps } from './reviewCommands';
import { buildEntries, buildView, firstPending } from './reviewModel';
import { defaultCollapsedIds } from './renderPlan';
import { ReviewHeader } from './ReviewHeader';
import { ReviewMain } from './ReviewMain';
import type { IntakeState, ReviewSession } from './reviewTypes';
import { createScreenActions } from './screenActions';
import { ScreenDialogs } from './ScreenDialogs';
import { ScreenRail } from './ScreenRail';
import { useDialogs } from './useDialogs';
import { useFocusRefs, useFocusTargets } from './useFocusTargets';
import { composeHunkHandlers } from './limitHandlers';
import { skipHandlers } from './skipHandlers';
import { useIntakeEffects } from './useIntakeEffects';
import { useListView } from './useListView';
import { useLiveState } from './useLiveState';
import { useReviewInput } from './useReviewInput';
import { useReviewAnalysis } from './useReviewAnalysis';
import { useReviewSaving } from './useReviewSaving';

type ReviewScreenProps = {
  readonly files: readonly DiffFile[];
  readonly warnings: readonly ParseWarning[];
  readonly initialState: ReviewState;
  readonly intake: IntakeState;
  readonly status: Announcement;
  readonly prefs: Prefs;
  readonly onPrefsChange: (prefs: Prefs) => void;
  readonly session: ReviewSession;
};

/**
 * Mounted with a key per loaded diff, so the reducer always starts from the
 * loaded diff's own hunk ids instead of inheriting a stale or empty list.
 */
export function ReviewScreen({
  files,
  warnings,
  initialState,
  intake,
  status,
  prefs,
  onPrefsChange,
  session,
}: ReviewScreenProps) {
  const [history, dispatch] = useReducer(reviewHistoryReducer, initialState, createReviewHistory);
  const state = history.present;
  const { flags, ruleGroups, exportWarnings } = useReviewAnalysis(files, warnings);
  const entries = useMemo(() => buildEntries(files), [files]);
  const [initialId] = useState(() => (firstPending(entries, state) ?? entries[0])?.hunk.id ?? null);
  const [currentId, setCurrentId] = useState<string | null>(initialId);
  const listView = useListView(entries, initialId);
  const [filters, setFilters] = useState(DEFAULT_REVIEW_FILTERS);
  const [collapsedIds, setCollapsed] = useState<ReadonlySet<string>>(() =>
    defaultCollapsedIds(entries),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(session.carryoverDismissed);
  const [announcement, announce] = useAnnouncer();
  // A review that came back after a reload has the current hunk set but takes no focus.
  const refs = useFocusRefs();
  const focus = useFocusTargets(refs, session.restoredOnReload ? null : initialId);
  const saving = useReviewSaving({
    session,
    files,
    state,
    prefs,
    editingId,
    dismissed,
    withholdDiff: ruleGroups.length > 0,
  });
  useLiveState(state, session.onLiveState);
  const dialogs = useDialogs((invoker) => {
    focus.focus({ kind: 'restore', invoker, fallbackId: currentId });
  });
  const view = buildView(entries, filters, { state, flags }, currentId);
  const actions = createScreenActions({
    history,
    dispatch,
    setCurrentId,
    setCollapsed,
    setEditingId,
    focus,
    revealTarget: listView.revealTarget,
    dialogs,
    announce,
  });
  const deps: CommandDeps = { view, history, currentId, prefs, actions };
  const command = (next: Command) => {
    runCommand(next, deps);
  };

  useIntakeEffects(status, intake, dialogs, announce);

  useReviewInput({ prefs, dialogs, intake, command });

  const clearFilters = () => {
    setFilters(DEFAULT_REVIEW_FILTERS);
    focus.focus({ kind: 'path-filter' });
  };

  const handlers = composeHunkHandlers(
    {
      deps,
      actions,
      onDraftChange: saving.onDraftChange,
      setEditingId,
      setCollapsed,
      setCurrentId,
      register: focus.register,
    },
    listView,
    focus,
  );

  return (
    <ShortcutHintsContext value={prefs.shortcutsEnabled}>
      <ReviewHeader
        label={state.label}
        save={saving.status}
        onCommand={command}
        {...skipHandlers(focus, actions, currentId)}
      />
      <div className="review-layout">
        <ScreenRail
          files={files}
          state={state}
          flags={flags}
          filters={filters}
          onFiltersChange={setFilters}
          entries={entries}
          deps={deps}
          pathInputRef={refs.pathFilter}
          navRef={refs.nav}
        />
        <ReviewMain
          mainRef={refs.main}
          loading={intake.loading}
          announcement={announcement}
          storage={session.storage}
          storageNotes={saving.diffNote === null ? [] : [saving.diffNote]}
          report={{ warnings, files, summaryRef: refs.parseReport }}
          ruleGroups={ruleGroups}
          banner={carryBannerModel({
            state,
            dismissed,
            setDismissed,
            entries,
            currentId,
            setFilters,
            actions,
          })}
          notices={{
            total: entries.length,
            pending: selectPending(files, state),
            matching: view.matching.length,
            onExport: () => {
              command('export');
            },
            onClearFilters: clearFilters,
          }}
          entries={view.visible}
          totalHunks={entries.length}
          list={{
            state,
            flags,
            currentId,
            collapsedIds,
            editingId,
            render: listView.render,
            revealedIds: listView.revealedIds,
          }}
          handlers={handlers}
          onClearData={session.onClearData}
        />
      </div>
      <ScreenDialogs
        dialogs={dialogs}
        review={{ files, state, flags }}
        deps={deps}
        intake={intake}
        status={status}
        prefs={prefs}
        onPrefsChange={onPrefsChange}
        session={session}
        exportWarnings={exportWarnings}
        announce={announce}
      />
    </ShortcutHintsContext>
  );
}
