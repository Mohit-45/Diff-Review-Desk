import { useEffect } from 'react';
import type { Announcement } from './announce';
import type { Dialogs } from './useDialogs';
import type { IntakeState } from './reviewTypes';

/** Announce the status line, and open the Load dialog for a load that has a question or an error. */
export function useIntakeEffects(
  status: Announcement,
  intake: IntakeState,
  dialogs: Dialogs,
  announce: (text: string) => void,
): void {
  useEffect(() => {
    announce(status.text);
  }, [status, announce]);

  // A load that finishes after its dialog was closed still has a question or an error to show.
  useEffect(() => {
    if ((intake.pending !== null || intake.error !== null) && dialogs.current === null) {
      dialogs.open('load');
    }
  }, [intake.pending, intake.error, dialogs]);
}
