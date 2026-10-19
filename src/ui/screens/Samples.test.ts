import { describe, expect, it } from 'vitest';
import { analyze } from '../../core/risk/engine';
import { parseDiff } from '../../core/parser/parse';
import { AGENT_RUN_1_DIFF, AGENT_RUN_2_DIFF, BUILT_IN_SAMPLES, materialize } from '../../samples';

describe('built-in samples', () => {
  it('SAMPLE-PLACEHOLDERS materialise secrets and control characters only in memory', () => {
    expect(AGENT_RUN_1_DIFF).toContain('AKIA');
    expect(AGENT_RUN_1_DIFF).toContain(String.fromCodePoint(0x202e));
    expect(materialize('{{FAKE:api-key}}')).toMatch(/^AKIA[A-Z0-9]{16}$/u);
    expect(materialize('{{U+202E}}')).toBe(String.fromCodePoint(0x202e));
  });

  it('SAMPLE-COUNTS keeps agent run 1 at eight files and eleven hunks', () => {
    const result = parseDiff(AGENT_RUN_1_DIFF);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const hunks = result.files.flatMap((file) => file.hunks);
    expect(result.files).toHaveLength(8);
    expect(hunks).toHaveLength(11);
    expect(hunks.filter((hunk) => hunk.kind === 'text')).toHaveLength(9);
    expect(hunks.filter((hunk) => hunk.kind === 'meta')).toHaveLength(2);
    expect(
      new Set(analyze(result.files).flags.map((flag) => flag.ruleId)).size,
    ).toBeGreaterThanOrEqual(8);
  });

  it('SAMPLE-CARRYOVER has six identical hunks, three changed/new hunks and nine total', () => {
    const first = parseDiff(AGENT_RUN_1_DIFF);
    const second = parseDiff(AGENT_RUN_2_DIFF);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    const firstIds = new Set(first.files.flatMap((file) => file.hunks.map((hunk) => hunk.id)));
    const secondHunks = second.files.flatMap((file) => file.hunks);
    const unchanged = secondHunks.filter((hunk) => firstIds.has(hunk.id));
    expect(secondHunks).toHaveLength(9);
    expect(unchanged).toHaveLength(6);
    expect(secondHunks.length - unchanged.length).toBe(3);
  });

  it('SAMPLE-CATALOG exposes the two sample labels used by the intake controls', () => {
    expect(BUILT_IN_SAMPLES.map((sample) => sample.title)).toEqual([
      'Sample: agent run 1',
      'Sample: agent run 2, after fixes',
    ]);
  });
});
