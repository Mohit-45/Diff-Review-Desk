import { selectReviewed } from '../core/review/selectors';
import type { Prefs } from '../core/types';
import { readDismissed } from '../app/loadPlan';
import { resumeOpenReview } from '../app/resume';
import { BUILT_IN_SAMPLES } from '../samples';
import type { ReviewStorageAdapter } from '../storage/adapter';
import { DEFAULT_PREFS } from '../storage/validator';
import { restoredReview } from './messages/app';
import type { LoadedReview } from './loadedReview';
import { readSnapshot, type StorageSnapshot } from './storageSnapshot';

export type Boot = {
  readonly prefs: Prefs;
  readonly loaded: LoadedReview | null;
  /** One line for the live region or the landing status: the restore result, or nothing. */
  readonly status: string;
  readonly snapshot: StorageSnapshot;
};

/**
 * Everything a first render needs from storage, read once and synchronously so a reload paints
 * the restored review at once without ever moving focus.
 */
export function bootApp(adapter: ReviewStorageAdapter): Boot {
  const read = adapter.getPrefs();
  const prefs = read.ok ? read.value : DEFAULT_PREFS;
  const resumed = resumeOpenReview(
    adapter,
    BUILT_IN_SAMPLES.map((sample) => sample.text),
  );
  const snapshot = readSnapshot(adapter);
  if (resumed.kind === 'review') {
    const decided = selectReviewed(resumed.files, resumed.state);
    return {
      prefs,
      loaded: {
        ...resumed,
        restoredOnReload: true,
        carryoverDismissed: readDismissed(adapter, resumed.state.fingerprint),
      },
      status: restoredReview(decided, resumed.state.hunkIds.length),
      snapshot,
    };
  }
  return {
    prefs,
    loaded: null,
    status: resumed.kind === 'decisions-only' ? resumed.notice : '',
    snapshot,
  };
}
