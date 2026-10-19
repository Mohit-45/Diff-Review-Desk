import type { Result } from './types';

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
