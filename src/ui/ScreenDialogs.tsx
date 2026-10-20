import type { ParseWarning, Prefs } from '../core/types';
import type { Announcement } from './announce';
import { goToFirstNeedingAttention } from './attention';
import type { CommandDeps } from './reviewCommands';
import { ReviewDialogs } from './ReviewDialogs';
import type { IntakeState, ReviewData, ReviewSession } from './reviewTypes';
import type { Dialogs } from './useDialogs';
import { useExportTime } from './useExportTime';
import { useFreshStatus } from './useFreshStatus';
import { useStrayReview } from './useStrayReview';

type ScreenDialogsProps = {
  readonly dialogs: Dialogs;
  readonly review: ReviewData;
  readonly deps: CommandDeps;
  readonly intake: IntakeState;
  /** The screen's latest status line; the Load dialog shows it only if it came after opening. */
  readonly status: Announcement;
  readonly prefs: Prefs;
  readonly onPrefsChange: (prefs: Prefs) => void;
  readonly session: ReviewSession;
  readonly exportWarnings: readonly ParseWarning[];
  /** The screen's own live region, for a stray paste that no dialog is in the way of. */
  readonly announce: (text: string) => void;
};

/**
 * The review screen's dialogs with what only the screen knows: when an export was made, the
 * overall note as one undo step, and where each "Go to first" link leads.
 */
export function ScreenDialogs({
  dialogs,
  review,
  deps,
  intake,
  status,
  prefs,
  onPrefsChange,
  session,
  exportWarnings,
  announce,
}: ScreenDialogsProps) {
  const generatedAt = useExportTime(dialogs.current === 'export', session.clock);
  const stray = useStrayReview(dialogs, intake, announce);
  const loadStatus = useFreshStatus(dialogs.current === 'load', status);
  return (
    <ReviewDialogs
      current={dialogs.current}
      onClose={dialogs.close}
      review={review}
      intake={intake}
      status={loadStatus}
      prefs={prefs}
      onPrefsChange={onPrefsChange}
      onClearData={session.onClearData}
      pastedText={stray.pastedText}
      notice={stray.notice}
      exporting={{
        warnings: exportWarnings,
        generatedAt,
        onOverallNoteCommit: (note) => {
          deps.actions.apply({ type: 'setOverallNote', note });
        },
      }}
      onGoToFirst={(target) => {
        dialogs.close('export');
        goToFirstNeedingAttention(deps, target);
      }}
    />
  );
}
