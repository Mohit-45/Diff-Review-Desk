import { useEffect } from 'react';
import { strayMessages } from './messages/intake';

/**
 * What the screen can take right now. `load-dialog` is the one dialog that takes input itself, so
 * a stray event there is its own business; any other dialog gets the "close it first" line.
 */
export type StrayMode = 'ready' | 'busy' | 'load-dialog' | 'dialog';

type StrayIntake = {
  readonly mode: StrayMode;
  readonly onPaste: (text: string) => void;
  readonly onFile: (file: File) => void;
  /** Says why nothing was opened: an empty clipboard, or a dialog that is in the way. */
  readonly say: (text: string) => void;
};

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('textarea, input, select, [contenteditable="true"]') !== null
  );
}

/** Only a diff that is not blank may open anything; the rest are refused out loud. */
function refusal(mode: StrayMode, blank: boolean): string | null {
  if (mode === 'dialog') {
    return strayMessages.closeDialog;
  }
  return blank ? strayMessages.noText : null;
}

/**
 * A paste or a dropped file that lands outside any field. It never loads on its own: the caller
 * opens the Load dialog with it, so a stray Ctrl+V cannot replace the review. Drag events are
 * always cancelled, or a file dropped beside the target would navigate the tab away.
 */
export function useStrayIntake({ mode, onPaste, onFile, say }: StrayIntake): void {
  useEffect(() => {
    const listensHere = mode === 'ready' || mode === 'dialog';
    const paste = (event: ClipboardEvent) => {
      if (!listensHere || isTextField(event.target)) {
        return;
      }
      const text = event.clipboardData?.getData('text/plain') ?? '';
      event.preventDefault();
      const refused = refusal(mode, /^\s*$/u.test(text));
      if (refused === null) {
        onPaste(text);
      } else {
        say(refused);
      }
    };
    const keepOnPage = (event: DragEvent) => {
      event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      if (!listensHere) {
        return;
      }
      const file = event.dataTransfer?.files[0];
      const refused = refusal(mode, file === undefined);
      if (refused !== null) {
        say(refused);
      } else if (file !== undefined) {
        onFile(file);
      }
    };
    document.addEventListener('paste', paste);
    window.addEventListener('dragover', keepOnPage);
    window.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('paste', paste);
      window.removeEventListener('dragover', keepOnPage);
      window.removeEventListener('drop', drop);
    };
  }, [mode, onPaste, onFile, say]);
}
