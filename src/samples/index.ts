import { AGENT_RUN_1_DIFF, AGENT_RUN_1_TEMPLATE } from './agentRun1';
import { AGENT_RUN_2_DIFF, AGENT_RUN_2_TEMPLATE } from './agentRun2';

export type BuiltInSampleId = 'agent-run-1' | 'agent-run-2';

export type BuiltInSample = {
  readonly id: BuiltInSampleId;
  readonly title: string;
  readonly description: string;
  readonly text: string;
};

export const BUILT_IN_SAMPLES: readonly BuiltInSample[] = Object.freeze([
  {
    id: 'agent-run-1',
    title: 'Sample: agent run 1',
    description: 'A small fictional change with risk flags and metadata hunks.',
    text: AGENT_RUN_1_DIFF,
  },
  {
    id: 'agent-run-2',
    title: 'Sample: agent run 2, after fixes',
    description: 'A follow-up change with carried and new-or-changed hunks.',
    text: AGENT_RUN_2_DIFF,
  },
] as const);

export const SAMPLES = BUILT_IN_SAMPLES;
export const SAMPLE_ONE = AGENT_RUN_1_DIFF;
export const SAMPLE_TWO = AGENT_RUN_2_DIFF;
export const AGENT_RUN_1 = AGENT_RUN_1_DIFF;
export const AGENT_RUN_2 = AGENT_RUN_2_DIFF;

export function getBuiltInSample(id: BuiltInSampleId): BuiltInSample {
  const sample = BUILT_IN_SAMPLES.find((candidate) => candidate.id === id);
  if (sample === undefined) {
    throw new Error(`Unknown built-in sample: ${id}`);
  }
  return sample;
}

export { AGENT_RUN_1_DIFF, AGENT_RUN_1_TEMPLATE, AGENT_RUN_2_DIFF, AGENT_RUN_2_TEMPLATE };
export { materialize } from './fakeSecrets';
