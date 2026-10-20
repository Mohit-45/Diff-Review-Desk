import type { Command, KeymapRow } from '../core/types';

/**
 * The one keyboard table. The handler, the Help dialog and the key hints all read
 * these rows, so a binding cannot be advertised without being matched.
 *
 * Keys are both display text and binding: a single character is a plain key,
 * "Ctrl+Z" and "⌘Z" are chords. Rows marked contextual (Esc, Ctrl+Enter) are
 * handled by the dialog wrapper and the comment editor, never by resolveCommand.
 */
export const KEYMAP: readonly KeymapRow[] = [
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
    help: 'Approve the current hunk and advance',
    buttonLabel: 'Approve',
    contextual: false,
  },
  {
    id: 'reject',
    keys: ['r'],
    help: 'Reject the current hunk and open its comment',
    buttonLabel: 'Reject',
    contextual: false,
  },
  {
    id: 'clear',
    keys: ['u'],
    help: 'Clear the current decision',
    buttonLabel: 'Clear decision',
    contextual: false,
  },
  {
    id: 'comment',
    keys: ['c'],
    help: 'Edit the current comment',
    buttonLabel: 'Comment',
    contextual: false,
  },
  {
    id: 'collapse-hunk',
    keys: ['o'],
    help: 'Collapse or expand the current hunk',
    buttonLabel: 'Collapse hunk',
    contextual: false,
  },
  { id: 'export', keys: ['e'], help: 'Open export', buttonLabel: 'Export', contextual: false },
  {
    id: 'load',
    keys: ['l'],
    help: 'Load another diff',
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
    help: 'Open shortcuts and help',
    buttonLabel: 'Shortcuts and help',
    contextual: false,
  },
  {
    id: 'path-filter',
    keys: ['/'],
    help: 'Focus the path filter (Esc clears, a second Esc leaves)',
    buttonLabel: 'Path',
    contextual: false,
  },
  {
    id: 'undo',
    keys: ['Ctrl+Z', '⌘Z'],
    help: 'Undo the last change',
    buttonLabel: 'Undo',
    contextual: false,
  },
  {
    id: 'redo',
    keys: ['Ctrl+Shift+Z', '⌘⇧Z', 'Ctrl+Y'],
    help: 'Redo the last undone change',
    buttonLabel: 'Redo',
    contextual: false,
  },
  {
    id: 'close',
    keys: ['Esc'],
    help: 'Close the dialog or comment editor (nothing is discarded)',
    buttonLabel: null,
    contextual: true,
  },
  {
    id: 'commit-comment',
    keys: ['Ctrl+Enter', '⌘Enter'],
    help: 'Save the comment and advance to the next pending hunk',
    buttonLabel: null,
    contextual: true,
  },
];

/** Commands where a held key would repeat a decision, so event.repeat is ignored. */
const NO_REPEAT: ReadonlySet<Command> = new Set<Command>(['approve', 'reject', 'clear', 'comment']);

type Binding = {
  readonly command: Command;
  readonly key: string;
  /** Letters and chords compare case-insensitively; symbols compare exactly. */
  readonly exact: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  /** null means Shift is ignored, as for symbols like ? that need it to be typed. */
  readonly shift: boolean | null;
};

const CHORD = /^(Ctrl\+Shift\+|Ctrl\+|⌘⇧|⌘)([A-Za-z])$/u;

function parseBinding(command: Command, token: string): Binding {
  const chord = CHORD.exec(token);
  if (chord !== null) {
    const [, prefix = '', letter = ''] = chord;
    return {
      command,
      key: letter.toLowerCase(),
      exact: false,
      ctrl: prefix.startsWith('Ctrl'),
      meta: !prefix.startsWith('Ctrl'),
      shift: prefix.includes('Shift') || prefix.includes('⇧'),
    };
  }
  const letter = /^[a-z]$/u.test(token);
  return {
    command,
    key: token,
    exact: !letter,
    ctrl: false,
    meta: false,
    shift: letter ? false : null,
  };
}

const BINDINGS: readonly Binding[] = KEYMAP.flatMap((row) =>
  row.contextual ? [] : row.keys.map((token) => parseBinding(row.id, token)),
);

/** What resolveCommand needs to know about one keydown, as plain data. */
export type KeyInput = {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly altGraph: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly defaultPrevented: boolean;
  readonly editableTarget: boolean;
  readonly inScope: boolean;
};

export type KeyContext = {
  readonly shortcutsEnabled: boolean;
  readonly dialogOpen: boolean;
  readonly loading: boolean;
};

const EDITABLE =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

function isWithin(target: Element | null, selector: string): boolean {
  return target !== null && target.closest(selector) !== null;
}

/** Reads the facts resolveCommand needs from a DOM event; never uses event.code. */
export function readKeyInput(event: KeyboardEvent): KeyInput {
  const target = event.target instanceof Element ? event.target : null;
  return {
    key: event.key,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    altGraph: event.getModifierState('AltGraph'),
    repeat: event.repeat,
    isComposing: event.isComposing,
    defaultPrevented: event.defaultPrevented,
    editableTarget: isWithin(target, EDITABLE),
    inScope: isWithin(target, 'nav, main'),
  };
}

function isBlocked(input: KeyInput, context: KeyContext): boolean {
  return (
    !context.shortcutsEnabled ||
    context.dialogOpen ||
    context.loading ||
    input.defaultPrevented ||
    input.isComposing ||
    input.key === 'Process' ||
    input.key === 'Dead' ||
    input.editableTarget ||
    !input.inScope
  );
}

type Held = { readonly ctrl: boolean; readonly alt: boolean };

function keyMatches(binding: Binding, key: string): boolean {
  return binding.exact ? key === binding.key : key.toLowerCase() === binding.key;
}

function matches(binding: Binding, input: KeyInput, held: Held): boolean {
  if (held.alt || held.ctrl !== binding.ctrl || input.metaKey !== binding.meta) {
    return false;
  }
  return (
    (binding.shift === null || input.shiftKey === binding.shift) && keyMatches(binding, input.key)
  );
}

/**
 * Maps one keydown to a command, or null when the key must be left alone.
 * AltGraph reports Ctrl and Alt on Windows layouts, so both are ignored then.
 */
export function resolveCommand(input: KeyInput, context: KeyContext): Command | null {
  if (isBlocked(input, context)) {
    return null;
  }
  const held = { ctrl: input.ctrlKey && !input.altGraph, alt: input.altKey && !input.altGraph };
  const binding = BINDINGS.find((candidate) => matches(candidate, input, held));
  if (binding === undefined) {
    return null;
  }
  return input.repeat && NO_REPEAT.has(binding.command) ? null : binding.command;
}

/** The first plain-key binding of a command, for the visible key hint. */
export function keyHint(command: Command): string | null {
  const row = KEYMAP.find((candidate) => candidate.id === command);
  return row?.keys[0] ?? null;
}
