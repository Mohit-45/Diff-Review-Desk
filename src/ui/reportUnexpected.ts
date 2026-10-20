import { version } from '../../package.json';
import type { StorageMode } from '../storage/state';

export type UnexpectedCode =
  'render-crash' | 'window-error' | 'unhandled-rejection' | 'clear-failed';

/** What the app knows about itself when something breaks: numbers and a mode, never content. */
export type Diagnostics = {
  readonly storageMode: StorageMode;
  readonly files: number;
  readonly hunks: number;
};

export type UnexpectedContext = {
  /** React component names from the component stack. */
  readonly components?: readonly string[];
  /** `script:line:col` when the failing script is known. */
  readonly location?: string | null;
};

/** The one thing that reaches the console. Every field is a number, a name or a fixed code. */
export type UnexpectedPayload = {
  readonly app: string;
  readonly code: UnexpectedCode;
  readonly error: string;
  readonly components: readonly string[];
  readonly location: string | null;
  readonly storage: StorageMode | 'unknown';
  readonly files: number | null;
  readonly hunks: number | null;
};

const MAX_COMPONENTS = 12;
const IDENTIFIER = /^[A-Za-z_$][\w$]{0,59}$/u;
const FRAME = /([\w.-]+\.(?:m?[jt]sx?)):(\d{1,7}):(\d{1,7})/u;

let diagnosticsSource: (() => Diagnostics) | null = null;

/** The running app says where to read its counts and storage mode from; null when it goes away. */
export function setDiagnostics(source: (() => Diagnostics) | null): void {
  diagnosticsSource = source;
}

/** An error's name is code, but a thrown value can be anything, so only a plain name passes. */
function nameOf(error: unknown): string {
  if (error instanceof Error && IDENTIFIER.test(error.name)) {
    return error.name;
  }
  return error instanceof Error ? 'Error' : 'NonError';
}

/** Component names are identifiers in our own code; anything else in the stack is dropped. */
export function componentNames(componentStack: string | null | undefined): readonly string[] {
  const names: string[] = [];
  for (const match of (componentStack ?? '').matchAll(/^\s*at\s+([^\s(]+)/gmu)) {
    const name = match[1];
    if (name !== undefined && IDENTIFIER.test(name) && names.length < MAX_COMPONENTS) {
      names.push(name);
    }
  }
  return names;
}

/** `script:line:col` from a file name and position, with the path and any query dropped. */
export function scriptLocation(file: string, line: number, column: number): string | null {
  const match = FRAME.exec(`${file}:${String(line)}:${String(column)}`);
  return match === null ? null : `${match[1] ?? ''}:${match[2] ?? ''}:${match[3] ?? ''}`;
}

/** The first frame after the message: the message itself may quote anything, so it is skipped. */
function locationOf(error: unknown): string | null {
  if (!(error instanceof Error) || typeof error.stack !== 'string') {
    return null;
  }
  const messageEnd = error.message === '' ? -1 : error.stack.lastIndexOf(error.message);
  const frames =
    messageEnd < 0 ? error.stack : error.stack.slice(messageEnd + error.message.length);
  const match = FRAME.exec(frames);
  return match === null ? null : `${match[1] ?? ''}:${match[2] ?? ''}:${match[3] ?? ''}`;
}

export function buildPayload(
  code: UnexpectedCode,
  error: unknown,
  context: UnexpectedContext = {},
): UnexpectedPayload {
  const diagnostics = diagnosticsSource?.() ?? null;
  return {
    app: version,
    code,
    error: nameOf(error),
    components: context.components ?? [],
    location: context.location ?? locationOf(error),
    storage: diagnostics?.storageMode ?? 'unknown',
    files: diagnostics?.files ?? null,
    hunks: diagnostics?.hunks ?? null,
  };
}

/**
 * The only console.error in the app. The payload never holds the message or the stack of the
 * error, and nothing from the diff, a comment, a path or a label: those can carry the user's code.
 */
export function reportUnexpected(
  code: UnexpectedCode,
  error: unknown,
  context: UnexpectedContext = {},
): void {
  console.error('Diff Review Desk hit an unexpected error.', buildPayload(code, error, context));
}
