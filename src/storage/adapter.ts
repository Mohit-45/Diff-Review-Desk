import { LIMITS } from '../core/limits';
import type { Prefs, StoredReview } from '../core/types';
import { browserArea, readKeys, type StorageAreaLike } from './areas';
import { APP_KEY_PREFIX, diffKeyFor, reviewKeyFor } from './keys';
import { noticeForValidation, type StorageNotice } from './notices';
import { readOpenFingerprint, removeAllDiffs, saveOpenFingerprint } from './openReview';
import { readPrefs, readTheme, savePrefs, saveTheme } from './preferences';
import { listReviews, oldestFirst, readReview } from './reviews';
import { StorageState, type StorageMode } from './state';
import { errorResult, isQuotaError, plainError, success, type StorageRead } from './storageErrors';
import { parseReviewRecord, serializeReviewRecord } from './validator';
import { removeValue, writeWithRecovery } from './writes';

export { DIFF_KEY_PREFIX, OPEN_KEY, PREFS_KEY, REVIEW_KEY_PREFIX, THEME_KEY } from './keys';
export { MemoryStorageArea, type StorageAreaLike } from './areas';
export type { StorageNotice } from './notices';
export type { StorageMode } from './state';
export type { StorageRead } from './storageErrors';

export type StorageAdapterOptions = {
  readonly local?: StorageAreaLike | null;
  readonly session?: StorageAreaLike | null;
  readonly maxReviewRecords?: number;
};

export type ReviewStorageAdapter = {
  readonly mode: StorageMode;
  readonly degraded: boolean;
  readonly notices: readonly StorageNotice[];
  getReview(fingerprint: string): StorageRead<StoredReview | null>;
  listReviews(): StorageRead<readonly StoredReview[]>;
  setReview(record: StoredReview, openFingerprint?: string | null): StorageRead<void>;
  removeReview(fingerprint: string): StorageRead<void>;
  getDiff(fingerprint: string): StorageRead<string | null>;
  setDiff(fingerprint: string, text: string, openFingerprint?: string | null): StorageRead<void>;
  removeDiff(fingerprint: string): StorageRead<void>;
  /** Forgets every diff text this tab remembers, for turning "remember diff text" off. */
  removeAllDiffs(): StorageRead<void>;
  /** The review this tab has open, which is what a reload restores. Null when none. */
  getOpenFingerprint(): StorageRead<string | null>;
  setOpenFingerprint(fingerprint: string | null): StorageRead<void>;
  getPrefs(): StorageRead<Prefs>;
  setPrefs(prefs: Prefs): StorageRead<void>;
  getTheme(): StorageRead<Prefs['theme']>;
  setTheme(theme: Prefs['theme']): StorageRead<void>;
  clearAll(): StorageRead<void>;
};

export type StorageAdapter = ReviewStorageAdapter;

/** Keeps the cap on stored reviews, never removing the one just written or the open one. */
function pruneReviews(
  state: StorageState,
  writtenFingerprint: string,
  openFingerprint: string | null,
): void {
  const records = listReviews(state);
  if (!records.ok || records.value.length <= state.maxRecords) {
    return;
  }
  const candidates = oldestFirst(
    records.value.filter(
      (item) => item.fingerprint !== writtenFingerprint && item.fingerprint !== openFingerprint,
    ),
  );
  for (const old of candidates.slice(0, records.value.length - state.maxRecords)) {
    removeValue(state, 'local', reviewKeyFor(old.fingerprint));
  }
}

/** A record from a newer version must survive this one untouched, so it is never overwritten. */
function holdsFutureRecord(state: StorageState, key: string): boolean {
  try {
    const raw = state.area('local').getItem(key);
    if (raw === null) {
      return false;
    }
    const parsed = parseReviewRecord(raw);
    return !parsed.ok && parsed.error.code === 'future-schema';
  } catch {
    return false;
  }
}

function saveReview(
  state: StorageState,
  record: StoredReview,
  openFingerprint: string | null,
): StorageRead<void> {
  const serialized = serializeReviewRecord(record);
  if (!serialized.ok) {
    return errorResult(plainError('unavailable', 'The review could not be saved.'));
  }
  const key = reviewKeyFor(record.fingerprint);
  if (holdsFutureRecord(state, key)) {
    state.memoryArea('local').setItem(key, serialized.value);
    state.addNotice(noticeForValidation(key, 'future-schema'));
    return success(undefined);
  }
  const written = writeWithRecovery(state, {
    area: 'local',
    key,
    value: serialized.value,
    openFingerprint,
  });
  if (written.ok) {
    pruneReviews(state, record.fingerprint, openFingerprint);
  }
  return written;
}

function readDiff(state: StorageState, fingerprint: string): StorageRead<string | null> {
  return state.read(
    () => success(state.area('session').getItem(diffKeyFor(fingerprint))),
    'The saved diff could not be read.',
  );
}

function saveDiff(
  state: StorageState,
  fingerprint: string,
  text: string,
  openFingerprint: string | null,
): StorageRead<void> {
  const key = diffKeyFor(fingerprint);
  if (text.length > LIMITS.maxSavedDiffChars) {
    removeValue(state, 'session', key);
    return success(undefined);
  }
  return writeWithRecovery(state, { area: 'session', key, value: text, openFingerprint });
}

type AppKeys = {
  readonly local: readonly string[];
  readonly session: readonly string[];
};

function appKeys(state: StorageState): AppKeys {
  return {
    local: readKeys(state.area('local'), APP_KEY_PREFIX),
    session: readKeys(state.area('session'), APP_KEY_PREFIX),
  };
}

/** Removes only keys this app owns, in both areas, and never calls clear(). */
function clearAll(state: StorageState): StorageRead<void> {
  let keys: AppKeys;
  try {
    keys = appKeys(state);
  } catch (caught: unknown) {
    state.setMemoryMode(isQuotaError(caught) ? 'quota' : 'degraded');
    keys = appKeys(state);
  }
  for (const key of keys.local) {
    removeValue(state, 'local', key);
  }
  for (const key of keys.session) {
    removeValue(state, 'session', key);
  }
  return success(undefined);
}

function createAdapter(options: StorageAdapterOptions): ReviewStorageAdapter {
  const state = new StorageState({
    local: options.local === undefined ? browserArea('localStorage') : options.local,
    session: options.session === undefined ? browserArea('sessionStorage') : options.session,
    maxRecords: options.maxReviewRecords ?? LIMITS.maxReviewRecords,
  });
  return {
    get mode() {
      return state.mode;
    },
    get degraded() {
      return state.degraded;
    },
    get notices() {
      return state.notices;
    },
    getReview: (fingerprint) => readReview(state, fingerprint),
    listReviews: () => listReviews(state),
    // An omitted open fingerprint means the saved item is the open one; null means none is open.
    setReview: (record, openFingerprint = record.fingerprint) =>
      saveReview(state, record, openFingerprint),
    removeReview: (fingerprint) => removeValue(state, 'local', reviewKeyFor(fingerprint)),
    getDiff: (fingerprint) => readDiff(state, fingerprint),
    setDiff: (fingerprint, text, openFingerprint = fingerprint) =>
      saveDiff(state, fingerprint, text, openFingerprint),
    removeDiff: (fingerprint) => removeValue(state, 'session', diffKeyFor(fingerprint)),
    removeAllDiffs: () => removeAllDiffs(state),
    getOpenFingerprint: () => readOpenFingerprint(state),
    setOpenFingerprint: (fingerprint) => saveOpenFingerprint(state, fingerprint),
    getPrefs: () => readPrefs(state),
    setPrefs: (prefs) => savePrefs(state, prefs),
    getTheme: () => readTheme(state),
    setTheme: (theme) => saveTheme(state, theme),
    clearAll: () => clearAll(state),
  };
}

function looksLikeArea(value: StorageAdapterOptions | StorageAreaLike): value is StorageAreaLike {
  return typeof value === 'object' && ('getItem' in value || 'setItem' in value);
}

export function createStorageAdapter(options?: StorageAdapterOptions): ReviewStorageAdapter;
export function createStorageAdapter(
  local?: StorageAreaLike | null,
  session?: StorageAreaLike | null,
): ReviewStorageAdapter;
export function createStorageAdapter(
  optionsOrLocal: StorageAdapterOptions | StorageAreaLike | null = {},
  session?: StorageAreaLike | null,
): ReviewStorageAdapter {
  if (optionsOrLocal === null) {
    return createAdapter({ local: null, session });
  }
  if (looksLikeArea(optionsOrLocal)) {
    return createAdapter({ local: optionsOrLocal, session });
  }
  return createAdapter(optionsOrLocal);
}

export function createMemoryStorageAdapter(): ReviewStorageAdapter {
  return createAdapter({ local: null, session: null });
}

export const createStorage = createStorageAdapter;
export const createMemoryAdapter = createMemoryStorageAdapter;
export const createBrowserStorageAdapter = createStorageAdapter;
