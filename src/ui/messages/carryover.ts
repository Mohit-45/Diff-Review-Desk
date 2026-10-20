import type { CarryBadge, CarryFacts } from '../../app/carryFacts';

/** Copy for the re-review loop. Numbers only, never diff text. */

export const carryMessages = {
  continueLabel: (round: number) => `Continue as round ${String(round)}`,
  startNew: 'Start new review',
  restore: 'Restore saved review',
  keepCurrent: 'Keep current review',
  back: 'Back',
  reviewNew: 'Review new and changed',
  undo: 'Undo carry-over',
  dismiss: 'Dismiss',
  unchanged: 'Unchanged',
  newOrChanged: 'New or changed',
  stepHeading: 'Another round of this review?',
  newHeading: 'Start a new review?',
  choiceLegend: 'What should happen to your decisions?',
  restoreHeading: 'Restore a saved review?',
  dismissed: 'Carry-over summary dismissed.',
  undone: 'Carry-over undone. Back to round 1 with every hunk pending.',
} as const;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function hunks(count: number): string {
  return `${String(count)} ${plural(count, 'hunk', 'hunks')}`;
}

function carriedSentence(facts: CarryFacts): string | null {
  const count = facts.approved + facts.rejected;
  if (count === 0) {
    return null;
  }
  const parts = [
    facts.approved > 0 ? `${String(facts.approved)} approved` : null,
    facts.rejected > 0 ? `${String(facts.rejected)} rejected` : null,
  ].filter((part) => part !== null);
  const noun = plural(count, 'decision', 'decisions');
  return `${String(count)} ${noun} carried over (${parts.join(', ')}).`;
}

function newSentence(facts: CarryFacts): string | null {
  if (facts.newOrChanged === 0) {
    return null;
  }
  const verb = plural(facts.newOrChanged, 'is', 'are');
  return `${hunks(facts.newOrChanged)} ${verb} new or changed.`;
}

function goneSentence(facts: CarryFacts): string | null {
  if (facts.gone === 0) {
    return null;
  }
  const verb = plural(facts.gone, 'appears', 'appear');
  const base = `${hunks(facts.gone)} from round ${String(facts.priorRound)} no longer ${verb}`;
  if (facts.goneRejected === 0) {
    return `${base}.`;
  }
  const were = plural(facts.goneRejected, 'was', 'were');
  return `${base} (${String(facts.goneRejected)} ${were} rejected, likely addressed).`;
}

function stillRejectedSentence(facts: CarryFacts): string | null {
  if (facts.rejected === 0) {
    return null;
  }
  const verb = plural(facts.rejected, 'is', 'are');
  return `${hunks(facts.rejected)} you rejected ${verb} unchanged.`;
}

/** The banner's sentences in reading order; clauses that would say zero are left out. */
export function bannerSentences(facts: CarryFacts): readonly string[] {
  return [
    `Round ${String(facts.round)}.`,
    carriedSentence(facts),
    newSentence(facts),
    goneSentence(facts),
    stillRejectedSentence(facts),
  ].filter((sentence) => sentence !== null);
}

export function bannerText(facts: CarryFacts): string {
  return bannerSentences(facts).join(' ');
}

/** The live region keeps 120 characters, so it reads the leading whole sentences that fit. */
export function bannerAnnouncement(facts: CarryFacts, limit = 120): string {
  let spoken = '';
  for (const sentence of bannerSentences(facts)) {
    const next = spoken === '' ? sentence : `${spoken} ${sentence}`;
    if (next.length > limit) {
      break;
    }
    spoken = next;
  }
  return spoken;
}

/** Step 2 of the Load dialog, from the summary of the carry-over that is on offer. */
export function stepSummary(facts: CarryFacts): string {
  const unchanged = `${String(facts.unchanged)} of ${String(facts.total)} hunks ${plural(facts.unchanged, 'is', 'are')} unchanged`;
  const carried = `${String(facts.approved)} approved and ${String(facts.rejected)} rejected carry over`;
  const fresh = `${String(facts.newOrChanged)} ${plural(facts.newOrChanged, 'is', 'are')} new or changed`;
  const gone = `${String(facts.gone)} no longer present (${String(facts.goneRejected)} ${plural(facts.goneRejected, 'was', 'were')} rejected)`;
  return `${unchanged}: ${carried}. ${fresh}, ${gone}.`;
}

export function continueDetail(carried: number, round: number): string {
  const noun = plural(carried, 'decision', 'decisions');
  return `Keeps ${String(carried)} ${noun}, comments and the label from round ${String(round)}. New or changed hunks start pending.`;
}

export function startNewDetail(discarded: number, round: number): string {
  if (discarded === 0) {
    return 'Starts at round 1 with every hunk pending.';
  }
  const noun = plural(discarded, 'decision', 'decisions');
  return `Starts at round 1 with every hunk pending and discards ${String(discarded)} ${noun} from round ${String(round)}. They stay saved with the old diff.`;
}

export function restoreSummary(saved: number, round: number, open: number): string {
  const decisions = `${String(saved)} ${plural(saved, 'decision', 'decisions')}`;
  const openNoun = plural(open, 'decision', 'decisions');
  return `This diff was reviewed before: ${decisions} in round ${String(round)}. Restoring it replaces the review you have open, which has ${String(open)} ${openNoun}. Those stay saved in this browser.`;
}

export function newReviewAnnouncement(facts: CarryFacts): string {
  return `Showing ${hunks(facts.newOrChanged)} that ${plural(facts.newOrChanged, 'is', 'are')} new or changed.`;
}

export function badgeDetail(badge: Extract<CarryBadge, { kind: 'unchanged' }>): string {
  switch (badge.carried) {
    case 'approved':
      return `Approved in round ${String(badge.round)}`;
    case 'rejected':
      return 'Unchanged since you rejected it';
    case 'pending':
      return 'Unchanged, still pending';
  }
}
