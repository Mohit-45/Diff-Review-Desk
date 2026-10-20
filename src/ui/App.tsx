import { useCallback, useEffect, useRef, useState } from 'react';
import { clearAll } from '../app/clear';
import { forgetAllDiffs } from '../app/persist';
import { createStorageAdapter, type ReviewStorageAdapter } from '../storage/adapter';
import { DEFAULT_PREFS } from '../storage/validator';
import type { Prefs, ReviewState } from '../core/types';
import type { Announcement } from './announce';
import { bootApp } from './appBoot';
import { systemClock, type Clock } from './clock';
import { paintedFrame, type FrameScheduler } from './frame';
import type { LoadedReview } from './loadedReview';
import { appMessages } from './messages/app';
import { ReviewScreen } from './ReviewScreen';
import { Landing } from './screens/Landing';
import { setDiagnostics } from './reportUnexpected';
import { readSnapshot, sameSnapshot } from './storageSnapshot';
import { applyTheme } from './theme';
import { useDiffLoader } from './useDiffLoader';

export type AppProps = {
  /** Where progress is saved. Tests inject one; the app otherwise uses the browser's storage. */
  readonly storage?: ReviewStorageAdapter;
  /** The time source for saves and exports. Tests inject a fixed one. */
  readonly clock?: Clock;
  /** Gives the page a painted frame before a parse. Tests inject one they control. */
  readonly frame?: FrameScheduler;
};

function sizesOf(loaded: LoadedReview | null): { files: number; hunks: number } {
  return { files: loaded?.files.length ?? 0, hunks: loaded?.state.hunkIds.length ?? 0 };
}

export function App({ storage, clock = systemClock, frame = paintedFrame }: AppProps) {
  const [adapter] = useState(() => storage ?? createStorageAdapter());
  const [boot] = useState(() => bootApp(adapter));
  const [loaded, setLoaded] = useState<LoadedReview | null>(boot.loaded);
  const [status, setStatus] = useState<Announcement>({ id: 1, text: boot.status });
  const [prefs, setPrefs] = useState<Prefs>(boot.prefs);
  const [snapshot, setSnapshot] = useState(boot.snapshot);
  const [returnedHome, setReturnedHome] = useState(false);
  // The review as the reducer holds it now; the loaded one only says where the screen started.
  const liveState = useRef<ReviewState | null>(null);
  const onLiveState = useCallback((state: ReviewState | null) => {
    liveState.current = state;
  }, []);

  useEffect(() => {
    applyTheme(prefs.theme);
  }, [prefs.theme]);

  // What an unexpected-error report may say about the app: counts and a mode, nothing else. The
  // counts sit in a ref set by the load itself, because a render error is reported before an
  // effect of this component would run.
  const sizes = useRef(sizesOf(boot.loaded));
  useEffect(() => {
    setDiagnostics(() => ({ storageMode: adapter.mode, ...sizes.current }));
    return () => {
      setDiagnostics(null);
    };
  }, [adapter]);

  // A new object each time, so a repeated message is announced again.
  function say(text: string): void {
    setStatus((previous) => ({ id: previous.id + 1, text }));
  }

  function refreshStorage(): void {
    setSnapshot((previous) => {
      const next = readSnapshot(adapter);
      return sameSnapshot(previous, next) ? previous : next;
    });
  }

  const { intake, setError, cancelLoads } = useDiffLoader({
    adapter,
    getCurrent: () => liveState.current ?? loaded?.state ?? null,
    say,
    frame,
    open: (next) => {
      // Only the open review's text may rest in this tab's session storage.
      adapter.removeAllDiffs();
      adapter.setOpenFingerprint(next.state.fingerprint);
      setReturnedHome(false);
      sizes.current = sizesOf(next);
      setLoaded(next);
      refreshStorage();
    },
  });

  function changePrefs(next: Prefs): void {
    adapter.setPrefs(next);
    if (next.theme !== prefs.theme) {
      adapter.setTheme(next.theme);
    }
    if (prefs.rememberDiff && !next.rememberDiff) {
      forgetAllDiffs(adapter);
    }
    setPrefs(next);
    refreshStorage();
  }

  function clearData(): void {
    const cleared = clearAll(adapter);
    if (!cleared.ok) {
      say(appMessages.clearFailed);
      throw new Error(cleared.error.message);
    }
    cancelLoads();
    sizes.current = sizesOf(null);
    setLoaded(null);
    setError(null);
    setPrefs(DEFAULT_PREFS);
    setReturnedHome(true);
    refreshStorage();
    say(appMessages.cleared);
  }

  if (loaded === null) {
    return (
      <Landing
        error={intake.error}
        status={status.text}
        loading={intake.loading}
        onLoadText={intake.onLoadText}
        onLoadFile={intake.onLoadFile}
        onLoadSample={intake.onLoadSample}
        onError={setError}
        onRetry={intake.onRetry}
        storage={snapshot}
        focusMain={returnedHome}
        pending={intake.pending}
        onResolvePending={intake.onResolvePending}
        onCancelPending={intake.onCancelPending}
      />
    );
  }

  return (
    <ReviewScreen
      key={loaded.state.fingerprint}
      files={loaded.files}
      warnings={loaded.warnings}
      initialState={loaded.state}
      intake={intake}
      status={status}
      prefs={prefs}
      onPrefsChange={changePrefs}
      session={{
        adapter,
        clock,
        diffText: loaded.diffText,
        restoredOnReload: loaded.restoredOnReload,
        carryoverDismissed: loaded.carryoverDismissed,
        onLiveState,
        storage: snapshot,
        onStorageChange: refreshStorage,
        onClearData: clearData,
      }}
    />
  );
}
