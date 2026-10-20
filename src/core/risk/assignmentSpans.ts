import { countWork } from './scanWork';
import {
  isPlaceholderRange,
  lowerKeepingOffsets,
  makeFinder,
  skipBlanks,
  type SecretSpan,
} from './secretSpan';

const ASSIGNMENT_NAMES = [
  'api_key',
  'apikey',
  'secret',
  'token',
  'password',
  'passwd',
  'private_key',
  'privatekey',
] as const;

const SAFE_ASSIGNMENT_SUFFIXES = ['_type', '_url', '_name', '_id'] as const;

/** True when `character` ends an identifier, so the name is not part of a longer word. */
function isIdentifierBoundary(character: string | undefined): boolean {
  if (character === undefined || character === '_' || character === '-' || character === '.') {
    return true;
  }
  const code = character.charCodeAt(0);
  return !(
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function hasSafeSuffix(text: string, end: number): boolean {
  return SAFE_ASSIGNMENT_SUFFIXES.some((suffix) => text.startsWith(suffix, end));
}

const MIN_VALUE_CHARS = 8;
const MAX_VALUE_CHARS = 120;

/** Index of the closing quote when the literal is at most MAX_VALUE_CHARS long, else -1. */
function closingQuote(text: string, valueStart: number, quote: string): number {
  const limit = Math.min(text.length, valueStart + MAX_VALUE_CHARS + 1);
  let cursor = valueStart;
  while (cursor < limit && text[cursor] !== quote) {
    cursor += 1;
  }
  countWork(cursor - valueStart + 1);
  return cursor < limit ? cursor : -1;
}

/** The quoted literal after `name = ` or `name: `, when it is long enough to be a real secret. */
function quotedValueSpan(text: string, nameEnd: number): SecretSpan | null {
  let cursor = skipBlanks(text, nameEnd);
  if (text[cursor] !== '=' && text[cursor] !== ':') {
    return null;
  }
  cursor = skipBlanks(text, cursor + 1);
  const quote = text[cursor];
  if (quote !== '"' && quote !== "'") {
    return null;
  }
  const valueStart = cursor + 1;
  const valueEnd = closingQuote(text, valueStart, quote);
  if (
    valueEnd < 0 ||
    valueEnd - valueStart < MIN_VALUE_CHARS ||
    isPlaceholderRange(text, valueStart, valueEnd)
  ) {
    return null;
  }
  return {
    start: valueStart,
    end: valueEnd,
    kind: 'assignment',
    ruleId: 'secret-assignment',
    publicPrefix: null,
  };
}

export function addAssignmentSpans(text: string, spans: SecretSpan[]): void {
  const lower = lowerKeepingOffsets(text);
  for (const name of ASSIGNMENT_NAMES) {
    const find = makeFinder(lower, name);
    let index = find(0);
    while (index >= 0) {
      const nameEnd = index + name.length;
      if (
        isIdentifierBoundary(text[index - 1]) &&
        isIdentifierBoundary(text[nameEnd]) &&
        !hasSafeSuffix(lower, nameEnd)
      ) {
        const span = quotedValueSpan(text, nameEnd);
        if (span !== null) {
          spans.push(span);
        }
      }
      index = find(index + 1);
    }
  }
}
