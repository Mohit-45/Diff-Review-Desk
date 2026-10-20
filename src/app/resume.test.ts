import { describe, expect, it } from 'vitest';
import { OPEN_KEY } from '../storage/adapter';
import { reviewKeyFor } from '../storage/keys';
import { decidedState, memoryAreas, parsedFiles, smallDiff } from './appFixtures';
import { persistReview } from './persist';
import { resumeOpenReview } from './resume';

const updatedAt = '2026-10-20T00:00:00.000Z';

function saveOpen(text: string, rememberDiff = true) {
  const areas = memoryAreas();
  const state = decidedState(text);
  persistReview(state, { adapter: areas.adapter, updatedAt, diffText: text, rememberDiff });
  areas.adapter.setOpenFingerprint(state.fingerprint);
  return { ...areas, state };
}

describe('resumeOpenReview', () => {
  it('finds nothing when no review is open in this tab', () => {
    const { adapter } = memoryAreas();
    expect(resumeOpenReview(adapter)).toEqual({ kind: 'none' });
  });

  it('restores the open review with its files and diff text', () => {
    const { adapter, state } = saveOpen(smallDiff());
    const resumed = resumeOpenReview(adapter);
    expect(resumed.kind).toBe('review');
    if (resumed.kind !== 'review') return;
    expect(resumed.state.hunks).toEqual(state.hunks);
    expect(resumed.state.fingerprint).toBe(state.fingerprint);
    expect(resumed.files).toHaveLength(2);
    expect(resumed.diffText).toBe(smallDiff());
  });

  it('reports decisions only when the diff text was not kept', () => {
    const { adapter } = saveOpen(smallDiff(), false);
    expect(resumeOpenReview(adapter)).toEqual({
      kind: 'decisions-only',
      notice: 'Saved decisions for 2 hunks. Paste or drop the same diff to restore them.',
    });
  });

  it('keeps decisions only when the saved text no longer matches the fingerprint', () => {
    const { adapter, state } = saveOpen(smallDiff('one'));
    adapter.setDiff(state.fingerprint, smallDiff('two'), state.fingerprint);
    const resumed = resumeOpenReview(adapter);
    expect(resumed.kind).toBe('decisions-only');
  });

  it('brings back a bundled text even when the stored diff was withheld', () => {
    const text = smallDiff('bundled');
    const { adapter, state } = saveOpen(text, false);
    const resumed = resumeOpenReview(adapter, [smallDiff('other'), text]);
    expect(resumed.kind).toBe('review');
    expect(resumed.kind === 'review' && resumed.state.hunks).toEqual(state.hunks);
  });

  it('ST-CORRUPT treats a corrupt record as nothing to resume', () => {
    const { adapter, local, state } = saveOpen(smallDiff());
    local.setItem(reviewKeyFor(state.fingerprint), '{ not json');
    const fresh = memoryAreas();
    fresh.local.setItem(reviewKeyFor(state.fingerprint), '{ not json');
    fresh.session.setItem(OPEN_KEY, state.fingerprint);
    expect(resumeOpenReview(fresh.adapter)).toEqual({ kind: 'none' });
    expect(fresh.adapter.notices.map((notice) => notice.code)).toEqual(['corrupt']);
    expect(adapter.degraded).toBe(false);
  });

  it('ST-FUTURE treats a newer-version record as nothing to resume and leaves it alone', () => {
    const { fingerprint } = parsedFiles(smallDiff());
    const fresh = memoryAreas();
    const future = JSON.stringify({ schemaVersion: 2, fingerprint });
    fresh.local.setItem(reviewKeyFor(fingerprint), future);
    fresh.session.setItem(OPEN_KEY, fingerprint);
    expect(resumeOpenReview(fresh.adapter)).toEqual({ kind: 'none' });
    expect(fresh.local.getItem(reviewKeyFor(fingerprint))).toBe(future);
    expect(fresh.adapter.notices.map((notice) => notice.code)).toEqual(['future-schema']);
  });

  it('ignores a pointer to a review that was removed', () => {
    const { adapter, state } = saveOpen(smallDiff());
    adapter.removeReview(state.fingerprint);
    expect(resumeOpenReview(adapter)).toEqual({ kind: 'none' });
  });
});
