import type { CarryFacts } from '../../app/carryFacts';
import { carryMessages, bannerText } from '../messages/carryover';
import { NewOrChangedIcon } from './Icons';

export type CarryOverBannerProps = {
  readonly facts: CarryFacts;
  readonly onReviewNew: () => void;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
};

/**
 * The summary of the round, in flow above the hunks. It is announced once when the round opens
 * (by the screen's live region), not by being a live region itself, so a reload stays quiet.
 */
export function CarryOverBanner({ facts, onReviewNew, onUndo, onDismiss }: CarryOverBannerProps) {
  return (
    <section className="banner carry-banner" aria-label={`Round ${String(facts.round)} carry-over`}>
      <p>
        <NewOrChangedIcon /> {bannerText(facts)}
      </p>
      <div className="button-row">
        {facts.newOrChanged > 0 ? (
          <button type="button" className="button button-primary" onClick={onReviewNew}>
            {carryMessages.reviewNew}
          </button>
        ) : null}
        <button type="button" className="button button-secondary" onClick={onUndo}>
          {carryMessages.undo}
        </button>
        <button type="button" className="button button-secondary" onClick={onDismiss}>
          {carryMessages.dismiss}
        </button>
      </div>
    </section>
  );
}
