import { allDecided, reviewMessages } from './messages/review-screen';

type ReviewNoticesProps = {
  readonly total: number;
  readonly pending: number;
  readonly matching: number;
  readonly onExport: () => void;
  readonly onClearFilters: () => void;
};

/** In-flow panels: the filters hide every hunk, or nothing is left to decide. */
export function ReviewNotices({
  total,
  pending,
  matching,
  onExport,
  onClearFilters,
}: ReviewNoticesProps) {
  return (
    <>
      {matching === 0 ? (
        <section className="review-notice" aria-label="No matching hunks">
          <p>{reviewMessages.noMatches}</p>
          <button type="button" onClick={onClearFilters}>
            {reviewMessages.clearFilters}
          </button>
        </section>
      ) : null}
      {pending === 0 && total > 0 ? (
        <section className="review-notice" aria-label="Review complete">
          <p>{allDecided(total)}</p>
          <button type="button" onClick={onExport}>
            {reviewMessages.exportReview}
          </button>
        </section>
      ) : null}
    </>
  );
}
