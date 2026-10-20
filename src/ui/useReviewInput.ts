import type { Command, Prefs } from '../core/types';
import { readKeyInput, resolveCommand } from './keymap';
import type { IntakeState } from './reviewTypes';
import type { Dialogs } from './useDialogs';
import { useDocumentKeydown } from './useDocumentKeydown';

type Input = {
  readonly prefs: Prefs;
  readonly dialogs: Dialogs;
  readonly intake: IntakeState;
  readonly command: (command: Command) => void;
};

/** Single-key shortcuts: resolved by the one pure keymap, and off while a dialog or a load is up. */
export function useReviewInput({ prefs, dialogs, intake, command }: Input): void {
  useDocumentKeydown((event) => {
    const resolved = resolveCommand(readKeyInput(event), {
      shortcutsEnabled: prefs.shortcutsEnabled,
      dialogOpen: dialogs.current !== null,
      loading: intake.loading,
    });
    if (resolved === null) {
      return;
    }
    event.preventDefault();
    command(resolved);
  });
}
