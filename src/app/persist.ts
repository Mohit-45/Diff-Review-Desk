import { LIMITS } from '../core/limits';
import { fail, ok } from '../core/result';
import { truncateCodePoints } from '../core/review/reducer';
import type { HunkReview, Prefs, Result, ReviewState, StoredReview } from '../core/types';
import type { ReviewStorageAdapter, StorageRead } from '../storage/adapter';

export type PersistOptions = {
  readonly adapter: ReviewStorageAdapter;
  readonly updatedAt: string;
  readonly diffText?: string | null;
  readonly rememberDiff?: boolean;
  readonly sensitivePaths?: readonly string[];
  readonly findSecretSpans?: (text: string) => readonly unknown[];
  readonly hasSensitivePath?: (path: string) => boolean;
  readonly redact?: (text: string) => string;
  readonly openFingerprint?: string | null;
  /** True once the round banner was dismissed; the record then says so, and says nothing otherwise. */
  readonly carryoverDismissed?: boolean;
  /** True when a risk rule could not run: the secret scan is incomplete, so no diff text rests. */
  readonly withholdDiff?: boolean;
};

export type PersistValue = {
  readonly record: StoredReview;
  readonly diff: 'saved' | 'removed' | 'withheld' | 'not-requested';
  /** Why the diff text was kept out of storage, for the visible note; null when nothing is withheld. */
  readonly diffNote: string | null;
  /** Storage notices, each wording once however many writes raised it. */
  readonly notices: readonly string[];
};

export type PersistError = {
  readonly code: 'invalid-record' | 'storage';
  readonly message: string;
};

const SECRET_LIKE =
  /(?:AKIA[0-9A-Z]{16}|(?:gh[pousr]_|github_pat_|xox[baprs]-|sk-(?:live|proj|ant)-|npm_|glpat-)[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|https?:\/\/[^\s/@]+:[^\s/@]+@|Authorization:\s*Bearer\s+\S+|-----BEGIN [^-]*PRIVATE KEY-----|(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["'][^"'\n]{8,120}["'])/iu;
const SENSITIVE_PATH =
  /(?:^|\/)(?:\.env(?:\.[^/]+)?|[^/]+\.(?:pem|key|p12|tfstate)|id_(?:rsa|ed25519)|\.netrc|serviceaccount[^/]*\.json)$/iu;

function defaultRedact(text: string): string {
  let redacted = text.replace(
    /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gu,
    '[REDACTED:private-key]',
  );
  let previous = '';
  while (redacted !== previous) {
    previous = redacted;
    redacted = redacted.replace(SECRET_LIKE, '[REDACTED:secret]');
  }
  return redacted;
}

/**
 * A token is longer than most secrets, so redacting text that sat at its cap can push it over.
 * The validator would then refuse the whole record, so the cap is applied again after redaction.
 */
function redactWithin(redact: (text: string) => string, text: string, maximum: number): string {
  return truncateCodePoints(redact(text), maximum);
}

function sparseDecisions(
  state: ReviewState,
  redact: (text: string) => string,
): Readonly<Record<string, HunkReview>> {
  const decisions = Object.create(null) as Record<string, HunkReview>;
  for (const id of state.hunkIds) {
    const review = state.hunks[id];
    if (review !== undefined && (review.decision !== null || review.comment !== '')) {
      decisions[id] = {
        decision: review.decision,
        comment: redactWithin(redact, review.comment, LIMITS.maxCommentChars),
      };
    }
  }
  return decisions;
}

export function toStoredReview(
  state: ReviewState,
  updatedAt: string,
  redact: (text: string) => string = defaultRedact,
  carryoverDismissed = false,
): StoredReview {
  const record: StoredReview = {
    schemaVersion: 1,
    hashVersion: 1,
    updatedAt,
    fingerprint: state.fingerprint,
    round: state.round,
    label: redactWithin(redact, state.label, LIMITS.maxLabelChars),
    overallNote: redactWithin(redact, state.overallNote, LIMITS.maxOverallNoteChars),
    decisions: sparseDecisions(state, redact),
    hunkIds: [...state.hunkIds],
    prior: state.prior,
  };
  return carryoverDismissed ? { ...record, carryoverDismissed } : record;
}

function containsSensitivePath(
  paths: readonly string[] | undefined,
  predicate: ((path: string) => boolean) | undefined,
): boolean {
  if (predicate !== undefined) {
    try {
      return paths?.some(predicate) ?? false;
    } catch {
      return true;
    }
  }
  return paths?.some((path) => SENSITIVE_PATH.test(path)) ?? false;
}

function containsSecret(
  text: string,
  detector: ((text: string) => readonly unknown[]) | undefined,
): boolean {
  if (detector !== undefined) {
    try {
      return detector(text).length > 0;
    } catch {
      return true;
    }
  }
  return SECRET_LIKE.test(text);
}

function storageNotices(
  adapter: ReviewStorageAdapter,
  result: StorageRead<unknown>,
): readonly string[] {
  const notices: string[] = [];
  if (!result.ok) {
    notices.push(result.error.detail);
  }
  for (const notice of adapter.notices) {
    notices.push(notice.message);
  }
  return notices;
}

type DiffOutcome = {
  readonly diff: PersistValue['diff'];
  readonly note: string | null;
  readonly notices: readonly string[];
};

function prepareRecord(
  state: ReviewState,
  options: PersistOptions,
): Result<StoredReview, PersistError> {
  try {
    return ok(
      toStoredReview(
        state,
        options.updatedAt,
        options.redact ?? defaultRedact,
        options.carryoverDismissed,
      ),
    );
  } catch {
    return fail({
      code: 'invalid-record',
      message: 'The review could not be prepared for saving.',
    });
  }
}

function isSafeToSave(diffText: string, options: PersistOptions): boolean {
  return (
    options.rememberDiff === true &&
    diffText.length <= LIMITS.maxSavedDiffChars &&
    !containsSecret(diffText, options.findSecretSpans) &&
    !containsSensitivePath(options.sensitivePaths, options.hasSensitivePath)
  );
}

function withheldNotice(record: StoredReview): string {
  const decisions = Object.values(record.decisions).filter(
    (review) => review.decision !== null,
  ).length;
  return `Your diff text was not saved because it contains a secret-like string. ${String(decisions)} decisions are stored. Paste the same diff to restore them.`;
}

function persistDiffText(
  state: ReviewState,
  record: StoredReview,
  diffText: string,
  options: PersistOptions,
): DiffOutcome {
  if (isSafeToSave(diffText, options)) {
    const saved = options.adapter.setDiff(state.fingerprint, diffText, state.fingerprint);
    return {
      diff: saved.ok ? 'saved' : 'withheld',
      note: null,
      notices: storageNotices(options.adapter, saved),
    };
  }
  options.adapter.removeDiff(state.fingerprint);
  if (options.rememberDiff !== true) {
    return { diff: 'removed', note: null, notices: [] };
  }
  const note = withheldNotice(record);
  return { diff: 'withheld', note, notices: [note] };
}

function persistDiff(
  state: ReviewState,
  record: StoredReview,
  options: PersistOptions,
): DiffOutcome {
  const { diffText } = options;
  if (options.withholdDiff === true) {
    // The review pane already says why, so the storage note stays empty.
    options.adapter.removeDiff(state.fingerprint);
    return { diff: 'withheld', note: null, notices: [] };
  }
  if (diffText !== undefined && diffText !== null) {
    return persistDiffText(state, record, diffText, options);
  }
  if (options.rememberDiff === true) {
    return { diff: 'not-requested', note: null, notices: [] };
  }
  options.adapter.removeDiff(state.fingerprint);
  return { diff: 'removed', note: null, notices: [] };
}

export function persistReview(
  state: ReviewState,
  options: PersistOptions,
): Result<PersistValue, PersistError> {
  const prepared = prepareRecord(state, options);
  if (!prepared.ok) {
    return prepared;
  }
  const record = prepared.value;
  const review = options.adapter.setReview(record, options.openFingerprint ?? state.fingerprint);
  if (!review.ok) {
    return fail({ code: 'storage', message: review.error.detail });
  }
  const reviewNotices = storageNotices(options.adapter, review);
  const outcome = persistDiff(state, record, options);
  return ok({
    record,
    diff: outcome.diff,
    diffNote: outcome.note,
    notices: [...new Set([...reviewNotices, ...outcome.notices])],
  });
}

export function persist(
  state: ReviewState,
  options: PersistOptions,
): Result<PersistValue, PersistError>;
export function persist(
  state: ReviewState,
  adapter: ReviewStorageAdapter,
  updatedAt: string,
  options?: Omit<PersistOptions, 'adapter' | 'updatedAt'>,
): Result<PersistValue, PersistError>;
export function persist(
  state: ReviewState,
  optionsOrAdapter: PersistOptions | ReviewStorageAdapter,
  updatedAt?: string,
  extraOptions: Omit<PersistOptions, 'adapter' | 'updatedAt'> = {},
): Result<PersistValue, PersistError> {
  if ('adapter' in optionsOrAdapter) {
    return persistReview(state, optionsOrAdapter);
  }
  if (updatedAt === undefined) {
    return fail({ code: 'invalid-record', message: 'A persistence timestamp is required.' });
  }
  return persistReview(state, { ...extraOptions, adapter: optionsOrAdapter, updatedAt });
}

export function rememberDiffOff(
  adapter: ReviewStorageAdapter,
  fingerprint: string,
): Result<void, PersistError> {
  const removed = adapter.removeDiff(fingerprint);
  return removed.ok ? ok(undefined) : fail({ code: 'storage', message: removed.error.detail });
}

/** Turning "remember diff text" off: every stored diff of this tab goes at once. */
export function forgetAllDiffs(adapter: ReviewStorageAdapter): Result<void, PersistError> {
  const removed = adapter.removeAllDiffs();
  return removed.ok ? ok(undefined) : fail({ code: 'storage', message: removed.error.detail });
}

export function prefsWithRememberDiff(prefs: Prefs, rememberDiff: boolean): Prefs {
  return { ...prefs, rememberDiff };
}
