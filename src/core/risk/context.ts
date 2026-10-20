import type { DiffFile } from '../types';
import type { RiskLine, RiskRule, RuleContext } from './config';
import { isTestPath } from './glob';
import { isDocsPath, isGeneratedPath, isLockPath, isVendoredPath } from './rules/paths';

/** Path classes that cap or lower a rule's severity. */
export type PathTraits = Pick<
  RuleContext,
  'isTestPath' | 'isGeneratedPath' | 'isVendoredPath' | 'isLockPath' | 'isDocsPath'
>;

export function filePath(file: DiffFile): string {
  return file.newPath ?? file.oldPath ?? file.displayPath;
}

export function pathTraits(path: string, file: DiffFile): PathTraits {
  return {
    isTestPath: isTestPath(path),
    isGeneratedPath: isGeneratedPath(path, file),
    isVendoredPath: isVendoredPath(path),
    isLockPath: isLockPath(path),
    isDocsPath: isDocsPath(path),
  };
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

export function makeContext(
  file: DiffFile,
  allFiles: readonly DiffFile[],
  limit: number,
): RuleContext {
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
    ...pathTraits(path, file),
  };
}

function hasPrefilter(line: RiskLine, rule: RiskRule): boolean {
  if (rule.prefilter.length === 0) {
    return true;
  }
  const value = (rule.scanWholeLine ? line.text : line.scanText).toLowerCase();
  return rule.prefilter.some((prefilter) => value.includes(prefilter));
}

/**
 * The view of a file one rule evaluates: only added lines that pass the rule's
 * cheap prefilter and were not merely moved, cut to the scan limit unless the
 * rule asked for whole lines.
 */
export function candidateContext(context: RuleContext, rule: RiskRule): RuleContext {
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
