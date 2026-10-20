import { LIMITS } from '../limits';
import type { DiffFile, Flag, RuleNotice } from '../types';
import {
  DEFAULT_RISK_CONFIG,
  type RiskConfig,
  type RiskRule,
  type RuleContext,
  type RuleMatch,
} from './config';
import { candidateContext, makeContext } from './context';
import { addMatch, makeFlag, sortFlags, type FlagAccumulator } from './flags';

export type RiskAnalysis = {
  readonly flags: readonly Flag[];
  readonly notices: readonly RuleNotice[];
  readonly bulkIneligibleFileIds: readonly string[];
};

type AnalysisState = {
  readonly accumulators: Map<string, FlagAccumulator>;
  readonly notices: RuleNotice[];
  readonly bulkIneligibleFileIds: string[];
};

function runRule(
  rule: RiskRule,
  context: RuleContext,
  notices: RuleNotice[],
): readonly RuleMatch[] {
  try {
    return rule.evaluate(candidateContext(context, rule));
  } catch {
    notices.push({
      ruleId: rule.id,
      fileId: context.file.id,
      message: `Rule ${rule.id} could not be evaluated for ${context.path}.`,
    });
    return [];
  }
}

function addLongLineNotices(context: RuleContext, limit: number, notices: RuleNotice[]): void {
  for (const line of context.allLines) {
    if (line.text.length > limit) {
      notices.push({
        ruleId: null,
        fileId: context.file.id,
        message: `A line in ${context.path} exceeds the scan limit.`,
      });
    }
  }
}

function isRuleList(config: RiskConfig | readonly RiskRule[]): config is readonly RiskRule[] {
  return Array.isArray(config);
}

function resolveRules(config: RiskConfig | readonly RiskRule[]): readonly RiskRule[] {
  if (isRuleList(config)) {
    return config;
  }
  return config.rules ?? config.registry ?? DEFAULT_RISK_CONFIG.rules;
}

function resolveScanLimit(config: RiskConfig | readonly RiskRule[]): number {
  if (isRuleList(config) || config.maxLineScanChars === undefined) {
    return LIMITS.maxLineScanChars;
  }
  return Math.max(1, config.maxLineScanChars);
}

function analyzeFile(
  context: RuleContext,
  rules: readonly RiskRule[],
  limit: number,
  state: AnalysisState,
): void {
  addLongLineNotices(context, limit, state.notices);
  for (const rule of rules) {
    const beforeNotices = state.notices.length;
    for (const match of runRule(rule, context, state.notices)) {
      addMatch(state.accumulators, rule, context, match);
    }
    if (
      state.notices.length > beforeNotices &&
      !state.bulkIneligibleFileIds.includes(context.file.id)
    ) {
      state.bulkIneligibleFileIds.push(context.file.id);
    }
  }
}

export function analyze(
  files: readonly DiffFile[],
  config: RiskConfig | readonly RiskRule[] = {},
): RiskAnalysis {
  const rules = resolveRules(config);
  const limit = resolveScanLimit(config);
  const state: AnalysisState = {
    accumulators: new Map(),
    notices: [],
    bulkIneligibleFileIds: [],
  };

  for (const file of files) {
    analyzeFile(makeContext(file, files, limit), rules, limit, state);
  }

  return {
    flags: sortFlags([...state.accumulators.values()].map(makeFlag), files),
    notices: state.notices,
    bulkIneligibleFileIds: state.bulkIneligibleFileIds,
  };
}

export function analyzeFlags(
  files: readonly DiffFile[],
  config: RiskConfig | readonly RiskRule[] = {},
): readonly Flag[] {
  return analyze(files, config).flags;
}

export const analyzeRisks = analyze;
