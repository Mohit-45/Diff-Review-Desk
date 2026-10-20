import type { CarryBadge } from '../../app/carryFacts';
import { badgeDetail, carryMessages } from '../messages/carryover';
import { NewOrChangedIcon, UnchangedIcon } from './Icons';

/** Icon plus words, never colour alone: where a hunk stands against the previous round. */
export function CarryBadges({ badge }: { readonly badge: CarryBadge | null | undefined }) {
  if (badge === null || badge === undefined) {
    return null;
  }
  if (badge.kind === 'new-or-changed') {
    return (
      <p className="carry-badges">
        <span className="badge badge-new">
          <NewOrChangedIcon />
          <span>{carryMessages.newOrChanged}</span>
        </span>
      </p>
    );
  }
  return (
    <p className="carry-badges">
      <span className="badge badge-unchanged">
        <UnchangedIcon />
        <span>{carryMessages.unchanged}</span>
      </span>
      <span className="badge-detail">{badgeDetail(badge)}</span>
    </p>
  );
}
