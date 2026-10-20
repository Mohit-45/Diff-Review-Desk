import type { Command, KeymapRow } from '../../core/types';
import { DIALOG_TITLE_IDS } from '../dialogIds';
import { KEYMAP } from '../keymap';

export type HelpDialogProps = {
  readonly keymap?: readonly KeymapRow[];
  readonly rows?: readonly KeymapRow[];
  readonly open?: boolean;
  /** When false the intro says the keys are off, since every row then needs its button. */
  readonly shortcutsEnabled?: boolean;
  readonly onClose?: () => void;
};

function commandLabel(id: Command): string {
  return id.replaceAll('-', ' ');
}

/** Keyboard help content. App owns the native dialog lifecycle and focus trap. */
export function HelpDialog({ keymap, rows, shortcutsEnabled = true, onClose }: HelpDialogProps) {
  const map = keymap ?? rows ?? KEYMAP;
  return (
    <div className="dialog-content">
      <div className="dialog-header">
        <div>
          <h2 id={DIALOG_TITLE_IDS.help}>Shortcuts and help</h2>
          <p>
            {shortcutsEnabled
              ? 'Single-key shortcuts work while focus is in the file rail or the diff, not in text fields. Every action also has a button.'
              : 'Single-key shortcuts are turned off in Settings. Every action is still available as a button.'}
          </p>
        </div>
        {onClose !== undefined ? (
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <table>
        <caption>Keyboard shortcuts</caption>
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Shortcut</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {map.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.help || commandLabel(row.id)}</th>
              <td>
                {row.keys.map((key, index) => (
                  <span key={`${row.id}-${String(index)}`}>
                    {index > 0 ? ' or ' : null}
                    <kbd>{key}</kbd>
                  </span>
                ))}
              </td>
              <td>{row.contextual ? 'Contextual' : 'Available in the review'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
