import { createContext, useContext } from 'react';
import type { Command } from '../core/types';
import { keyHint } from './keymap';

/** True only while single-key shortcuts are on; hints for dead keys would mislead. */
export const ShortcutHintsContext = createContext(false);

/** A decorative key hint beside a button. Hidden from the accessibility tree so names stay plain. */
export function KeyHint({ command }: { readonly command: Command }) {
  const visible = useContext(ShortcutHintsContext);
  const label = keyHint(command);
  if (!visible || label === null) {
    return null;
  }
  return (
    <>
      {' '}
      <kbd className="key-hint" aria-hidden="true">
        {label}
      </kbd>
    </>
  );
}
