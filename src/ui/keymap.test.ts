import { describe, expect, it } from 'vitest';
import type { Command } from '../core/types';
import {
  KEYMAP,
  keyHint,
  readKeyInput,
  resolveCommand,
  type KeyContext,
  type KeyInput,
} from './keymap';

const BASE_INPUT: KeyInput = {
  key: '',
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  altGraph: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  editableTarget: false,
  inScope: true,
};

const ACTIVE: KeyContext = { shortcutsEnabled: true, dialogOpen: false, loading: false };

function press(overrides: Partial<KeyInput>, context: Partial<KeyContext> = {}): Command | null {
  return resolveCommand({ ...BASE_INPUT, ...overrides }, { ...ACTIVE, ...context });
}

describe('KEYMAP table', () => {
  it('KEYMAP-SHAPE has one row per command with unique ids and help text', () => {
    const ids = KEYMAP.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(20);
    for (const row of KEYMAP) {
      expect(row.help.length).toBeGreaterThan(0);
      expect(row.keys.length).toBeGreaterThan(0);
      expect(row.contextual).toBe(row.buttonLabel === null);
    }
  });

  const plain: readonly (readonly [Command, string])[] = [
    ['next-hunk', 'j'],
    ['previous-hunk', 'k'],
    ['next-pending', 'n'],
    ['previous-pending', 'p'],
    ['next-file', ']'],
    ['previous-file', '['],
    ['approve', 'a'],
    ['reject', 'r'],
    ['clear', 'u'],
    ['comment', 'c'],
    ['collapse-hunk', 'o'],
    ['export', 'e'],
    ['load', 'l'],
    ['settings', 's'],
    ['help', '?'],
    ['path-filter', '/'],
  ];

  it.each(plain)('KEY-%s resolves %s without modifiers', (command, key) => {
    expect(press({ key })).toBe(command);
    expect(KEYMAP.find((row) => row.id === command)?.keys).toContain(key);
  });

  it.each(plain.filter(([, key]) => /^[a-z]$/u.test(key)))(
    'KEY-%s matches the capital letter when caps lock is on but rejects Shift+%s',
    (command, key) => {
      expect(press({ key: key.toUpperCase() })).toBe(command);
      expect(press({ key: key.toUpperCase(), shiftKey: true })).toBeNull();
    },
  );

  it.each(plain.filter(([, key]) => !/^[a-z]$/u.test(key)))(
    'KEY-%s symbol binding %s ignores shift and rejects other modifiers',
    (command, key) => {
      expect(press({ key, shiftKey: true })).toBe(command);
      expect(press({ key, ctrlKey: true })).toBeNull();
      expect(press({ key, metaKey: true })).toBeNull();
      expect(press({ key, altKey: true })).toBeNull();
    },
  );

  it('KEY-undo resolves Ctrl+Z and Cmd+Z but not with Alt or the wrong modifier', () => {
    expect(press({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(press({ key: 'z', metaKey: true })).toBe('undo');
    expect(press({ key: 'Z', metaKey: true })).toBe('undo');
    expect(press({ key: 'z', ctrlKey: true, altKey: true })).toBeNull();
    expect(press({ key: 'z', ctrlKey: true, metaKey: true })).toBeNull();
    expect(press({ key: 'z' })).toBeNull();
  });

  it('KEY-redo resolves Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y but not Cmd+Y', () => {
    expect(press({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(press({ key: 'z', metaKey: true, shiftKey: true })).toBe('redo');
    expect(press({ key: 'y', ctrlKey: true })).toBe('redo');
    expect(press({ key: 'y', metaKey: true })).toBeNull();
    expect(press({ key: 'y', ctrlKey: true, shiftKey: true })).toBeNull();
  });

  it('KEY-modifiers returns null for any other Ctrl, Meta or Alt combination', () => {
    for (const key of ['a', 'j', 'e', 'Enter', 'Escape']) {
      expect(press({ key, ctrlKey: true })).toBeNull();
      expect(press({ key, metaKey: true })).toBeNull();
      expect(press({ key, altKey: true })).toBeNull();
    }
  });

  it('KEY-altgraph ignores Ctrl and Alt while AltGraph is down but not Meta', () => {
    expect(press({ key: ']', ctrlKey: true, altKey: true, altGraph: true })).toBe('next-file');
    expect(press({ key: 'a', ctrlKey: true, altKey: true, altGraph: true })).toBe('approve');
    expect(press({ key: 'z', ctrlKey: true, altKey: true, altGraph: true })).toBeNull();
    expect(press({ key: 'a', metaKey: true, altGraph: true })).toBeNull();
    expect(press({ key: 'z', metaKey: true, altKey: true, altGraph: true })).toBe('undo');
  });

  it('KEY-contextual never resolves Esc or Ctrl+Enter, the dialog and editor own them', () => {
    expect(press({ key: 'Escape' })).toBeNull();
    expect(press({ key: 'Esc' })).toBeNull();
    expect(press({ key: 'Enter', ctrlKey: true })).toBeNull();
    expect(press({ key: 'Enter', metaKey: true })).toBeNull();
    expect(press({ key: 'x' })).toBeNull();
  });
});

function inputForToken(token: string): Partial<KeyInput> {
  const ctrl = /^Ctrl\+(Shift\+)?(.)$/u.exec(token);
  if (ctrl !== null) return { key: ctrl[2] ?? '', ctrlKey: true, shiftKey: ctrl[1] !== undefined };
  const meta = /^⌘(⇧)?(.)$/u.exec(token);
  if (meta !== null) return { key: meta[2] ?? '', metaKey: true, shiftKey: meta[1] !== undefined };
  return { key: token };
}

describe('KEYMAP advertises only keys the handler resolves', () => {
  const advertised = KEYMAP.filter((row) => !row.contextual).flatMap((row) =>
    row.keys.map((token) => [row.id, token] as const),
  );

  it.each(advertised)('ADVERTISED-%s: %s resolves to the row command', (id, token) => {
    expect(press(inputForToken(token))).toBe(id);
  });

  it('ADVERTISED-CONTEXTUAL never resolves the keys of contextual rows', () => {
    for (const row of KEYMAP.filter((candidate) => candidate.contextual)) {
      expect(row.buttonLabel).toBeNull();
      expect(press({ key: row.keys[0] ?? '' })).toBeNull();
    }
  });
});

describe('resolveCommand guards', () => {
  it('SHORTCUTS-OFF returns null for every binding when shortcuts are disabled', () => {
    expect(press({ key: 'j' }, { shortcutsEnabled: false })).toBeNull();
    expect(press({ key: 'z', ctrlKey: true }, { shortcutsEnabled: false })).toBeNull();
  });

  it('DIALOG-OPEN returns null while a dialog is open', () => {
    expect(press({ key: 'j' }, { dialogOpen: true })).toBeNull();
  });

  it('LOAD-IN-FLIGHT returns null while a load is running', () => {
    expect(press({ key: 'j' }, { loading: true })).toBeNull();
  });

  it('DEFAULT-PREVENTED returns null when another handler consumed the event', () => {
    expect(press({ key: 'j', defaultPrevented: true })).toBeNull();
  });

  it('IME-COMPOSING returns null while composing and for Process and Dead keys', () => {
    expect(press({ key: 'j', isComposing: true })).toBeNull();
    expect(press({ key: 'Process' })).toBeNull();
    expect(press({ key: 'Dead' })).toBeNull();
  });

  it('TEXT-TARGET returns null for editable targets, including undo and redo', () => {
    expect(press({ key: 'j', editableTarget: true })).toBeNull();
    expect(press({ key: 'z', ctrlKey: true, editableTarget: true })).toBeNull();
    expect(press({ key: 'Z', metaKey: true, shiftKey: true, editableTarget: true })).toBeNull();
  });

  it('FOCUS-SCOPE returns null when focus is outside nav and main', () => {
    expect(press({ key: 'j', inScope: false })).toBeNull();
  });

  it('RV-HELD-KEY ignores event.repeat for a r u c but lets navigation repeat', () => {
    for (const key of ['a', 'r', 'u', 'c']) {
      expect(press({ key, repeat: true })).toBeNull();
      expect(press({ key })).not.toBeNull();
    }
    expect(press({ key: 'j', repeat: true })).toBe('next-hunk');
    expect(press({ key: 'k', repeat: true })).toBe('previous-hunk');
    expect(press({ key: 'n', repeat: true })).toBe('next-pending');
  });
});

describe('readKeyInput and keyHint', () => {
  function keyDownOn(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  type Spec = readonly [tag: string, attrs: Readonly<Record<string, string>>, ...children: Spec[]];

  function build([tag, attrs, ...children]: Spec): HTMLElement {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    element.append(...children.map(build));
    return element;
  }

  function mount(...specs: Spec[]): HTMLElement {
    const host = document.createElement('div');
    host.append(...specs.map(build));
    document.body.append(host);
    return host;
  }

  it('READ-INPUT reports modifiers, repeat, composing and AltGraph from the event', () => {
    const host = mount(['main', {}, ['button', { type: 'button' }]]);
    const button = host.querySelector('button');
    if (button === null) throw new Error('button missing');
    const event = keyDownOn(button, {
      key: 'j',
      shiftKey: true,
      ctrlKey: true,
      metaKey: true,
      altKey: true,
      repeat: true,
      isComposing: true,
      modifierAltGraph: true,
    });
    expect(readKeyInput(event)).toEqual({
      key: 'j',
      shiftKey: true,
      ctrlKey: true,
      metaKey: true,
      altKey: true,
      altGraph: true,
      repeat: true,
      isComposing: true,
      defaultPrevented: false,
      editableTarget: false,
      inScope: true,
    });
    host.remove();
  });

  it('READ-INPUT detects text fields, contenteditable, nav and main scope', () => {
    const host = mount(
      ['nav', {}, ['input', { id: 'i' }], ['select', { id: 's' }]],
      [
        'main',
        {},
        ['textarea', { id: 't' }],
        ['div', { id: 'e', contenteditable: 'true' }, ['b', { id: 'eb' }]],
        ['div', { id: 'plain', contenteditable: 'false' }],
      ],
      ['footer', {}, ['button', { id: 'f' }]],
    );
    const pick = (id: string): HTMLElement => {
      const element = host.querySelector<HTMLElement>(`#${id}`);
      if (element === null) throw new Error(`${id} missing`);
      return element;
    };
    for (const id of ['i', 's', 't', 'e', 'eb']) {
      const input = readKeyInput(keyDownOn(pick(id), { key: 'j' }));
      expect(input.editableTarget).toBe(true);
      expect(input.inScope).toBe(true);
    }
    const plain = readKeyInput(keyDownOn(pick('plain'), { key: 'j' }));
    expect(plain.editableTarget).toBe(false);
    expect(plain.inScope).toBe(true);
    const outside = readKeyInput(keyDownOn(pick('f'), { key: 'j' }));
    expect(outside.inScope).toBe(false);
    host.remove();
  });

  it('READ-INPUT treats a non-element target as outside every scope and records defaultPrevented', () => {
    const event = new KeyboardEvent('keydown', { key: 'j', cancelable: true });
    document.addEventListener(
      'keydown',
      (captured) => {
        captured.preventDefault();
      },
      { once: true },
    );
    document.dispatchEvent(event);
    const input = readKeyInput(event);
    expect(input.inScope).toBe(false);
    expect(input.editableTarget).toBe(false);
    expect(input.defaultPrevented).toBe(true);
  });

  it('KEY-HINT returns the first key of a row and null for an unknown command', () => {
    expect(keyHint('approve')).toBe('a');
    expect(keyHint('undo')).toBe('Ctrl+Z');
    expect(keyHint('close')).toBe('Esc');
    expect(keyHint('nope' as Command)).toBeNull();
  });
});
