import { describe, expect, it } from 'vitest';
import type { CarryFacts } from '../../app/carryFacts';
import {
  badgeDetail,
  bannerAnnouncement,
  bannerText,
  continueDetail,
  newReviewAnnouncement,
  restoreSummary,
  startNewDetail,
  stepSummary,
} from './carryover';

const PINNED: CarryFacts = {
  round: 2,
  priorRound: 1,
  unchanged: 6,
  total: 9,
  approved: 5,
  rejected: 1,
  newOrChanged: 3,
  gone: 5,
  goneRejected: 4,
};

describe('bannerText', () => {
  it('CARRY-BANNER says the pinned sentence word for word', () => {
    expect(bannerText(PINNED)).toBe(
      'Round 2. 6 decisions carried over (5 approved, 1 rejected). 3 hunks are new or changed. 5 hunks from round 1 no longer appear (4 were rejected, likely addressed). 1 hunk you rejected is unchanged.',
    );
  });

  it('CARRY-BANNER uses singular forms for a count of one', () => {
    const one: CarryFacts = {
      ...PINNED,
      approved: 1,
      rejected: 1,
      newOrChanged: 1,
      gone: 1,
      goneRejected: 1,
    };
    expect(bannerText(one)).toBe(
      'Round 2. 2 decisions carried over (1 approved, 1 rejected). 1 hunk is new or changed. 1 hunk from round 1 no longer appears (1 was rejected, likely addressed). 1 hunk you rejected is unchanged.',
    );
  });

  it('CARRY-BANNER leaves out every clause that would say zero', () => {
    const quiet: CarryFacts = {
      ...PINNED,
      round: 3,
      priorRound: 2,
      approved: 4,
      rejected: 0,
      newOrChanged: 0,
      gone: 2,
      goneRejected: 0,
    };
    expect(bannerText(quiet)).toBe(
      'Round 3. 4 decisions carried over (4 approved). 2 hunks from round 2 no longer appear.',
    );
    expect(bannerText({ ...quiet, approved: 0, gone: 0 })).toBe('Round 3.');
  });
});

describe('bannerAnnouncement', () => {
  it('CARRY-ANNOUNCE reads only whole sentences and stays within 120 characters', () => {
    const spoken = bannerAnnouncement(PINNED);
    expect(spoken).toBe(
      'Round 2. 6 decisions carried over (5 approved, 1 rejected). 3 hunks are new or changed.',
    );
    expect(spoken.length).toBeLessThanOrEqual(120);
    expect(bannerText(PINNED).startsWith(spoken)).toBe(true);
  });

  it('CARRY-ANNOUNCE reads everything when it fits', () => {
    const small: CarryFacts = { ...PINNED, approved: 1, rejected: 0, newOrChanged: 0, gone: 0 };
    expect(bannerAnnouncement(small)).toBe(bannerText(small));
  });
});

describe('stepSummary', () => {
  it('CARRY-STEP2 fills the spec template with the pinned numbers', () => {
    expect(stepSummary(PINNED)).toBe(
      '6 of 9 hunks are unchanged: 5 approved and 1 rejected carry over. 3 are new or changed, 5 no longer present (4 were rejected).',
    );
  });

  it('CARRY-STEP2 agrees the verbs with a count of one', () => {
    const one: CarryFacts = { ...PINNED, unchanged: 1, newOrChanged: 1, goneRejected: 1 };
    expect(stepSummary(one)).toBe(
      '1 of 9 hunks is unchanged: 5 approved and 1 rejected carry over. 1 is new or changed, 5 no longer present (1 was rejected).',
    );
  });
});

describe('option and badge copy', () => {
  it('CARRY-DETAIL states what each choice keeps or discards', () => {
    expect(continueDetail(6, 1)).toBe(
      'Keeps 6 decisions, comments and the label from round 1. New or changed hunks start pending.',
    );
    expect(startNewDetail(11, 1)).toBe(
      'Starts at round 1 with every hunk pending and discards 11 decisions from round 1. They stay saved with the old diff.',
    );
    expect(startNewDetail(1, 2)).toContain('discards 1 decision from round 2');
    expect(startNewDetail(0, 1)).toBe('Starts at round 1 with every hunk pending.');
  });

  it('CARRY-DETAIL names the consequence of restoring', () => {
    expect(restoreSummary(2, 1, 1)).toBe(
      'This diff was reviewed before: 2 decisions in round 1. Restoring it replaces the review you have open, which has 1 decision. Those stay saved in this browser.',
    );
  });

  it('CARRY-BADGE words the three unchanged states and the new-hunk announcement', () => {
    expect(badgeDetail({ kind: 'unchanged', carried: 'approved', round: 2 })).toBe(
      'Approved in round 2',
    );
    expect(badgeDetail({ kind: 'unchanged', carried: 'rejected', round: 1 })).toBe(
      'Unchanged since you rejected it',
    );
    expect(badgeDetail({ kind: 'unchanged', carried: 'pending', round: 1 })).toBe(
      'Unchanged, still pending',
    );
    expect(newReviewAnnouncement(PINNED)).toBe('Showing 3 hunks that are new or changed.');
    expect(newReviewAnnouncement({ ...PINNED, newOrChanged: 1 })).toBe(
      'Showing 1 hunk that is new or changed.',
    );
  });
});
