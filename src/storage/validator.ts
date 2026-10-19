import { LIMITS } from '../core/limits';
import { fail, ok } from '../core/result';
import type { HunkReview, Prefs, Result, StoredReview, ValidationError } from '../core/types';

export const DECISION_KEY_PATTERN = /^f[0-9a-z]{11}(~[0-9]+)?:[0-9a-z]{11}(#[0-9]+)?$/u;
export const FINGERPRINT_PATTERN = /^[0-9a-z]{11}$/u;
export const MAX_STORED_HUNKS = 250_000;

const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type UnknownRecord = Record<string, unknown>;

function error(code: ValidationError['code'], message: string): Result<never, ValidationError> {
  return fail({ code, message });
}

function isObject(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasPrototypeKey(value: object): boolean {
  return Object.getOwnPropertyNames(value).some((key) => PROTOTYPE_KEYS.has(key));
}

function hasOnlyKeys(value: UnknownRecord, allowed: ReadonlySet<string>): boolean {
  if (hasPrototypeKey(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  return Object.getOwnPropertyNames(value).every((key) => allowed.has(key));
}

function isString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && Array.from(value).length <= maximum;
}

function isInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function cloneHunkReview(value: unknown): Result<HunkReview, ValidationError> {
  if (!isObject(value) || !hasOnlyKeys(value, new Set(['decision', 'comment']))) {
    return error('invalid-field', 'A hunk decision has an invalid shape.');
  }
  const decision = value.decision;
  if (decision !== null && decision !== 'approved' && decision !== 'rejected') {
    return error('invalid-field', 'A hunk decision is not recognised.');
  }
  if (!isString(value.comment, LIMITS.maxCommentChars)) {
    return error('invalid-field', 'A hunk comment is too long or not text.');
  }
  return ok({ decision, comment: value.comment });
}

function cloneDecisionMap(
  value: unknown,
): Result<Readonly<Record<string, HunkReview>>, ValidationError> {
  if (!isObject(value) || !hasOnlyKeys(value, new Set(Object.keys(value)))) {
    return error('invalid-field', 'Decisions must be a plain object.');
  }
  const decisions = Object.create(null) as Record<string, HunkReview>;
  const keys = Object.getOwnPropertyNames(value);
  if (keys.length > MAX_STORED_HUNKS) {
    return error('too-large', 'The saved review contains too many decisions.');
  }
  for (const key of keys) {
    if (!DECISION_KEY_PATTERN.test(key)) {
      return error('invalid-field', 'A saved decision key is not a hunk id for this review.');
    }
    const review = cloneHunkReview(value[key]);
    if (!review.ok) {
      return review;
    }
    decisions[key] = review.value;
  }
  return ok(decisions);
}

function cloneStringIds(value: unknown, field: string): Result<readonly string[], ValidationError> {
  if (!Array.isArray(value)) {
    return error('invalid-field', `Saved ${field} are not an array.`);
  }
  if (value.length > MAX_STORED_HUNKS) {
    return error('too-large', `Saved ${field} are too numerous.`);
  }
  if (
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.getOwnPropertyNames(value).some((key) => key !== 'length' && !/^\d+$/u.test(key))
  ) {
    return error('invalid-field', `Saved ${field} have an invalid array shape.`);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !DECISION_KEY_PATTERN.test(item) || seen.has(item)) {
      return error('invalid-field', `Saved ${field} contain an invalid hunk id.`);
    }
    seen.add(item);
    result.push(item);
  }
  return ok(result);
}

function clonePrior(
  value: unknown,
  hunkIds: ReadonlySet<string>,
  round: number,
): Result<StoredReview['prior'], ValidationError> {
  if (value === null) {
    return ok(null);
  }
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, new Set(['round', 'unchangedIds', 'carried', 'goneCount', 'goneRejected']))
  ) {
    return error('invalid-field', 'The saved carry-over record has an invalid shape.');
  }
  if (!isInteger(value.round, 1_000_000_000) || value.round > round) {
    return error('invalid-field', 'The saved carry-over round is invalid.');
  }
  const unchanged = cloneStringIds(value.unchangedIds, 'unchanged hunk ids');
  if (!unchanged.ok) {
    return unchanged;
  }
  for (const id of unchanged.value) {
    if (!hunkIds.has(id)) {
      return error('invalid-field', 'A saved unchanged hunk is not in this review.');
    }
  }
  if (!isObject(value.carried) || hasPrototypeKey(value.carried)) {
    return error('invalid-field', 'Saved carried decisions must be a plain object.');
  }
  const carried = Object.create(null) as Record<string, 'approved' | 'rejected'>;
  const carriedKeys = Object.getOwnPropertyNames(value.carried);
  if (carriedKeys.length > MAX_STORED_HUNKS) {
    return error('too-large', 'The saved carry-over record contains too many decisions.');
  }
  for (const id of carriedKeys) {
    if (!DECISION_KEY_PATTERN.test(id) || !hunkIds.has(id) || !unchanged.value.includes(id)) {
      return error('invalid-field', 'A saved carried decision key is invalid.');
    }
    const decision = value.carried[id];
    if (decision !== 'approved' && decision !== 'rejected') {
      return error('invalid-field', 'A saved carried decision is invalid.');
    }
    carried[id] = decision;
  }
  if (
    !isInteger(value.goneCount, MAX_STORED_HUNKS) ||
    !isInteger(value.goneRejected, MAX_STORED_HUNKS)
  ) {
    return error('invalid-field', 'Saved gone-hunk counts are invalid.');
  }
  if (value.goneRejected > value.goneCount) {
    return error('invalid-field', 'Saved gone-hunk counts are inconsistent.');
  }
  return ok({
    round: value.round,
    unchangedIds: unchanged.value,
    carried,
    goneCount: value.goneCount,
    goneRejected: value.goneRejected,
  });
}

function parseObject(value: unknown): Result<UnknownRecord, ValidationError> {
  if (typeof value !== 'string') {
    if (!isObject(value)) {
      return error('corrupt', 'Saved review data is not an object.');
    }
    return ok(value);
  }
  if (value.length > LIMITS.maxRecordChars) {
    return error('too-large', 'Saved review data is too large to read.');
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isObject(parsed)) {
      return error('corrupt', 'Saved review data is not an object.');
    }
    return ok(parsed);
  } catch {
    return error('corrupt', 'Saved review data could not be read.');
  }
}

function parseReviewRecordUnsafe(input: unknown): Result<StoredReview, ValidationError> {
  const object = parseObject(input);
  if (!object.ok) {
    return object;
  }
  const value = object.value;
  if (
    value.schemaVersion !== undefined &&
    typeof value.schemaVersion === 'number' &&
    value.schemaVersion > 1
  ) {
    return error('future-schema', 'Saved review data was written by a newer version.');
  }
  if (value.hashVersion !== undefined && value.hashVersion !== 1 && value.schemaVersion === 1) {
    return error('hash-version', 'Saved review data uses an unsupported hash version.');
  }
  const allowed = new Set([
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
  if (!hasOnlyKeys(value, allowed)) {
    return error('invalid-field', 'Saved review data contains an unknown key.');
  }
  if (value.schemaVersion !== 1) {
    return error('invalid-field', 'Saved review schema version is invalid.');
  }
  if (value.hashVersion !== 1) {
    return error('hash-version', 'Saved review data uses an unsupported hash version.');
  }
  if (!isString(value.updatedAt, 128)) {
    return error('invalid-field', 'Saved review timestamp is invalid.');
  }
  if (typeof value.fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(value.fingerprint)) {
    return error('invalid-field', 'Saved review fingerprint is invalid.');
  }
  if (!isInteger(value.round, 1_000_000_000) || value.round < 1) {
    return error('invalid-field', 'Saved review round is invalid.');
  }
  if (
    !isString(value.label, LIMITS.maxLabelChars) ||
    !isString(value.overallNote, LIMITS.maxOverallNoteChars)
  ) {
    return error('invalid-field', 'Saved review text exceeds its limit.');
  }
  const ids = cloneStringIds(value.hunkIds, 'hunk ids');
  if (!ids.ok) {
    return ids;
  }
  const idSet = new Set(ids.value);
  const decisions = cloneDecisionMap(value.decisions);
  if (!decisions.ok) {
    return decisions;
  }
  const prior = clonePrior(value.prior, idSet, value.round);
  if (!prior.ok) {
    return prior;
  }
  if (value.carryoverDismissed !== undefined && typeof value.carryoverDismissed !== 'boolean') {
    return error('invalid-field', 'Saved carry-over dismissal is invalid.');
  }
  const result: StoredReview = {
    schemaVersion: 1,
    hashVersion: 1,
    updatedAt: value.updatedAt,
    fingerprint: value.fingerprint,
    round: value.round,
    label: value.label,
    overallNote: value.overallNote,
    decisions: decisions.value,
    hunkIds: ids.value,
    prior: prior.value,
  };
  if (value.carryoverDismissed !== undefined) {
    return ok({ ...result, carryoverDismissed: value.carryoverDismissed });
  }
  return ok(result);
}

export function parseReviewRecord(input: unknown): Result<StoredReview, ValidationError> {
  try {
    return parseReviewRecordUnsafe(input);
  } catch {
    return error('corrupt', 'Saved review data could not be read.');
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
      : error('too-large', 'The review record is too large to save.');
  } catch {
    return error('corrupt', 'The review record could not be serialized.');
  }
}

export const validateReviewRecord = parseReviewRecord;
export const parseStoredReview = parseReviewRecord;
export const validateStoredReview = parseReviewRecord;

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  shortcutsEnabled: true,
  autoAdvance: true,
  rememberDiff: false,
};

function parsePrefsUnsafe(input: unknown): Result<Prefs, ValidationError> {
  const object = parseObject(input);
  if (!object.ok) {
    return object;
  }
  const value = object.value;
  if (!hasOnlyKeys(value, new Set(['theme', 'shortcutsEnabled', 'autoAdvance', 'rememberDiff']))) {
    return error('invalid-field', 'Saved preferences contain an unknown key.');
  }
  if (value.theme !== 'system' && value.theme !== 'light' && value.theme !== 'dark') {
    return error('invalid-field', 'Saved theme is invalid.');
  }
  if (
    typeof value.shortcutsEnabled !== 'boolean' ||
    typeof value.autoAdvance !== 'boolean' ||
    typeof value.rememberDiff !== 'boolean'
  ) {
    return error('invalid-field', 'Saved preferences contain an invalid value.');
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
    return error('corrupt', 'Saved preferences could not be read.');
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
    return error('corrupt', 'Preferences could not be serialized.');
  }
}
