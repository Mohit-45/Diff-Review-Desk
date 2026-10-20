import type { ParseWarning, Prefs } from '../core/types';
import { ExportDialog, type ExportWarningTarget } from './components/ExportDialog';
import { HelpDialog } from './components/HelpDialog';
import { LoadDialog } from './components/LoadDialog';
import { SettingsDialog } from './components/SettingsDialog';
import type { Announcement } from './announce';
import { DialogShell } from './DialogShell';
import { DIALOG_TITLE_IDS } from './dialogIds';
import type { DialogName } from './reviewCommands';
import type { IntakeState, ReviewData } from './reviewTypes';

type ReviewDialogsProps = {
  readonly current: DialogName | null;
  readonly onClose: (name: DialogName) => void;
  readonly review: ReviewData;
  readonly intake: IntakeState;
  /** What was said since the Load dialog opened; undefined when nothing was. */
  readonly status?: string;
  readonly prefs: Prefs;
  readonly onPrefsChange: (prefs: Prefs) => void;
  readonly onClearData: () => void;
  readonly onGoToFirst: (target: ExportWarningTarget) => void;
  /** What an export says and when: the parse warnings, the moment the dialog opened, the note. */
  readonly exporting: {
    readonly warnings: readonly ParseWarning[];
    readonly generatedAt: string;
    readonly onOverallNoteCommit: (note: string) => void;
  };
  /** A diff pasted outside any field, waiting in the Load dialog's text box. */
  readonly pastedText?: string;
  /** Why a stray paste or drop opened nothing, said inside the dialog that is open. */
  readonly notice?: Announcement | null;
};

/** The four native dialogs. Only the open one has content, and Esc and Close both report back. */
export function ReviewDialogs({
  current,
  onClose,
  review,
  intake,
  status,
  prefs,
  onPrefsChange,
  onClearData,
  onGoToFirst,
  exporting,
  pastedText = '',
  notice = null,
}: ReviewDialogsProps) {
  const close = (name: DialogName) => () => {
    onClose(name);
  };
  // Leaving the dialog drops a question it was asking and an error it was showing.
  const closeLoad = () => {
    intake.onCancelPending();
    intake.onError(null);
    onClose('load');
  };
  return (
    <>
      <DialogShell
        open={current === 'load'}
        onClose={closeLoad}
        labelledBy={DIALOG_TITLE_IDS.load}
        notice={notice}
      >
        <LoadDialog
          open
          embedded
          initialText={pastedText}
          onClose={closeLoad}
          onLoadText={intake.onLoadText}
          onLoadFile={intake.onLoadFile}
          onLoadSample={intake.onLoadSample}
          onRetry={intake.onRetry}
          status={status}
          error={intake.error}
          loading={intake.loading}
          pending={intake.pending}
          onResolvePending={intake.onResolvePending}
          onCancelPending={intake.onCancelPending}
        />
      </DialogShell>
      <DialogShell
        open={current === 'export'}
        onClose={close('export')}
        labelledBy={DIALOG_TITLE_IDS.export}
        notice={notice}
        keepMounted
      >
        <ExportDialog
          state={review.state}
          files={review.files}
          flags={review.flags}
          warnings={exporting.warnings}
          generatedAt={exporting.generatedAt}
          onOverallNoteCommit={exporting.onOverallNoteCommit}
          onClose={close('export')}
          onGoToFirst={onGoToFirst}
        />
      </DialogShell>
      <DialogShell
        open={current === 'help'}
        onClose={close('help')}
        labelledBy={DIALOG_TITLE_IDS.help}
        notice={notice}
      >
        <HelpDialog onClose={close('help')} shortcutsEnabled={prefs.shortcutsEnabled} />
      </DialogShell>
      <DialogShell
        open={current === 'settings'}
        onClose={close('settings')}
        labelledBy={DIALOG_TITLE_IDS.settings}
        notice={notice}
      >
        <SettingsDialog
          prefs={prefs}
          onPrefsChange={onPrefsChange}
          onClearData={onClearData}
          onClose={close('settings')}
        />
      </DialogShell>
    </>
  );
}
