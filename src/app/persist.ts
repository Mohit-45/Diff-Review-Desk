import { LIMITS } from '../core/limits';
import { ok } from '../core/result';
import type { HunkReview, Prefs, Result, ReviewState, StoredReview } from '../core/types';
import type { ReviewStorageAdapter, StorageNotice, StorageRead } from '../storage/adapter';

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
};

export type PersistValue = {
  readonly record: StoredReview;
  readonly diff: 'saved' | 'removed' | 'withheld' | 'not-requested';
  readonly notices: readonly string[];
};

export type PersistError = {
  readonly code: 'invalid-record' | 'storage';
  readonly message: string;
};

const SECRET_LIKE =
  /(?:AKIA[0-9A-Z]{16}|(?:gh[pousr]_|github_pat_|xox[baprs]-|sk-(?:live|proj|ant)-|npm_|glpat-)[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_-]{20,}|https?:\/\/[^\s/@]+:[^\s/@]+@|Authorization:\s*Bearer\s+\S+|-----BEGIN [^-]*PRIVATE KEY-----|(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["'][^"'\n]{8,120}["'])/iu;
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

function sparseDecisions(
  state: ReviewState,
  redact: (text: string) => string,
): Readonly<Record<string, HunkReview>> {
  const decisions = Object.create(null) as Record<string, HunkReview>;
  for (const id of state.hunkIds) {
    const review = state.hunks[id];
    if (review !== undefined && (review.decision !== null || review.comment !== '')) {
      decisions[id] = { decision: review.decision, comment: redact(review.comment) };
    }
  }
  return decisions;
}

export function toStoredReview(
  state: ReviewState,
  updatedAt: string,
  redact: (text: string) => string = defaultRedact,
): StoredReview {
  return {
    schemaVersion: 1,
    hashVersion: 1,
    updatedAt,
    fingerprint: state.fingerprint,
    round: state.round,
    label: redact(state.label),
    overallNote: redact(state.overallNote),
    decisions: sparseDecisions(state, redact),
    hunkIds: [...state.hunkIds],
    prior: state.prior,
  };
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
  if (
    adapter.degraded &&
    !notices.some((message) => message.includes("Progress isn't being saved"))
  ) {
    notices.push("Progress isn't being saved in this browser. Export your review to keep it.");
  }
  return notices;
}

export function persistReview(
  state: ReviewState,
  options: PersistOptions,
): Result<PersistValue, PersistError> {
  let record: StoredReview;
  try {
    record = toStoredReview(state, options.updatedAt, options.redact ?? defaultRedact);
  } catch {
    return {
      ok: false,
      error: { code: 'invalid-record', message: 'The review could not be prepared for saving.' },
    };
  }
  const review = options.adapter.setReview(record, options.openFingerprint ?? state.fingerprint);
  if (!review.ok) {
    return { ok: false, error: { code: 'storage', message: review.error.detail } };
  }
  const notices: string[] = [...storageNotices(options.adapter, review)];
  let diff: PersistValue['diff'] = 'not-requested';
  const shouldRemember = options.rememberDiff === true;
  if (options.diffText !== undefined && options.diffText !== null) {
    const safeToSave =
      shouldRemember &&
      options.diffText.length <= LIMITS.maxSavedDiffChars &&
      !containsSecret(options.diffText, options.findSecretSpans) &&
      !containsSensitivePath(options.sensitivePaths, options.hasSensitivePath);
    if (safeToSave) {
      const saved = options.adapter.setDiff(state.fingerprint, options.diffText, state.fingerprint);
      diff = saved.ok ? 'saved' : 'withheld';
      notices.push(...storageNotices(options.adapter, saved));
    } else {
      options.adapter.removeDiff(state.fingerprint);
      diff = shouldRemember ? 'withheld' : 'removed';
      if (shouldRemember) {
        const decisions = Object.values(record.decisions).filter(
          (review) => review.decision !== null,
        ).length;
        notices.push(
          `Your diff text was not saved because it contains a secret-like string. ${decisions} decisions are stored. Paste the same diff to restore them.`,
        );
      }
    }
  } else if (!shouldRemember) {
    options.adapter.removeDiff(state.fingerprint);
    diff = 'removed';
  }
  return ok({ record, diff, notices });
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
    return {
      ok: false,
      error: { code: 'invalid-record', message: 'A persistence timestamp is required.' },
    };
  }
  return persistReview(state, { ...extraOptions, adapter: optionsOrAdapter, updatedAt });
}

export function rememberDiffOff(
  adapter: ReviewStorageAdapter,
  fingerprint: string,
): Result<void, PersistError> {
  const removed = adapter.removeDiff(fingerprint);
  return removed.ok
    ? ok(undefined)
    : { ok: false, error: { code: 'storage', message: removed.error.detail } };
}

export function prefsWithRememberDiff(prefs: Prefs, rememberDiff: boolean): Prefs {
  return { ...prefs, rememberDiff };
}
