import { parseDiff } from '../core/parser/parse';
import type { DecoderInput, ParseResult, Result } from '../core/types';
import type { ReviewStorageAdapter } from '../storage/adapter';
import {
  openDiff,
  type DiffParser,
  type OpenDiffError,
  type OpenDiffOptions,
  type OpenDiffValue,
} from './open';

/** Opening a stored review decodes the same text twice; the second parse is a cache hit. */
export function memoizeParser(parser: DiffParser): DiffParser {
  let lastText: string | null = null;
  let lastResult: ParseResult | null = null;
  return (text) => {
    if (lastResult !== null && text === lastText) {
      return lastResult;
    }
    lastResult = parser(text);
    lastText = text;
    return lastResult;
  };
}

export type OpenWithStoredOptions = Omit<OpenDiffOptions, 'parser' | 'stored'> & {
  readonly adapter: ReviewStorageAdapter;
  readonly parser?: DiffParser;
};

/**
 * The fingerprint is only known after parsing, so the stored review is looked up in between:
 * a diff that was reviewed before comes back with its decisions.
 */
export function openWithStored(
  input: DecoderInput | string | Uint8Array,
  options: OpenWithStoredOptions,
): Result<OpenDiffValue, OpenDiffError> {
  const { adapter, parser: given, ...rest } = options;
  const parser = memoizeParser(given ?? parseDiff);
  const first = openDiff(input, { ...rest, parser });
  if (!first.ok || first.value.outcome === 'same-open') {
    return first;
  }
  const stored = adapter.getReview(first.value.parsed.fingerprint);
  if (!stored.ok || stored.value === null) {
    return first;
  }
  return openDiff(input, { ...rest, parser, stored: stored.value });
}
