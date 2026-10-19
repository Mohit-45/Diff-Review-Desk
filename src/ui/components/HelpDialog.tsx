import type { Command, KeymapRow } from '../../core/types';

export type HelpDialogProps = {
  readonly keymap?: readonly KeymapRow[];
  readonly rows?: readonly KeymapRow[];
  readonly open?: boolean;
  readonly onClose?: () => void;
};

/** The fallback map keeps the help surface useful before App supplies its canonical map. */
export const DEFAULT_KEYMAP: readonly KeymapRow[] = [
  { id: 'next-hunk', keys: ['j'], help: 'Next hunk', buttonLabel: 'Next hunk', contextual: false },
  {
    id: 'previous-hunk',
    keys: ['k'],
    help: 'Previous hunk',
    buttonLabel: 'Previous hunk',
    contextual: false,
  },
  {
    id: 'next-pending',
    keys: ['n'],
    help: 'Next pending hunk',
    buttonLabel: 'Next pending',
    contextual: false,
  },
  {
    id: 'previous-pending',
    keys: ['p'],
    help: 'Previous pending hunk',
    buttonLabel: 'Previous pending',
    contextual: false,
  },
  { id: 'next-file', keys: [']'], help: 'Next file', buttonLabel: 'Next file', contextual: false },
  {
    id: 'previous-file',
    keys: ['['],
    help: 'Previous file',
    buttonLabel: 'Previous file',
    contextual: false,
  },
  {
    id: 'approve',
    keys: ['a'],
    help: 'Approve current hunk',
    buttonLabel: 'Approve',
    contextual: false,
  },
  {
    id: 'reject',
    keys: ['r'],
    help: 'Reject current hunk',
    buttonLabel: 'Reject',
    contextual: false,
  },
  {
    id: 'clear',
    keys: ['u'],
    help: 'Clear current decision',
    buttonLabel: 'Clear decision',
    contextual: false,
  },
  {
    id: 'comment',
    keys: ['c'],
    help: 'Edit current comment',
    buttonLabel: 'Comment',
    contextual: false,
  },
  {
    id: 'collapse-hunk',
    keys: ['o'],
    help: 'Collapse or expand current hunk',
    buttonLabel: 'Collapse hunk',
    contextual: false,
  },
  { id: 'export', keys: ['e'], help: 'Open export', buttonLabel: 'Export', contextual: false },
  {
    id: 'load',
    keys: ['l'],
    help: 'Open load dialog',
    buttonLabel: 'Load diff',
    contextual: false,
  },
  {
    id: 'settings',
    keys: ['s'],
    help: 'Open settings',
    buttonLabel: 'Settings',
    contextual: false,
  },
  {
    id: 'help',
    keys: ['?'],
    help: 'Open this help',
    buttonLabel: 'Shortcuts and help',
    contextual: false,
  },
  {
    id: 'path-filter',
    keys: ['/'],
    help: 'Focus path filter',
    buttonLabel: 'Filter paths',
    contextual: false,
  },
  {
    id: 'undo',
    keys: ['Ctrl+Z', '⌘Z'],
    help: 'Undo the last decision',
    buttonLabel: 'Undo',
    contextual: false,
  },
  {
    id: 'redo',
    keys: ['Ctrl+Shift+Z', '⌘⇧Z'],
    help: 'Redo the last decision',
    buttonLabel: 'Redo',
    contextual: false,
  },
  {
    id: 'close',
    keys: ['Esc'],
    help: 'Close the dialog or editor',
    buttonLabel: null,
    contextual: true,
  },
  {
    id: 'commit-comment',
    keys: ['Ctrl+Enter', '⌘Enter'],
    help: 'Commit comment and advance',
    buttonLabel: null,
    contextual: true,
  },
];

function commandLabel(id: Command): string {
  return id.replaceAll('-', ' ');
}

/** Keyboard help content. App owns the native dialog lifecycle and focus trap. */
export function HelpDialog({ keymap, rows, onClose }: HelpDialogProps) {
  const map = keymap ?? rows ?? DEFAULT_KEYMAP;
  return (
    <section className="dialog-content" aria-labelledby="help-dialog-title">
      <header className="dialog-header">
        <div>
          <h2 id="help-dialog-title">Shortcuts and help</h2>
          <p>Use the buttons in the app when single-key shortcuts are turned off.</p>
        </div>
        {onClose !== undefined ? (
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        ) : null}
      </header>
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
                  <span key={`${row.id}-${index}`}>
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
    </section>
  );
}
