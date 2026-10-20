import type { DiffFile, Flag, ParseError, ReviewState } from '../core/types';
import type { PendingChoice, PendingLoad } from '../app/loadPlan';
import type { BuiltInSample } from '../samples';
import type { ReviewStorageAdapter } from '../storage/adapter';
import type { LoadFileCallback } from './components/LoadDialog';
import type { Clock } from './clock';
import type { StorageSnapshot } from './storageSnapshot';

export type IntakeHandlers = {
  readonly onLoadText: (text: string) => void;
  readonly onLoadFile: LoadFileCallback;
  readonly onLoadSample: (sample: BuiltInSample) => void;
};

/** What the Load dialog inside the review needs on top of the handlers. */
export type IntakeState = IntakeHandlers & {
  readonly error: ParseError | null;
  readonly loading: boolean;
  /** A parsed diff that waits for the user's answer: carry the decisions over, or start fresh. */
  readonly pending: PendingLoad | null;
  readonly onResolvePending: (choice: PendingChoice) => void;
  readonly onCancelPending: () => void;
  readonly onError: (error: ParseError | null) => void;
  /** Set while the error on show is a file that could not be read: reads that same file again. */
  readonly onRetry: (() => void) | null;
};

export type ReviewData = {
  readonly files: readonly DiffFile[];
  readonly state: ReviewState;
  readonly flags: readonly Flag[];
};

/** What the review screen needs to save itself and to report on saving. */
export type ReviewSession = {
  readonly adapter: ReviewStorageAdapter;
  /** Where the time of a save and of an export comes from; tests inject a fixed one. */
  readonly clock: Clock;
  /** The decoded text this review came from; it is what a reload parses again. */
  readonly diffText: string;
  /** True when the review came back from storage on reload: nothing to save and no focus to move. */
  readonly restoredOnReload: boolean;
  /** Whether the round banner was already dismissed when this review opened. */
  readonly carryoverDismissed: boolean;
  /** Reports the review as the reducer holds it, so a load can compare against it. */
  readonly onLiveState: (state: ReviewState | null) => void;
  readonly storage: StorageSnapshot;
  /** Called after every write, so the screens re-read the adapter's notices and mode. */
  readonly onStorageChange: () => void;
  /** Wipes every saved item of this app and leaves the review. Throws when the wipe failed. */
  readonly onClearData: () => void;
};
