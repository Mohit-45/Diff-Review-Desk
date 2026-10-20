import { useRef, useState } from 'react';
import type { DialogName } from './reviewCommands';

export type Dialogs = {
  readonly current: DialogName | null;
  readonly open: (name: DialogName) => void;
  readonly close: (name: DialogName) => void;
};

/**
 * Dialog state plus the element to return focus to. close() is safe to call twice,
 * which happens when native Esc and our own close both report the same dialog.
 */
export function useDialogs(onClosed: (invoker: HTMLElement | null) => void): Dialogs {
  const [current, setCurrent] = useState<DialogName | null>(null);
  const invoker = useRef<HTMLElement | null>(null);

  const open = (name: DialogName) => {
    const active = document.activeElement;
    invoker.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setCurrent(name);
  };

  const close = (name: DialogName) => {
    if (current !== name) {
      return;
    }
    setCurrent(null);
    onClosed(invoker.current);
  };

  return { current, open, close };
}
