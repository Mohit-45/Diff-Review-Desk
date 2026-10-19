import type { Result } from '../core/types';

export type StaleLoadError = {
  readonly code: 'stale-load';
  readonly message: 'A newer load superseded this result.';
};

export type LoadFailureError = {
  readonly code: 'load-failed';
  readonly message: 'The load could not be completed.';
};

export type LoadGeneration = {
  readonly begin: () => number;
  readonly isCurrent: (generation: number) => boolean;
  readonly finish: <T, E>(
    generation: number,
    result: Result<T, E>,
  ) => Result<T, E> | Result<never, StaleLoadError>;
  readonly current: () => number;
};

export function createLoadGeneration(): LoadGeneration {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isCurrent(generation) {
      return generation === latest;
    },
    finish<T, E>(generation: number, result: Result<T, E>) {
      return generation === latest
        ? result
        : {
            ok: false,
            error: { code: 'stale-load', message: 'A newer load superseded this result.' },
          };
    },
    current() {
      return latest;
    },
  };
}

export async function latestOnly<T, E>(
  generation: LoadGeneration,
  work: (token: number) => Promise<Result<T, E>>,
): Promise<Result<T, E | LoadFailureError> | Result<never, StaleLoadError>> {
  const token = generation.begin();
  let result: Result<T, E>;
  try {
    result = await work(token);
  } catch {
    return generation.finish(token, {
      ok: false,
      error: { code: 'load-failed', message: 'The load could not be completed.' },
    });
  }
  return generation.finish(token, result);
}
