import { LIMITS } from '../core/limits';
import { fail, ok } from '../core/result';
import type { Prefs, Result, StorageError, StoredReview } from '../core/types';
import {
  DEFAULT_PREFS,
  parsePrefs,
  parseReviewRecord,
  serializePrefs,
  serializeReviewRecord,
} from './validator';

export const REVIEW_KEY_PREFIX = 'drd:review:';
export const DIFF_KEY_PREFIX = 'drd:diff:';
export const PREFS_KEY = 'drd:prefs';
export const THEME_KEY = 'drd:theme';

export type StorageAreaLike = {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
};

export type StorageMode = 'persistent' | 'memory';

export type StorageNotice = {
  readonly code: 'degraded' | 'corrupt' | 'future-schema' | 'hash-version' | 'quota';
  readonly message: string;
  readonly key: string | null;
};

export type StorageRead<T> = Result<T, StorageError> & {
  readonly notices?: readonly StorageNotice[];
};

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
  getPrefs(): StorageRead<Prefs>;
  setPrefs(prefs: Prefs): StorageRead<void>;
  getTheme(): StorageRead<Prefs['theme']>;
  setTheme(theme: Prefs['theme']): StorageRead<void>;
  clearAll(): StorageRead<void>;
};

export type StorageAdapter = ReviewStorageAdapter;

function plainError(code: StorageError['code'], detail: string): StorageError {
  if (code === 'denied') {
    return {
      code,
      title: 'Browser storage is unavailable',
      detail,
      suggestion: 'Keep this tab open or export your review to keep it.',
    };
  }
  if (code === 'quota') {
    return {
      code,
      title: 'Browser storage is full',
      detail,
      suggestion: 'Export your review and clear saved data before trying again.',
    };
  }
  return {
    code,
    title: 'Browser storage is unavailable',
    detail,
    suggestion: 'Keep this tab open or export your review to keep it.',
  };
}

function isQuotaError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const name = 'name' in value && typeof value.name === 'string' ? value.name : '';
  const code = 'code' in value && typeof value.code === 'number' ? value.code : 0;
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

function isStorageError(value: unknown): boolean {
  if (isQuotaError(value)) {
    return false;
  }
  return (
    typeof value === 'object' && value !== null && 'name' in value && value.name === 'SecurityError'
  );
}

function errorResult<T>(error: StorageError): StorageRead<T> {
  return fail(error);
}

function success<T>(value: T): StorageRead<T> {
  return ok(value);
}

export class MemoryStorageArea implements StorageAreaLike {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
}

function browserArea(name: 'localStorage' | 'sessionStorage'): StorageAreaLike | null {
  try {
    const candidate = globalThis[name];
    return candidate === undefined ? null : candidate;
  } catch {
    return null;
  }
}

function readKeys(area: StorageAreaLike, prefix: string): readonly string[] {
  const keys: string[] = [];
  for (let index = 0; index < area.length; index += 1) {
    const key = area.key(index);
    if (key !== null && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}

function noticeForValidation(key: string, code: StorageNotice['code']): StorageNotice {
  if (code === 'future-schema') {
    return {
      code,
      key,
      message: 'Saved review data is from a newer version and was not restored.',
    };
  }
  if (code === 'hash-version') {
    return {
      code,
      key,
      message: 'Saved review data uses an unsupported hash and was not restored.',
    };
  }
  return { code: 'corrupt', key, message: 'Saved review data was corrupt and was not restored.' };
}

function createAdapter(options: StorageAdapterOptions): ReviewStorageAdapter {
  const configuredLocal = options.local === undefined ? browserArea('localStorage') : options.local;
  const configuredSession =
    options.session === undefined ? browserArea('sessionStorage') : options.session;
  const memoryLocal = new MemoryStorageArea();
  const memorySession = new MemoryStorageArea();
  let local: StorageAreaLike = memoryLocal;
  let session: StorageAreaLike = memorySession;
  let mode: StorageMode = 'memory';
  let degraded = true;
  let noticeList: StorageNotice[] = [];
  const maxRecords = options.maxReviewRecords ?? LIMITS.maxReviewRecords;
  let seedFailed = false;

  function addNotice(notice: StorageNotice): void {
    if (
      noticeList.some((existing) => existing.code === notice.code && existing.key === notice.key)
    ) {
      return;
    }
    noticeList = [...noticeList, notice];
  }

  function setMemoryMode(reason: StorageNotice['code'] = 'degraded'): void {
    if (mode === 'memory') {
      if (reason !== 'degraded') {
        addNotice({
          code: reason,
          key: null,
          message: 'Browser storage is unavailable; progress remains in memory.',
        });
      }
      return;
    }
    mode = 'memory';
    degraded = true;
    local = memoryLocal;
    session = memorySession;
    addNotice({
      code: reason === 'quota' ? 'quota' : 'degraded',
      key: null,
      message: 'Progress is not being saved in this browser. Export your review to keep it.',
    });
  }

  function seedMemory(area: StorageAreaLike | null, target: MemoryStorageArea): void {
    if (area === null) {
      return;
    }
    try {
      for (let index = 0; index < area.length; index += 1) {
        const key = area.key(index);
        if (key !== null) {
          const value = area.getItem(key);
          if (value !== null) {
            target.setItem(key, value);
          }
        }
      }
    } catch {
      seedFailed = true;
    }
  }

  function canRead(area: StorageAreaLike): boolean {
    try {
      area.getItem(PREFS_KEY);
      return true;
    } catch {
      return false;
    }
  }

  if (
    configuredLocal !== null &&
    configuredSession !== null &&
    canRead(configuredLocal) &&
    canRead(configuredSession)
  ) {
    seedMemory(configuredLocal, memoryLocal);
    seedMemory(configuredSession, memorySession);
    if (!seedFailed) {
      local = configuredLocal;
      session = configuredSession;
      mode = 'persistent';
      degraded = false;
    }
    try {
      local.length;
      session.length;
    } catch {
      setMemoryMode();
    }
  }
  if (mode === 'memory') {
    addNotice({
      code: 'degraded',
      key: null,
      message: 'Progress is not being saved in this browser. Export your review to keep it.',
    });
  }

  function readReview(fingerprint: string): StorageRead<StoredReview | null> {
    const key = `${REVIEW_KEY_PREFIX}${fingerprint}`;
    try {
      const raw = local.getItem(key);
      if (raw === null) {
        return success(null);
      }
      const parsed = parseReviewRecord(raw);
      if (!parsed.ok) {
        addNotice(
          noticeForValidation(
            key,
            parsed.error.code === 'future-schema' || parsed.error.code === 'hash-version'
              ? parsed.error.code
              : 'corrupt',
          ),
        );
        return success(null);
      }
      if (parsed.value.fingerprint !== fingerprint) {
        addNotice(noticeForValidation(key, 'corrupt'));
        return success(null);
      }
      return success(parsed.value);
    } catch (caught: unknown) {
      if (isStorageError(caught)) {
        setMemoryMode();
        return readReview(fingerprint);
      }
      return errorResult(plainError('unavailable', 'A saved review could not be read.'));
    }
  }

  function listReviews(): StorageRead<readonly StoredReview[]> {
    const records: StoredReview[] = [];
    let keys: readonly string[];
    try {
      keys = readKeys(local, REVIEW_KEY_PREFIX);
    } catch (caught: unknown) {
      if (isStorageError(caught)) {
        setMemoryMode();
        return listReviews();
      }
      return errorResult(plainError('unavailable', 'Saved reviews could not be listed.'));
    }
    for (const key of keys) {
      const fingerprint = key.slice(REVIEW_KEY_PREFIX.length);
      const review = readReview(fingerprint);
      if (!review.ok) {
        return review;
      }
      if (review.value !== null) {
        records.push(review.value);
      }
    }
    return success(records);
  }

  function mirrorSet(area: MemoryStorageArea, key: string, value: string): void {
    area.setItem(key, value);
  }

  function mirrorRemove(area: MemoryStorageArea, key: string): void {
    area.removeItem(key);
  }

  function writeWithRecovery(
    areaName: 'local' | 'session',
    key: string,
    value: string,
    openFingerprint: string | null,
  ): StorageRead<void> {
    const area = areaName === 'local' ? local : session;
    const memoryArea = areaName === 'local' ? memoryLocal : memorySession;
    mirrorSet(memoryArea, key, value);
    if (mode === 'memory') {
      return success(undefined);
    }
    try {
      area.setItem(key, value);
      return success(undefined);
    } catch (caught: unknown) {
      if (isStorageError(caught)) {
        setMemoryMode();
        return success(undefined);
      }
      if (!isQuotaError(caught)) {
        setMemoryMode();
        return success(undefined);
      }
      addNotice({
        code: 'quota',
        key,
        message: 'Browser storage quota was reached; older reviews were removed.',
      });
    }

    if (areaName === 'local') {
      evictOldReviews(openFingerprint, key);
      try {
        area.setItem(key, value);
        return success(undefined);
      } catch (caught: unknown) {
        if (isStorageError(caught)) {
          setMemoryMode();
          return success(undefined);
        }
        if (!isQuotaError(caught)) {
          setMemoryMode();
          return success(undefined);
        }
      }
      if (openFingerprint !== null) {
        removePersistentDiff(openFingerprint);
      }
      try {
        area.setItem(key, value);
        return success(undefined);
      } catch (caught: unknown) {
        if (isStorageError(caught)) {
          setMemoryMode();
          return success(undefined);
        }
        setMemoryMode('quota');
        return success(undefined);
      }
    }

    if (openFingerprint !== null) {
      removePersistentDiff(openFingerprint);
    }
    setMemoryMode('quota');
    return areaName === 'session'
      ? errorResult(
          plainError(
            'quota',
            'The diff text could not be saved after the browser quota was reached.',
          ),
        )
      : success(undefined);
  }

  function removePersistentDiff(fingerprint: string): void {
    const key = `${DIFF_KEY_PREFIX}${fingerprint}`;
    mirrorRemove(memorySession, key);
    if (mode === 'memory') {
      return;
    }
    try {
      session.removeItem(key);
    } catch (caught: unknown) {
      if (isStorageError(caught)) {
        setMemoryMode();
      }
    }
  }

  function evictOldReviews(openFingerprint: string | null, currentKey: string): void {
    const records = listReviews();
    if (!records.ok) {
      return;
    }
    const candidates = records.value
      .filter(
        (record) =>
          record.fingerprint !== openFingerprint &&
          `${REVIEW_KEY_PREFIX}${record.fingerprint}` !== currentKey,
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    const excess = Math.max(1, records.value.length - maxRecords + 1);
    for (const record of candidates.slice(0, excess)) {
      removeValue('local', `${REVIEW_KEY_PREFIX}${record.fingerprint}`);
    }
  }

  function removeValue(areaName: 'local' | 'session', key: string): StorageRead<void> {
    const area = areaName === 'local' ? local : session;
    const memoryArea = areaName === 'local' ? memoryLocal : memorySession;
    mirrorRemove(memoryArea, key);
    if (mode === 'memory') {
      return success(undefined);
    }
    try {
      area.removeItem(key);
      return success(undefined);
    } catch (caught: unknown) {
      setMemoryMode(isQuotaError(caught) ? 'quota' : 'degraded');
      return success(undefined);
    }
  }

  function getDiff(fingerprint: string): StorageRead<string | null> {
    const key = `${DIFF_KEY_PREFIX}${fingerprint}`;
    try {
      return success(session.getItem(key));
    } catch (caught: unknown) {
      if (isStorageError(caught)) {
        setMemoryMode();
        return getDiff(fingerprint);
      }
      return errorResult(plainError('unavailable', 'The saved diff could not be read.'));
    }
  }

  function getPrefs(): StorageRead<Prefs> {
    try {
      const raw = local.getItem(PREFS_KEY);
      if (raw === null) {
        return success({ ...DEFAULT_PREFS });
      }
      const parsed = parsePrefs(raw);
      if (parsed.ok) {
        return success(parsed.value);
      }
      addNotice({
        code: 'corrupt',
        key: PREFS_KEY,
        message: 'Saved preferences were corrupt and were reset.',
      });
      return success({ ...DEFAULT_PREFS });
    } catch (caught: unknown) {
      if (isStorageError(caught)) {
        setMemoryMode();
        return getPrefs();
      }
      return errorResult(plainError('unavailable', 'Saved preferences could not be read.'));
    }
  }

  function setPrefs(prefs: Prefs): StorageRead<void> {
    const serialized = serializePrefs(prefs);
    if (!serialized.ok) {
      return errorResult(plainError('unavailable', 'Preferences could not be saved.'));
    }
    return writeWithRecovery('local', PREFS_KEY, serialized.value, null);
  }

  function clearAll(): StorageRead<void> {
    let localKeys: readonly string[] = [];
    let sessionKeys: readonly string[] = [];
    try {
      localKeys = readKeys(local, 'drd:');
      sessionKeys = readKeys(session, 'drd:');
    } catch (caught: unknown) {
      setMemoryMode(isQuotaError(caught) ? 'quota' : 'degraded');
      localKeys = readKeys(local, 'drd:');
      sessionKeys = readKeys(session, 'drd:');
    }
    for (const key of localKeys) {
      removeValue('local', key);
    }
    for (const key of sessionKeys) {
      removeValue('session', key);
    }
    return success(undefined);
  }

  const adapter: ReviewStorageAdapter = {
    get mode() {
      return mode;
    },
    get degraded() {
      return degraded;
    },
    get notices() {
      return noticeList;
    },
    getReview: readReview,
    listReviews,
    setReview(record, openFingerprint = record.fingerprint) {
      const serialized = serializeReviewRecord(record);
      if (!serialized.ok) {
        return errorResult(plainError('unavailable', 'The review could not be saved.'));
      }
      const written = writeWithRecovery(
        'local',
        `${REVIEW_KEY_PREFIX}${record.fingerprint}`,
        serialized.value,
        openFingerprint,
      );
      if (written.ok) {
        const records = listReviews();
        if (records.ok && records.value.length > maxRecords) {
          const candidates = records.value
            .filter(
              (item) =>
                item.fingerprint !== record.fingerprint && item.fingerprint !== openFingerprint,
            )
            .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
          for (const old of candidates.slice(0, records.value.length - maxRecords)) {
            removeValue('local', `${REVIEW_KEY_PREFIX}${old.fingerprint}`);
          }
        }
      }
      return written;
    },
    removeReview(fingerprint) {
      return removeValue('local', `${REVIEW_KEY_PREFIX}${fingerprint}`);
    },
    getDiff,
    setDiff(fingerprint, text, openFingerprint = fingerprint) {
      if (text.length > LIMITS.maxSavedDiffChars) {
        removeValue('session', `${DIFF_KEY_PREFIX}${fingerprint}`);
        return success(undefined);
      }
      return writeWithRecovery(
        'session',
        `${DIFF_KEY_PREFIX}${fingerprint}`,
        text,
        openFingerprint,
      );
    },
    removeDiff(fingerprint) {
      return removeValue('session', `${DIFF_KEY_PREFIX}${fingerprint}`);
    },
    getPrefs,
    setPrefs,
    getTheme() {
      try {
        const raw = local.getItem(THEME_KEY);
        return raw === 'light' || raw === 'dark' || raw === 'system'
          ? success(raw)
          : success('system');
      } catch (caught: unknown) {
        if (isStorageError(caught)) {
          setMemoryMode();
          return adapter.getTheme();
        }
        return errorResult(plainError('unavailable', 'Saved theme could not be read.'));
      }
    },
    setTheme(theme) {
      if (theme !== 'system' && theme !== 'light' && theme !== 'dark') {
        return errorResult(plainError('unavailable', 'The selected theme is invalid.'));
      }
      return writeWithRecovery('local', THEME_KEY, theme, null);
    },
    clearAll,
  };
  return adapter;
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
  if (
    optionsOrLocal !== null &&
    typeof optionsOrLocal === 'object' &&
    ('getItem' in optionsOrLocal || 'setItem' in optionsOrLocal)
  ) {
    return createAdapter({ local: optionsOrLocal as StorageAreaLike, session });
  }
  if (optionsOrLocal === null) {
    return createAdapter({ local: null, session });
  }
  return createAdapter(optionsOrLocal);
}

export function createMemoryStorageAdapter(): ReviewStorageAdapter {
  return createAdapter({ local: null, session: null });
}

export const createStorage = createStorageAdapter;
export const createMemoryAdapter = createMemoryStorageAdapter;
export const createBrowserStorageAdapter = createStorageAdapter;
