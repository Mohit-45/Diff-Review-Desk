import { useEffect, useRef, type ReactNode } from 'react';
import type { Announcement } from './announce';

type DialogShellProps = {
  readonly open: boolean;
  /** Called when the browser closes the dialog itself (Esc), so React state can follow. */
  readonly onClose: () => void;
  /** Keep content mounted while closed, for dialogs whose typed text should survive a close. */
  readonly keepMounted?: boolean;
  /** The id of the h2 that names this dialog. */
  readonly labelledBy: string;
  /** A line for whoever is inside the dialog, such as why a paste was ignored. */
  readonly notice?: Announcement | null;
  readonly children: ReactNode;
};

function focusTitle(dialog: HTMLDialogElement): void {
  const title = dialog.querySelector('h2');
  if (title instanceof HTMLElement) {
    title.tabIndex = -1;
    title.focus();
  }
}

/**
 * The one native <dialog> wrapper. Content mounts only while open (unless keepMounted),
 * so closed dialogs stay out of the accessibility tree and reset their local state.
 */
export function DialogShell({
  open,
  onClose,
  keepMounted = false,
  labelledBy,
  notice = null,
  children,
}: DialogShellProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      focusTitle(dialog);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby={labelledBy}>
      {open || keepMounted ? children : null}
      {open ? (
        <p className="dialog-notice" role="status" aria-atomic="true">
          <span key={notice?.id ?? 0}>{notice?.text ?? ''}</span>
        </p>
      ) : null}
    </dialog>
  );
}
