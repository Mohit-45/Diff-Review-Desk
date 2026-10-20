import type { DiffFile, Flag } from '../types';
import {
  MAX_FLAG_LINE_REFS,
  type RiskRule,
  type RiskSeverity,
  type RuleContext,
  type RuleMatch,
} from './config';
import { filePath, pathTraits, type PathTraits } from './context';
import { maskEvidence } from './mask';
import { lowBinaryPath } from './rules/paths';

export type FlagAccumulator = {
  readonly rule: RiskRule;
  readonly file: DiffFile;
  readonly path: string;
  readonly hunkId: string | null;
  lines: Set<number>;
  count: number;
  evidence: string | undefined;
};

function accumulatorKey(fileId: string, ruleId: string, hunkId: string | null): string {
  return `${fileId}\u0000${ruleId}\u0000${hunkId ?? '<file>'}`;
}

/** One flag per (file, rule, hunk): later matches add to the count and the line refs. */
export function addMatch(
  accumulators: Map<string, FlagAccumulator>,
  rule: RiskRule,
  context: RuleContext,
  match: RuleMatch,
): void {
  const key = accumulatorKey(context.file.id, rule.id, match.hunkId);
  const existing = accumulators.get(key);
  const count = match.count ?? 1;
  const lines = match.lines ?? [];
  if (existing === undefined) {
    accumulators.set(key, {
      rule,
      file: context.file,
      path: context.path,
      hunkId: match.hunkId,
      lines: new Set(lines),
      count,
      evidence: match.evidence,
    });
    return;
  }
  for (const line of lines) {
    existing.lines.add(line);
  }
  existing.count += count;
  if (existing.evidence === undefined && match.evidence !== undefined) {
    existing.evidence = match.evidence;
  }
}

function isPathCapped(rule: RiskRule, traits: PathTraits): boolean {
  return (
    rule.capOnPaths === true &&
    (traits.isGeneratedPath ||
      traits.isVendoredPath ||
      traits.isLockPath ||
      traits.isTestPath ||
      traits.isDocsPath)
  );
}

function isLowForThisPath(rule: RiskRule, path: string, traits: PathTraits): boolean {
  if (rule.id === 'file-mode-changed') {
    const lower = path.toLowerCase();
    return lower.endsWith('.sh') || lower.startsWith('bin/');
  }
  if (rule.id === 'file-deleted') {
    return traits.isGeneratedPath || traits.isLockPath;
  }
  return rule.id === 'binary-file' && lowBinaryPath(path);
}

function effectiveSeverity(rule: RiskRule, path: string, traits: PathTraits): RiskSeverity {
  return isPathCapped(rule, traits) || isLowForThisPath(rule, path, traits) ? 'low' : rule.severity;
}

function flagEvidence(accumulator: FlagAccumulator): string | undefined {
  if (accumulator.rule.id === 'sensitive-file-added') {
    return maskEvidence(accumulator.evidence ?? '', {
      sensitive: true,
      ruleId: accumulator.rule.id,
    });
  }
  return accumulator.evidence === undefined ? undefined : maskEvidence(accumulator.evidence);
}

export function makeFlag(accumulator: FlagAccumulator): Flag {
  const { rule, file, path } = accumulator;
  const flag: Flag = {
    ruleId: rule.id,
    severity: effectiveSeverity(rule, path, pathTraits(path, file)),
    title: rule.title,
    why: rule.why,
    fileId: file.id,
    hunkId: accumulator.hunkId,
    lines: [...accumulator.lines].sort((left, right) => left - right).slice(0, MAX_FLAG_LINE_REFS),
    count: accumulator.count,
  };
  const evidence = flagEvidence(accumulator);
  return evidence === undefined ? flag : { ...flag, evidence };
}

function severityRank(severity: RiskSeverity): number {
  if (severity === 'high') {
    return 3;
  }
  return severity === 'medium' ? 2 : 1;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function firstLine(flag: Flag): number {
  return flag.lines[0] ?? Number.MAX_SAFE_INTEGER;
}

/** Severity descending, then path, first line, rule id and hunk id. */
export function sortFlags(flags: readonly Flag[], files: readonly DiffFile[]): readonly Flag[] {
  const paths = new Map<string, string>();
  for (const file of files) {
    paths.set(file.id, filePath(file));
  }
  const pathOf = (flag: Flag): string => paths.get(flag.fileId) ?? flag.fileId;
  return [...flags].sort(
    (left, right) =>
      severityRank(right.severity) - severityRank(left.severity) ||
      compareText(pathOf(left), pathOf(right)) ||
      firstLine(left) - firstLine(right) ||
      compareText(left.ruleId, right.ruleId) ||
      ((left.hunkId ?? '') < (right.hunkId ?? '') ? -1 : 1),
  );
}
