import type { RefObject } from 'react';
import { CarryOverBanner } from './components/CarryOverBanner';
import { ParseReport, type ParseReportProps } from './components/ParseReport';
import { RuleNotices } from './components/RuleNotices';
import { CrashBoundary } from './CrashBoundary';
import { StorageNotices } from './components/StorageNotices';
import { LiveRegion, type Announcement } from './announce';
import type { CarryBannerModel } from './carryOverActions';
import type { RuleNoticeGroup } from './ruleNotices';
import type { Entry } from './reviewModel';
import { ReviewHunks, type HunkHandlers, type HunkListState } from './ReviewHunks';
import { ReviewNotices } from './ReviewNotices';
import type { StorageSnapshot } from './storageSnapshot';

type ReviewMainProps = {
  readonly mainRef: RefObject<HTMLElement | null>;
  /** A file is being read: main is busy and the shortcuts are off. */
  readonly loading: boolean;
  readonly announcement: Announcement;
  readonly storage: StorageSnapshot;
  readonly storageNotes: readonly string[];
  readonly banner: CarryBannerModel | null;
  /** What parsing reported, and the risk rules that could not run. */
  readonly report: ParseReportProps;
  readonly ruleGroups: readonly RuleNoticeGroup[];
  readonly notices: {
    readonly total: number;
    readonly pending: number;
    readonly matching: number;
    readonly onExport: () => void;
    readonly onClearFilters: () => void;
  };
  readonly entries: readonly Entry[];
  readonly totalHunks: number;
  readonly list: HunkListState;
  readonly handlers: HunkHandlers;
  /** Wipes saved data and leaves the review; throws when the wipe failed. */
  readonly onClearData: () => void;
};

/** The crash screen needs to know whether the wipe worked; the settings dialog hears it by throw. */
function clearWithoutThrowing(clear: () => void): boolean {
  try {
    clear();
    return true;
  } catch {
    return false;
  }
}

/** The main landmark: the live region, in-flow notices and banner, then the hunk cards. */
export function ReviewMain({
  mainRef,
  loading,
  announcement,
  storage,
  storageNotes,
  banner,
  report,
  ruleGroups,
  notices,
  entries,
  totalHunks,
  list,
  handlers,
  onClearData,
}: ReviewMainProps) {
  return (
    <main
      id="main"
      className="review-main"
      ref={mainRef}
      tabIndex={-1}
      aria-busy={loading || undefined}
    >
      <LiveRegion announcement={announcement} />
      <StorageNotices snapshot={storage} notes={storageNotes} />
      {banner === null ? null : <CarryOverBanner {...banner} />}
      <ParseReport {...report} />
      <RuleNotices groups={ruleGroups} />
      <ReviewNotices {...notices} />
      <CrashBoundary scope="review" onClearData={() => clearWithoutThrowing(onClearData)}>
        <ReviewHunks entries={entries} totalHunks={totalHunks} list={list} handlers={handlers} />
      </CrashBoundary>
    </main>
  );
}
