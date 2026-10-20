import { parseDiff } from '../core/parser/parse';
import { carryOverSummary, type CarryOverSummary } from '../core/review/carryover';
import { createReviewState } from '../core/review/reducer';
import type { ReviewState } from '../core/types';
import { AGENT_RUN_1_DIFF, AGENT_RUN_2_DIFF } from '../samples';
import { hunkIdsOf, parsedFiles } from './appFixtures';

/** Round 1 of the demo: 6 approved and 5 rejected, 5 and 1 among the six repeated hunks. */
const ROUND_ONE: readonly ('approved' | 'rejected')[] = [
  'approved',
  'rejected',
  'approved',
  'rejected',
  'approved',
  'approved',
  'approved',
  'rejected',
  'rejected',
  'rejected',
  'approved',
];

export function sampleOneRoundOne(): ReviewState {
  const { fingerprint, files } = parsedFiles(AGENT_RUN_1_DIFF);
  const ids = hunkIdsOf(files);
  const base = createReviewState(fingerprint, ids, 'Sample: agent run 1');
  const hunks: Record<string, { decision: 'approved' | 'rejected'; comment: string }> = {};
  ids.forEach((id, index) => {
    const decision = ROUND_ONE[index];
    if (decision !== undefined) {
      hunks[id] = { decision, comment: '' };
    }
  });
  return { ...base, hunks };
}

export function sampleTwoTarget(): { fingerprint: string; hunkIds: readonly string[] } {
  const parsed = parseDiff(AGENT_RUN_2_DIFF);
  if (!parsed.ok) {
    throw new Error('Sample 2 did not parse.');
  }
  return { fingerprint: parsed.fingerprint, hunkIds: hunkIdsOf(parsed.files) };
}

/** The pinned round-2 result: 6 carried (5 approved, 1 rejected), 3 new, 5 gone (4 rejected). */
export function roundTwoSummary(): CarryOverSummary {
  return carryOverSummary(sampleOneRoundOne(), sampleTwoTarget());
}
