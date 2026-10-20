import { fail, ok } from '../core/result';
import type {
  DecoderInput,
  DiffFile,
  ParseError,
  ParseResult,
  ParseWarning,
  ReviewState,
  Result,
  StoredReview,
} from '../core/types';
import { carryOverSummary, type CarryOverSummary } from '../core/review/carryover';
import { createReviewState } from '../core/review/reducer';
import type { ReviewStorageAdapter } from '../storage/adapter';
import { decode, type DecodedDiff } from './decode';

export type DiffParser = (text: string) => ParseResult;

type ParsedOk = Extract<ParseResult, { readonly ok: true }>;

export type OpenChoice = 'carry-over' | 'new';

export type OpenDiffOptions = {
  readonly parser: DiffParser;
  readonly current?: ReviewState | null;
  readonly stored?: StoredReview | null;
  readonly choice?: OpenChoice;
  readonly label?: string;
  readonly sampleTitle?: string;
};

export type OpenDiffValue = {
  readonly decoded: DecodedDiff;
  readonly parsed: ParsedOk;
  readonly state: ReviewState;
  readonly outcome: 'new' | 'same-open' | 'restored' | 'carry-over';
  readonly carryOver: CarryOverSummary | null;
};

export type OpenDiffError =
  ParseError | { readonly code: 'parser-failed'; readonly message: string };

export type RestoreValue = {
  readonly state: ReviewState;
  readonly record: StoredReview;
  readonly diffText: string | null;
  readonly restoredDiff: boolean;
  /** The parsed files of the restored diff, so the caller need not parse the text again. */
  readonly files: readonly DiffFile[] | null;
  /** What parsing the restored text reported again; empty when there is no text. */
  readonly warnings: readonly ParseWarning[];
  readonly notice: string | null;
};

export type RestoreError = OpenDiffError | { readonly code: 'not-found'; readonly message: string };

function hunkIds(files: readonly DiffFile[]): readonly string[] {
  const ids: string[] = [];
  for (const file of files) {
    for (const hunk of file.hunks) {
      ids.push(hunk.id);
    }
  }
  return ids;
}

function defaultLabel(files: readonly DiffFile[], sampleTitle?: string): string {
  if (files.length === 0) {
    return sampleTitle ?? 'Pasted diff';
  }
  const first = files[0];
  if (first === undefined) {
    return sampleTitle ?? 'Pasted diff';
  }
  if (files.length === 1) {
    return first.displayPath;
  }
  return `${first.displayPath} and ${String(files.length - 1)} more`;
}

/** A stored record as a review state over the given hunk ids; ids the diff lacks are dropped. */
export function stateFromStored(stored: StoredReview, currentIds: readonly string[]): ReviewState {
  const hunks = Object.create(null) as Record<
    string,
    { readonly decision: 'approved' | 'rejected' | null; readonly comment: string }
  >;
  const ids = new Set(currentIds);
  for (const id of stored.hunkIds) {
    if (!ids.has(id)) {
      continue;
    }
    const review = stored.decisions[id];
    if (review !== undefined && (review.decision !== null || review.comment !== '')) {
      hunks[id] = { decision: review.decision, comment: review.comment };
    }
  }
  return {
    fingerprint: stored.fingerprint,
    round: stored.round,
    label: stored.label,
    overallNote: stored.overallNote,
    hunks,
    hunkIds: currentIds,
    prior: stored.prior,
  };
}

function parserFailure(): OpenDiffError {
  return { code: 'parser-failed', message: 'The diff parser could not produce a result.' };
}

function addDecodeWarnings(parsed: ParsedOk, decoded: DecodedDiff): ParsedOk {
  const known = new Set(parsed.warnings.map((warning) => warning.code));
  const transportWarnings = decoded.warnings
    .filter((warning) => !known.has(warning.code))
    .map((warning) => ({
      code: warning.code,
      level:
        warning.code === 'invalid-utf8' || warning.code === 'nul-replaced'
          ? ('warn' as const)
          : ('info' as const),
      message: warning.message,
      fileId: null,
      srcLine: null,
      count: warning.count,
      samples: [],
    }));
  return transportWarnings.length === 0
    ? parsed
    : { ...parsed, warnings: [...transportWarnings, ...parsed.warnings] };
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function labelFor(files: readonly DiffFile[], options: OpenDiffOptions): string {
  if (options.choice === 'carry-over' && isPresent(options.current)) {
    return options.label ?? options.current.label;
  }
  return options.label ?? defaultLabel(files, options.sampleTitle);
}

function runParser(parser: DiffParser, decoded: DecodedDiff): Result<ParsedOk, OpenDiffError> {
  let parsed: ParseResult;
  try {
    parsed = parser(decoded.text);
  } catch {
    return fail(parserFailure());
  }
  if (!parsed.ok) {
    return fail(parsed.error);
  }
  return ok(addDecodeWarnings(parsed, decoded));
}

function resolveOutcome(
  decoded: DecodedDiff,
  parsed: ParsedOk,
  options: OpenDiffOptions,
): OpenDiffValue {
  const { current, stored } = options;
  if (isPresent(current) && current.fingerprint === parsed.fingerprint) {
    return { decoded, parsed, state: current, outcome: 'same-open', carryOver: null };
  }
  const ids = hunkIds(parsed.files);
  if (isPresent(stored) && stored.fingerprint === parsed.fingerprint) {
    const state = stateFromStored(stored, ids);
    return { decoded, parsed, state, outcome: 'restored', carryOver: null };
  }
  const label = labelFor(parsed.files, options);
  if (isPresent(current) && options.choice === 'carry-over') {
    const carried = carryOverSummary(current, {
      fingerprint: parsed.fingerprint,
      hunkIds: ids,
      label,
    });
    return { decoded, parsed, state: carried.state, outcome: 'carry-over', carryOver: carried };
  }
  const state = createReviewState(parsed.fingerprint, ids, label);
  return { decoded, parsed, state, outcome: 'new', carryOver: null };
}

export function openDiff(
  input: DecoderInput | string | Uint8Array,
  options: OpenDiffOptions,
): Result<OpenDiffValue, OpenDiffError>;
export function openDiff(
  input: DecoderInput | string | Uint8Array,
  parser: DiffParser,
  options?: Omit<OpenDiffOptions, 'parser'>,
): Result<OpenDiffValue, OpenDiffError>;
export function openDiff(
  input: DecoderInput | string | Uint8Array,
  optionsOrParser: OpenDiffOptions | DiffParser,
  extraOptions: Omit<OpenDiffOptions, 'parser'> = {},
): Result<OpenDiffValue, OpenDiffError> {
  const options: OpenDiffOptions =
    typeof optionsOrParser === 'function'
      ? { ...extraOptions, parser: optionsOrParser }
      : optionsOrParser;
  const decoded = decode(input);
  if (!decoded.ok) {
    return decoded;
  }
  const parsed = runParser(options.parser, decoded.value);
  if (!parsed.ok) {
    return parsed;
  }
  return ok(resolveOutcome(decoded.value, parsed.value, options));
}

export const open = openDiff;

export type RestoreOptions = {
  readonly adapter: ReviewStorageAdapter;
  readonly parser: DiffParser;
};

export function restoreReview(
  fingerprint: string,
  options: RestoreOptions,
): Result<RestoreValue, RestoreError> {
  const stored = options.adapter.getReview(fingerprint);
  if (!stored.ok) {
    return fail({ code: 'parser-failed', message: stored.error.detail });
  }
  if (stored.value === null) {
    return fail({ code: 'not-found', message: 'No saved review was found for this diff.' });
  }
  const savedText = options.adapter.getDiff(fingerprint);
  if (!savedText.ok || savedText.value === null) {
    return ok({
      state: stateFromStored(stored.value, stored.value.hunkIds),
      record: stored.value,
      diffText: null,
      restoredDiff: false,
      files: null,
      warnings: [],
      notice: `Saved decisions for ${String(stored.value.hunkIds.length)} hunks. Paste or drop the same diff to restore them.`,
    });
  }
  const opened = openDiff(savedText.value, { parser: options.parser, stored: stored.value });
  if (!opened.ok) {
    return opened;
  }
  if (opened.value.parsed.fingerprint !== fingerprint) {
    return ok({
      state: stateFromStored(stored.value, stored.value.hunkIds),
      record: stored.value,
      diffText: null,
      restoredDiff: false,
      files: null,
      warnings: [],
      notice: `Saved decisions for ${String(stored.value.hunkIds.length)} hunks were kept, but the saved diff did not match. Paste the same diff to restore them.`,
    });
  }
  return ok({
    state: opened.value.state,
    record: stored.value,
    diffText: savedText.value,
    restoredDiff: true,
    files: opened.value.parsed.files,
    warnings: opened.value.parsed.warnings,
    notice: null,
  });
}

export const restore = restoreReview;
