import { LIMITS } from '../core/limits';
import { ok } from '../core/result';
import type { HunkReview, Result, ValidationError } from '../core/types';
import {
  DECISION_KEY_PATTERN,
  MAX_STORED_HUNKS,
  hasOnlyKeys,
  isObject,
  isString,
  reject,
} from './recordGuards';

const HUNK_REVIEW_KEYS: ReadonlySet<string> = new Set(['decision', 'comment']);

function cloneHunkReview(value: unknown): Result<HunkReview, ValidationError> {
  if (!isObject(value) || !hasOnlyKeys(value, HUNK_REVIEW_KEYS)) {
    return reject('invalid-field', 'A hunk decision has an invalid shape.');
  }
  const decision = value.decision;
  if (decision !== null && decision !== 'approved' && decision !== 'rejected') {
    return reject('invalid-field', 'A hunk decision is not recognised.');
  }
  if (!isString(value.comment, LIMITS.maxCommentChars)) {
    return reject('invalid-field', 'A hunk comment is too long or not text.');
  }
  return ok({ decision, comment: value.comment });
}

export function cloneDecisionMap(
  value: unknown,
): Result<Readonly<Record<string, HunkReview>>, ValidationError> {
  if (!isObject(value) || !hasOnlyKeys(value, new Set(Object.keys(value)))) {
    return reject('invalid-field', 'Decisions must be a plain object.');
  }
  const decisions = Object.create(null) as Record<string, HunkReview>;
  const keys = Object.getOwnPropertyNames(value);
  if (keys.length > MAX_STORED_HUNKS) {
    return reject('too-large', 'The saved review contains too many decisions.');
  }
  for (const key of keys) {
    if (!DECISION_KEY_PATTERN.test(key)) {
      return reject('invalid-field', 'A saved decision key is not a hunk id for this review.');
    }
    const review = cloneHunkReview(value[key]);
    if (!review.ok) {
      return review;
    }
    decisions[key] = review.value;
  }
  return ok(decisions);
}

export function cloneStringIds(
  value: unknown,
  field: string,
): Result<readonly string[], ValidationError> {
  if (!Array.isArray(value)) {
    return reject('invalid-field', `Saved ${field} are not an array.`);
  }
  const items: readonly unknown[] = value;
  if (items.length > MAX_STORED_HUNKS) {
    return reject('too-large', `Saved ${field} are too numerous.`);
  }
  if (
    Object.getOwnPropertySymbols(items).length > 0 ||
    Object.getOwnPropertyNames(items).some((key) => key !== 'length' && !/^\d+$/u.test(key))
  ) {
    return reject('invalid-field', `Saved ${field} have an invalid array shape.`);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== 'string' || !DECISION_KEY_PATTERN.test(item) || seen.has(item)) {
      return reject('invalid-field', `Saved ${field} contain an invalid hunk id.`);
    }
    seen.add(item);
    result.push(item);
  }
  return ok(result);
}
