import { useEffect, useState } from 'react';
import { fileError } from './components/intakeValidation';
import type { Announcement } from './announce';
import type { IntakeState } from './reviewTypes';
import type { Dialogs } from './useDialogs';
import { useStrayIntake, type StrayMode } from './useStrayIntake';

export type StrayReview = {
  /** A diff pasted outside any field, waiting in the Load dialog's text box. */
  readonly pastedText: string;
  /** A line for the open dialog, such as "Close the dialog to load a diff."; null when none. */
  readonly notice: Announcement | null;
};

function modeOf(dialogs: Dialogs, loading: boolean): StrayMode {
  if (dialogs.current === 'load') {
    return 'load-dialog';
  }
  if (dialogs.current !== null) {
    return 'dialog';
  }
  return loading ? 'busy' : 'ready';
}

/**
 * A paste or file that lands beside the fields. It only opens the Load dialog; it never replaces
 * the review. When it cannot, the reason is said on the screen, or inside the dialog in the way,
 * because a modal dialog leaves the page behind it unread.
 */
export function useStrayReview(
  dialogs: Dialogs,
  intake: IntakeState,
  announce: (text: string) => void,
): StrayReview {
  const [pastedText, setPastedText] = useState('');
  const [notice, setNotice] = useState<Announcement | null>(null);
  const mode = modeOf(dialogs, intake.loading);
  const openDialog = dialogs.current;

  // A line said inside one dialog does not follow the user into the next.
  useEffect(() => {
    setNotice(null);
  }, [openDialog]);

  useStrayIntake({
    mode,
    onPaste: (text) => {
      setPastedText(text);
      dialogs.open('load');
    },
    onFile: (file) => {
      dialogs.open('load');
      const invalid = fileError(file);
      if (invalid === null) {
        intake.onLoadFile(file);
      } else {
        intake.onError(invalid);
      }
    },
    say:
      mode === 'dialog'
        ? (text) => {
            setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
          }
        : announce,
  });

  return { pastedText, notice };
}
