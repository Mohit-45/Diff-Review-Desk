import { useState } from 'react';
import { createLoadGeneration, latestOnly, type StaleLoadError } from '../app/generation';
import { openFile } from '../app/openFile';
import { openWithStored } from '../app/openStored';
import type { ParseError, Result, ReviewState } from '../core/types';
import type { ReviewStorageAdapter } from '../storage/adapter';
import { isReadFailure } from './components/intakeValidation';
import type { FrameScheduler } from './frame';
import { finishLoad, type LoadResult } from './finishLoad';
import { appMessages } from './messages/app';
import type { LoadedReview } from './loadedReview';
import type { IntakeState } from './reviewTypes';
import { useLoadCommit } from './useLoadCommit';

type LoaderDeps = {
  readonly adapter: ReviewStorageAdapter;
  /** The review as it is right now, decisions included; null on the landing screen. */
  readonly getCurrent: () => ReviewState | null;
  readonly say: (text: string) => void;
  readonly open: (loaded: LoadedReview) => void;
  /** Gives the page one painted frame before a parse that blocks it. */
  readonly frame: FrameScheduler;
};

type Latest = LoadResult | Result<never, StaleLoadError>;

function isStale(result: Latest): result is Result<never, StaleLoadError> {
  return !result.ok && result.error.code === 'stale-load';
}

/** A file whose bytes could not be read, kept so Retry can read the same file again. */
type FailedRead = { readonly file: File; readonly error: ParseError };

function failedReadOf(file: File, result: LoadResult): FailedRead | null {
  if (result.ok || !('title' in result.error) || !isReadFailure(result.error)) {
    return null;
  }
  return { file, error: result.error };
}

type IntakeParts = Pick<IntakeState, 'error' | 'loading' | 'pending' | 'onRetry'> & {
  readonly loadNow: (text: string, label?: string) => void;
  readonly loadFile: (file: File) => Promise<void>;
  readonly resolve: IntakeState['onResolvePending'];
  readonly cancel: () => void;
  readonly setError: IntakeState['onError'];
};

function intakeState(parts: IntakeParts): IntakeState {
  return {
    error: parts.error,
    loading: parts.loading,
    pending: parts.pending,
    onRetry: parts.onRetry,
    onLoadText: (text) => {
      parts.loadNow(text);
    },
    onLoadFile: (file) => {
      void parts.loadFile(file);
    },
    onLoadSample: (sample) => {
      parts.loadNow(sample.text, sample.title);
    },
    onResolvePending: parts.resolve,
    onCancelPending: parts.cancel,
    onError: parts.setError,
  };
}

/**
 * Every way into a review goes through here. The generation counter lets a slow file read finish
 * after a newer load without replacing it, and a load that would leave work behind waits as
 * `pending` for the user's answer.
 */
export function useDiffLoader({ adapter, getCurrent, say, open, frame }: LoaderDeps) {
  const [generation] = useState(createLoadGeneration);
  const [loading, setLoading] = useState(false);
  const [failedRead, setFailedRead] = useState<FailedRead | null>(null);
  const { error, setError, pending, setPending, commit, resolve } = useLoadCommit({ say, open });

  function finish(result: LoadResult): void {
    finishLoad(result, { adapter, getCurrent, say, commit, setError, setPending });
  }

  /** The parse blocks the page, so the busy state is painted first and a newer load cancels it. */
  function loadNow(text: string, label?: string): void {
    const token = generation.begin();
    setLoading(true);
    setPending(null);
    say(appMessages.reading);
    frame(() => {
      if (!generation.isCurrent(token)) {
        return;
      }
      setLoading(false);
      const named = label === undefined ? {} : { label };
      finish(openWithStored(text, { adapter, current: getCurrent(), ...named }));
    });
  }

  async function loadFile(file: File): Promise<void> {
    setLoading(true);
    setPending(null);
    say(appMessages.reading);
    const current = getCurrent();
    const result = await latestOnly(generation, () => openFile(file, { adapter, current }));
    if (isStale(result)) {
      return;
    }
    setLoading(false);
    setFailedRead(failedReadOf(file, result));
    finish(result);
  }

  /** Drops any file read still in flight, for when the screen is reset under it. */
  function cancelLoads(): void {
    generation.begin();
    setLoading(false);
    setPending(null);
  }

  const intake = intakeState({
    error,
    loading,
    pending,
    onRetry:
      failedRead !== null && failedRead.error === error
        ? () => {
            void loadFile(failedRead.file);
          }
        : null,
    loadNow,
    loadFile,
    resolve,
    cancel: () => {
      setPending(null);
    },
    setError,
  });
  return { intake, setError, cancelLoads };
}
