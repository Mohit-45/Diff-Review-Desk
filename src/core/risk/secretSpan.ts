import { countWork } from './scanWork';

export type SecretKind =
  'known-token' | 'url-credentials' | 'bearer-token' | 'webhook' | 'pem' | 'assignment';

export type SecretSpan = {
  readonly start: number;
  readonly end: number;
  readonly kind: SecretKind;
  readonly ruleId: 'secret-known-token' | 'secret-assignment';
  readonly publicPrefix: string | null;
};

export function isTokenCharacter(character: string | undefined): boolean {
  if (character === undefined) {
    return false;
  }
  const code = character.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    character === '_' ||
    character === '-'
  );
}

export function isBoundary(character: string | undefined): boolean {
  return !isTokenCharacter(character);
}

export function tokenEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && isTokenCharacter(text[end])) {
    end += 1;
  }
  countWork(end - start + 1);
  return end;
}

export function opaqueTokenEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length) {
    const character = text[end];
    if (
      !isTokenCharacter(character) &&
      character !== '.' &&
      character !== '~' &&
      character !== '+' &&
      character !== '/' &&
      character !== '='
    ) {
      break;
    }
    end += 1;
  }
  countWork(end - start + 1);
  return end;
}

/**
 * Lowercase view whose offsets line up with `text`. `toLowerCase` can change the
 * length (U+0130 becomes two code units), which would shift every later span, so
 * only ASCII letters are folded in that case.
 */
export function lowerKeepingOffsets(text: string): string {
  const lower = text.toLowerCase();
  countWork(text.length);
  if (lower.length === text.length) {
    return lower;
  }
  const folded: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    folded.push(
      code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : (text[index] ?? ''),
    );
  }
  return folded.join('');
}

export type RunEnd = (position: number) => number;

/**
 * End of the run of `scan`-matching characters at a position. The last run is
 * remembered, so a sequence of non-decreasing positions costs one pass in total
 * instead of one pass per position.
 */
export function makeRunEnd(text: string, scan: (text: string, start: number) => number): RunEnd {
  let runStart = 0;
  let runEnd = -1;
  return (position) => {
    if (position >= runStart && position <= runEnd) {
      return runEnd;
    }
    runStart = position;
    runEnd = scan(text, position);
    return runEnd;
  };
}

export type Finder = (from: number) => number;

/**
 * `text.indexOf(needle, from)` that remembers its last answer, so repeated or
 * non-decreasing queries (including "nothing further") never rescan the same stretch.
 */
export function makeFinder(text: string, needle: string): Finder {
  let queried = 0;
  let found = -1;
  let primed = false;
  return (from) => {
    if (primed && from >= queried && (found < 0 || found >= from)) {
      return found;
    }
    found = text.indexOf(needle, from);
    queried = from;
    primed = true;
    countWork(Math.max(1, (found < 0 ? text.length : found + needle.length) - from));
    return found;
  };
}

const PLACEHOLDER_HEAD_CHARS = 8;

/** True when `text[start, end)` is a placeholder such as `${…}`, `<…>`, `changeme` or `your-…`. */
export function isPlaceholderRange(text: string, start: number, end: number): boolean {
  const head = text.slice(start, Math.min(end, start + PLACEHOLDER_HEAD_CHARS)).toLowerCase();
  return (
    head.startsWith('${') ||
    head.startsWith('<') ||
    head.startsWith('your-') ||
    head.startsWith('your_') ||
    (end - start === PLACEHOLDER_HEAD_CHARS && head === 'changeme')
  );
}

/** True when `text[start, end)` is one character repeated at least four times. */
export function isRepeatedRange(text: string, start: number, end: number): boolean {
  if (end - start < 4) {
    return false;
  }
  const first = text[start];
  let index = start + 1;
  while (index < end && text[index] === first) {
    index += 1;
  }
  countWork(index - start);
  return index === end;
}

/** Index of the first character at or after `cursor` that is not a space or tab. */
export function skipBlanks(text: string, cursor: number): number {
  let index = cursor;
  while (text[index] === ' ' || text[index] === '\t') {
    index += 1;
  }
  countWork(index - cursor + 1);
  return index;
}
