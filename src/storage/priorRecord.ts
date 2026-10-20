import { ok } from '../core/result';
import type { Result, StoredReview, ValidationError } from '../core/types';
import { cloneStringIds } from './decisionRecords';
import {
  DECISION_KEY_PATTERN,
  MAX_ROUND,
  MAX_STORED_HUNKS,
  hasOnlyKeys,
  hasPrototypeKey,
  isInteger,
  isObject,
  reject,
  type UnknownRecord,
} from './recordGuards';

type Prior = NonNullable<StoredReview['prior']>;
type GoneCounts = Pick<Prior, 'goneCount' | 'goneRejected'>;

const PRIOR_KEYS: ReadonlySet<string> = new Set([
  'round',
  'unchangedIds',
  'carried',
  'goneCount',
  'goneRejected',
]);

function cloneCarried(
  value: unknown,
  hunkIds: ReadonlySet<string>,
  unchanged: ReadonlySet<string>,
): Result<Prior['carried'], ValidationError> {
  if (!isObject(value) || hasPrototypeKey(value)) {
    return reject('invalid-field', 'Saved carried decisions must be a plain object.');
  }
  const keys = Object.getOwnPropertyNames(value);
  if (keys.length > MAX_STORED_HUNKS) {
    return reject('too-large', 'The saved carry-over record contains too many decisions.');
  }
  const carried = Object.create(null) as Record<string, 'approved' | 'rejected'>;
  for (const id of keys) {
    if (!DECISION_KEY_PATTERN.test(id) || !hunkIds.has(id) || !unchanged.has(id)) {
      return reject('invalid-field', 'A saved carried decision key is invalid.');
    }
    const decision = value[id];
    if (decision !== 'approved' && decision !== 'rejected') {
      return reject('invalid-field', 'A saved carried decision is invalid.');
    }
    carried[id] = decision;
  }
  return ok(carried);
}

function readGoneCounts(value: UnknownRecord): Result<GoneCounts, ValidationError> {
  if (
    !isInteger(value.goneCount, MAX_STORED_HUNKS) ||
    !isInteger(value.goneRejected, MAX_STORED_HUNKS)
  ) {
    return reject('invalid-field', 'Saved gone-hunk counts are invalid.');
  }
  if (value.goneRejected > value.goneCount) {
    return reject('invalid-field', 'Saved gone-hunk counts are inconsistent.');
  }
  return ok({ goneCount: value.goneCount, goneRejected: value.goneRejected });
}

/** Validates the carry-over record against the hunk ids and round of the review that holds it. */
export function clonePrior(
  value: unknown,
  hunkIds: ReadonlySet<string>,
  round: number,
): Result<StoredReview['prior'], ValidationError> {
  if (value === null) {
    return ok(null);
  }
  if (!isObject(value) || !hasOnlyKeys(value, PRIOR_KEYS)) {
    return reject('invalid-field', 'The saved carry-over record has an invalid shape.');
  }
  if (!isInteger(value.round, MAX_ROUND) || value.round > round) {
    return reject('invalid-field', 'The saved carry-over round is invalid.');
  }
  const unchanged = cloneStringIds(value.unchangedIds, 'unchanged hunk ids');
  if (!unchanged.ok) {
    return unchanged;
  }
  if (!unchanged.value.every((id) => hunkIds.has(id))) {
    return reject('invalid-field', 'A saved unchanged hunk is not in this review.');
  }
  const carried = cloneCarried(value.carried, hunkIds, new Set(unchanged.value));
  if (!carried.ok) {
    return carried;
  }
  const counts = readGoneCounts(value);
  if (!counts.ok) {
    return counts;
  }
  return ok({
    round: value.round,
    unchangedIds: unchanged.value,
    carried: carried.value,
    goneCount: counts.value.goneCount,
    goneRejected: counts.value.goneRejected,
  });
}
