import { LIMITS } from '../core/limits';
import { fail, ok } from '../core/result';
import type { Result, ValidationError } from '../core/types';

export const DECISION_KEY_PATTERN = /^f[0-9a-z]{11}(~[0-9]+)?:[0-9a-z]{11}(#[0-9]+)?$/u;
export const FINGERPRINT_PATTERN = /^[0-9a-z]{11}$/u;
export const MAX_STORED_HUNKS = 250_000;
export const MAX_ROUND = 1_000_000_000;

const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type UnknownRecord = Record<string, unknown>;

export function reject(
  code: ValidationError['code'],
  message: string,
): Result<never, ValidationError> {
  return fail({ code, message });
}

export function isObject(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function hasPrototypeKey(value: object): boolean {
  return Object.getOwnPropertyNames(value).some((key) => PROTOTYPE_KEYS.has(key));
}

export function hasOnlyKeys(value: UnknownRecord, allowed: ReadonlySet<string>): boolean {
  if (hasPrototypeKey(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  return Object.getOwnPropertyNames(value).every((key) => allowed.has(key));
}

export function isString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && Array.from(value).length <= maximum;
}

export function isInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

/** Accepts a plain object, or text that parses to one, and caps the text before parsing it. */
export function parseObject(value: unknown): Result<UnknownRecord, ValidationError> {
  if (typeof value !== 'string') {
    if (!isObject(value)) {
      return reject('corrupt', 'Saved review data is not an object.');
    }
    return ok(value);
  }
  if (value.length > LIMITS.maxRecordChars) {
    return reject('too-large', 'Saved review data is too large to read.');
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isObject(parsed)) {
      return reject('corrupt', 'Saved review data is not an object.');
    }
    return ok(parsed);
  } catch {
    return reject('corrupt', 'Saved review data could not be read.');
  }
}
