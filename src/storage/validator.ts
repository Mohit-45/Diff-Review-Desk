import { LIMITS } from '../core/limits';
import { ok } from '../core/result';
import type { Prefs, Result, StoredReview, ValidationError } from '../core/types';
import { cloneDecisionMap, cloneStringIds } from './decisionRecords';
import { clonePrior } from './priorRecord';
import {
  FINGERPRINT_PATTERN,
  MAX_ROUND,
  hasOnlyKeys,
  isInteger,
  isString,
  parseObject,
  reject,
  type UnknownRecord,
} from './recordGuards';

export { DECISION_KEY_PATTERN, FINGERPRINT_PATTERN, MAX_STORED_HUNKS } from './recordGuards';

const MAX_TIMESTAMP_CHARS = 128;

const REVIEW_KEYS: ReadonlySet<string> = new Set([
  'schemaVersion',
  'hashVersion',
  'updatedAt',
  'fingerprint',
  'round',
  'label',
  'overallNote',
  'decisions',
  'hunkIds',
  'prior',
  'carryoverDismissed',
]);

const PREFS_KEYS: ReadonlySet<string> = new Set([
  'theme',
  'shortcutsEnabled',
  'autoAdvance',
  'rememberDiff',
]);

type Scalars = Pick<StoredReview, 'updatedAt' | 'fingerprint' | 'round' | 'label' | 'overallNote'>;
type Collections = Pick<StoredReview, 'decisions' | 'hunkIds' | 'prior'>;

/** Orders the version checks so a newer schema is reported before anything else is judged. */
function checkEnvelope(value: UnknownRecord): Result<UnknownRecord, ValidationError> {
  if (typeof value.schemaVersion === 'number' && value.schemaVersion > 1) {
    return reject('future-schema', 'Saved review data was written by a newer version.');
  }
  if (value.hashVersion !== undefined && value.hashVersion !== 1 && value.schemaVersion === 1) {
    return reject('hash-version', 'Saved review data uses an unsupported hash version.');
  }
  if (!hasOnlyKeys(value, REVIEW_KEYS)) {
    return reject('invalid-field', 'Saved review data contains an unknown key.');
  }
  if (value.schemaVersion !== 1) {
    return reject('invalid-field', 'Saved review schema version is invalid.');
  }
  if (value.hashVersion !== 1) {
    return reject('hash-version', 'Saved review data uses an unsupported hash version.');
  }
  return ok(value);
}

function readScalars(value: UnknownRecord): Result<Scalars, ValidationError> {
  if (!isString(value.updatedAt, MAX_TIMESTAMP_CHARS)) {
    return reject('invalid-field', 'Saved review timestamp is invalid.');
  }
  if (typeof value.fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(value.fingerprint)) {
    return reject('invalid-field', 'Saved review fingerprint is invalid.');
  }
  if (!isInteger(value.round, MAX_ROUND) || value.round < 1) {
    return reject('invalid-field', 'Saved review round is invalid.');
  }
  if (
    !isString(value.label, LIMITS.maxLabelChars) ||
    !isString(value.overallNote, LIMITS.maxOverallNoteChars)
  ) {
    return reject('invalid-field', 'Saved review text exceeds its limit.');
  }
  return ok({
    updatedAt: value.updatedAt,
    fingerprint: value.fingerprint,
    round: value.round,
    label: value.label,
    overallNote: value.overallNote,
  });
}

function readCollections(
  value: UnknownRecord,
  round: number,
): Result<Collections, ValidationError> {
  const ids = cloneStringIds(value.hunkIds, 'hunk ids');
  if (!ids.ok) {
    return ids;
  }
  const decisions = cloneDecisionMap(value.decisions);
  if (!decisions.ok) {
    return decisions;
  }
  const prior = clonePrior(value.prior, new Set(ids.value), round);
  if (!prior.ok) {
    return prior;
  }
  return ok({ decisions: decisions.value, hunkIds: ids.value, prior: prior.value });
}

function parseReviewRecordUnsafe(input: unknown): Result<StoredReview, ValidationError> {
  const object = parseObject(input);
  if (!object.ok) {
    return object;
  }
  const envelope = checkEnvelope(object.value);
  if (!envelope.ok) {
    return envelope;
  }
  const value = envelope.value;
  const scalars = readScalars(value);
  if (!scalars.ok) {
    return scalars;
  }
  const collections = readCollections(value, scalars.value.round);
  if (!collections.ok) {
    return collections;
  }
  const record: StoredReview = {
    schemaVersion: 1,
    hashVersion: 1,
    ...scalars.value,
    ...collections.value,
  };
  const dismissed = value.carryoverDismissed;
  if (dismissed === undefined) {
    return ok(record);
  }
  if (typeof dismissed !== 'boolean') {
    return reject('invalid-field', 'Saved carry-over dismissal is invalid.');
  }
  return ok({ ...record, carryoverDismissed: dismissed });
}

export function parseReviewRecord(input: unknown): Result<StoredReview, ValidationError> {
  try {
    return parseReviewRecordUnsafe(input);
  } catch {
    return reject('corrupt', 'Saved review data could not be read.');
  }
}

export function serializeReviewRecord(record: StoredReview): Result<string, ValidationError> {
  const validated = parseReviewRecord(record);
  if (!validated.ok) {
    return validated;
  }
  try {
    const serialized = JSON.stringify(validated.value);
    return typeof serialized === 'string' && serialized.length <= LIMITS.maxRecordChars
      ? ok(serialized)
      : reject('too-large', 'The review record is too large to save.');
  } catch {
    return reject('corrupt', 'The review record could not be serialized.');
  }
}

export const validateReviewRecord = parseReviewRecord;
export const parseStoredReview = parseReviewRecord;
export const validateStoredReview = parseReviewRecord;

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  shortcutsEnabled: true,
  autoAdvance: true,
  // On by default: the landing page promises the diff text rests in this tab's session storage,
  // and the secret and sensitive-path gate still keeps risky text out.
  rememberDiff: true,
};

/** True for the three theme names; the runtime check guards values that skipped the type. */
export function isThemeName(value: unknown): value is Prefs['theme'] {
  return value === 'system' || value === 'light' || value === 'dark';
}

function parsePrefsUnsafe(input: unknown): Result<Prefs, ValidationError> {
  const object = parseObject(input);
  if (!object.ok) {
    return object;
  }
  const value = object.value;
  if (!hasOnlyKeys(value, PREFS_KEYS)) {
    return reject('invalid-field', 'Saved preferences contain an unknown key.');
  }
  if (!isThemeName(value.theme)) {
    return reject('invalid-field', 'Saved theme is invalid.');
  }
  if (
    typeof value.shortcutsEnabled !== 'boolean' ||
    typeof value.autoAdvance !== 'boolean' ||
    typeof value.rememberDiff !== 'boolean'
  ) {
    return reject('invalid-field', 'Saved preferences contain an invalid value.');
  }
  return ok({
    theme: value.theme,
    shortcutsEnabled: value.shortcutsEnabled,
    autoAdvance: value.autoAdvance,
    rememberDiff: value.rememberDiff,
  });
}

export function parsePrefs(input: unknown): Result<Prefs, ValidationError> {
  try {
    return parsePrefsUnsafe(input);
  } catch {
    return reject('corrupt', 'Saved preferences could not be read.');
  }
}

export function serializePrefs(prefs: Prefs): Result<string, ValidationError> {
  const valid = parsePrefs(prefs);
  if (!valid.ok) {
    return valid;
  }
  try {
    return ok(JSON.stringify(valid.value));
  } catch {
    return reject('corrupt', 'Preferences could not be serialized.');
  }
}
