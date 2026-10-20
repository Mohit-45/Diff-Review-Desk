import type { DiffFile, ParseWarning, ReviewState } from '../core/types';

/** A review on screen: the parsed diff, where its decisions start, and the text it came from. */
export type LoadedReview = {
  readonly files: readonly DiffFile[];
  readonly state: ReviewState;
  readonly diffText: string;
  /** What the parser and the decoder reported about this diff, for the banner and the exports. */
  readonly warnings: readonly ParseWarning[];
  /** True when this came back from storage on reload, so nothing needs saving or focusing yet. */
  readonly restoredOnReload: boolean;
  /** True once the round banner was dismissed; the badges stay. */
  readonly carryoverDismissed: boolean;
};
