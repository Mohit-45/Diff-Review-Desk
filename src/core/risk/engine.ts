import { LIMITS } from '../limits';
import type { DiffFile, Flag, RuleNotice } from '../types';
import { maskEvidence } from './mask';
import {
  DEFAULT_RISK_CONFIG,
  type RiskConfig,
  type RiskLine,
  type RiskRule,
  type RuleContext,
  type RuleMatch,
  type RiskSeverity,
} from './config';
import {
  isDocsPath,
  isGeneratedPath,
  isLockPath,
  isTestPath,
  isVendoredPath,
  lowBinaryPath,
} from './rules/matchers';

export type RiskAnalysis = {
  readonly flags: readonly Flag[];
  readonly notices: readonly RuleNotice[];
  readonly bulkIneligibleFileIds: readonly string[];
};

type FlagAccumulator = {
  readonly rule: RiskRule;
  readonly file: DiffFile;
  readonly path: string;
  readonly hunkId: string | null;
  lines: Set<number>;
  count: number;
  evidence: string | undefined;
};

function filePath(file: DiffFile): string {
  return file.newPath ?? file.oldPath ?? file.displayPath;
}

function scanLine(line: RiskLine, limit: number): RiskLine {
  return { ...line, scanText: line.text.slice(0, limit) };
}

function collectLines(
  file: DiffFile,
  limit: number,
): {
  readonly all: readonly RiskLine[];
  readonly added: readonly RiskLine[];
  readonly removed: readonly RiskLine[];
} {
  const all: RiskLine[] = [];
  const added: RiskLine[] = [];
  const removed: RiskLine[] = [];
  for (const hunk of file.hunks) {
    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex += 1) {
      const line = hunk.lines[lineIndex];
      if (line === undefined) {
        continue;
      }
      const riskLine = scanLine(
        {
          hunk,
          line,
          lineIndex,
          lineNumber: line.kind === 'remove' ? line.oldNo : line.newNo,
          text: line.text,
          scanText: line.text,
        },
        limit,
      );
      all.push(riskLine);
      if (line.kind === 'add') {
        added.push(riskLine);
      } else if (line.kind === 'remove') {
        removed.push(riskLine);
      }
    }
  }
  return { all, added, removed };
}

function hasPrefilter(line: RiskLine, rule: RiskRule): boolean {
  if (rule.prefilter.length === 0) {
    return true;
  }
  const value = (rule.scanWholeLine ? line.text : line.scanText).toLowerCase();
  return rule.prefilter.some((prefilter) => value.includes(prefilter));
}

function effectiveSeverity(rule: RiskRule, context: RuleContext): RiskSeverity {
  const pathCap =
    rule.capOnPaths &&
    (context.isGeneratedPath ||
      context.isVendoredPath ||
      context.isLockPath ||
      context.isTestPath ||
      context.isDocsPath);
  if (pathCap) {
    return 'low';
  }
  if (
    rule.id === 'file-mode-changed' &&
    (context.path.toLowerCase().endsWith('.sh') || context.path.toLowerCase().startsWith('bin/'))
  ) {
    return 'low';
  }
  if (rule.id === 'file-deleted' && (context.isGeneratedPath || context.isLockPath)) {
    return 'low';
  }
  if (rule.id === 'binary-file' && lowBinaryPath(context.path)) {
    return 'low';
  }
  return rule.severity;
}

function severityRank(severity: RiskSeverity): number {
  if (severity === 'high') {
    return 3;
  }
  if (severity === 'medium') {
    return 2;
  }
  return 1;
}

function makeContext(file: DiffFile, allFiles: readonly DiffFile[], limit: number): RuleContext {
  const path = filePath(file);
  const lines = collectLines(file, limit);
  return {
    file,
    allFiles,
    path,
    pathLower: path.toLowerCase(),
    addedLines: lines.added,
    removedLines: lines.removed,
    allLines: lines.all,
    candidateAddedLines: lines.added,
    isTestPath: isTestPath(path),
    isGeneratedPath: isGeneratedPath(path, file),
    isVendoredPath: isVendoredPath(path),
    isLockPath: isLockPath(path),
    isDocsPath: isDocsPath(path),
  };
}

function candidateContext(context: RuleContext, rule: RiskRule): RuleContext {
  const removedCounts = new Map<string, number>();
  for (const line of context.removedLines) {
    removedCounts.set(line.text, (removedCounts.get(line.text) ?? 0) + 1);
  }
  const movedSuppressed = (line: RiskLine): boolean => {
    const remaining = removedCounts.get(line.text) ?? 0;
    if (remaining <= 0) {
      return false;
    }
    removedCounts.set(line.text, remaining - 1);
    return true;
  };
  const candidateLines = context.addedLines.filter(
    (line) => hasPrefilter(line, rule) && !movedSuppressed(line),
  );
  if (rule.scanWholeLine) {
    return { ...context, candidateAddedLines: candidateLines };
  }
  const scan = (line: RiskLine): RiskLine => ({ ...line, text: line.scanText });
  return {
    ...context,
    addedLines: context.addedLines.map(scan),
    removedLines: context.removedLines.map(scan),
    allLines: context.allLines.map(scan),
    candidateAddedLines: candidateLines.map(scan),
  };
}

function accumulatorKey(fileId: string, ruleId: string, hunkId: string | null): string {
  return `${fileId}\u0000${ruleId}\u0000${hunkId ?? '<file>'}`;
}

function addMatch(
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

function makeFlag(accumulator: FlagAccumulator): Flag {
  const path = accumulator.path;
  const context: RuleContext = {
    file: accumulator.file,
    allFiles: [],
    path,
    pathLower: path.toLowerCase(),
    addedLines: [],
    removedLines: [],
    allLines: [],
    candidateAddedLines: [],
    isTestPath: isTestPath(path),
    isGeneratedPath: isGeneratedPath(path, accumulator.file),
    isVendoredPath: isVendoredPath(path),
    isLockPath: isLockPath(path),
    isDocsPath: isDocsPath(path),
  };
  const evidence =
    accumulator.rule.id === 'sensitive-file-added'
      ? maskEvidence(accumulator.evidence ?? '', { sensitive: true, ruleId: accumulator.rule.id })
      : accumulator.evidence === undefined
        ? undefined
        : maskEvidence(accumulator.evidence);
  const flag: Flag = {
    ruleId: accumulator.rule.id,
    severity: effectiveSeverity(accumulator.rule, context),
    title: accumulator.rule.title,
    why: accumulator.rule.why,
    fileId: accumulator.file.id,
    hunkId: accumulator.hunkId,
    lines: [...accumulator.lines].sort((left, right) => left - right).slice(0, 20),
    count: accumulator.count,
  };
  return evidence === undefined ? flag : { ...flag, evidence };
}

function sortFlags(flags: readonly Flag[], files: readonly DiffFile[]): readonly Flag[] {
  const paths = new Map<string, string>();
  for (const file of files) {
    paths.set(file.id, filePath(file));
  }
  return [...flags].sort((left, right) => {
    const severity = severityRank(right.severity) - severityRank(left.severity);
    if (severity !== 0) {
      return severity;
    }
    const leftPath = paths.get(left.fileId) ?? left.fileId;
    const rightPath = paths.get(right.fileId) ?? right.fileId;
    if (leftPath < rightPath) {
      return -1;
    }
    if (leftPath > rightPath) {
      return 1;
    }
    const leftLine = left.lines[0] ?? Number.MAX_SAFE_INTEGER;
    const rightLine = right.lines[0] ?? Number.MAX_SAFE_INTEGER;
    if (leftLine !== rightLine) {
      return leftLine - rightLine;
    }
    if (left.ruleId < right.ruleId) {
      return -1;
    }
    if (left.ruleId > right.ruleId) {
      return 1;
    }
    return (left.hunkId ?? '') < (right.hunkId ?? '') ? -1 : 1;
  });
}

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

function resolveRules(config: RiskConfig | readonly RiskRule[] | undefined): readonly RiskRule[] {
  if (Array.isArray(config)) {
    return config;
  }
  const riskConfig = config as RiskConfig | undefined;
  return riskConfig?.rules ?? riskConfig?.registry ?? DEFAULT_RISK_CONFIG.rules;
}

export function analyze(
  files: readonly DiffFile[],
  config: RiskConfig | readonly RiskRule[] = {},
): RiskAnalysis {
  const rules = resolveRules(config);
  const riskConfig = Array.isArray(config) ? undefined : (config as RiskConfig);
  const maxLineScanChars =
    riskConfig?.maxLineScanChars !== undefined
      ? Math.max(1, riskConfig.maxLineScanChars)
      : LIMITS.maxLineScanChars;
  const accumulators = new Map<string, FlagAccumulator>();
  const notices: RuleNotice[] = [];
  const bulkIneligibleFileIds: string[] = [];

  for (const file of files) {
    const context = makeContext(file, files, maxLineScanChars);
    addLongLineNotices(context, maxLineScanChars, notices);
    for (const rule of rules) {
      const beforeNotices = notices.length;
      for (const match of runRule(rule, context, notices)) {
        addMatch(accumulators, rule, context, match);
      }
      if (notices.length > beforeNotices && !bulkIneligibleFileIds.includes(file.id)) {
        bulkIneligibleFileIds.push(file.id);
      }
    }
  }

  const flags = sortFlags([...accumulators.values()].map(makeFlag), files);
  return {
    flags,
    notices,
    bulkIneligibleFileIds,
  };
}

export function analyzeFlags(
  files: readonly DiffFile[],
  config: RiskConfig | readonly RiskRule[] = {},
): readonly Flag[] {
  return analyze(files, config).flags;
}

export const analyzeRisks = analyze;
