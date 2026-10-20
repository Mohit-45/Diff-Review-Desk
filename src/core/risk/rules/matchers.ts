import type { DiffFile } from '../../types';
import type { RiskLine, RuleContext, RuleMatch } from '../config';
import { matchesAnyGlob } from '../glob';
import { hasHiddenSpan } from '../hidden';
import { findSecretSpans } from '../secrets';
import { isAssertionLine } from './lineTests';
import { isAddedDependency, parsePackageEntry } from './packageManifest';
import { isSensitivePath, lowerBase } from './paths';

const CI_GLOBS = [
  '.github/workflows/**',
  '.gitlab-ci.yml',
  'Dockerfile*',
  'docker-compose*',
  '.devcontainer/**',
] as const;

function lineResult(line: RiskLine, evidence = line.text): RuleMatch {
  return {
    hunkId: line.hunk.id,
    lines: line.lineNumber === null ? [] : [line.lineNumber],
    evidence,
  };
}

function fileResult(count = 1): RuleMatch {
  return { hunkId: null, count };
}

function canonicalStem(path: string): string {
  const lower = path.toLowerCase();
  const slash = lower.lastIndexOf('/');
  const base = slash < 0 ? lower : lower.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  const withoutExtension = dot > 0 ? base.slice(0, dot) : base;
  for (const suffix of ['.test', '.spec', '_test']) {
    if (withoutExtension.endsWith(suffix)) {
      return withoutExtension.slice(0, -suffix.length);
    }
  }
  if (withoutExtension.startsWith('test_')) {
    return withoutExtension.slice('test_'.length);
  }
  return withoutExtension;
}

const replacementStemCache = new WeakMap<readonly DiffFile[], ReadonlySet<string>>();

/** Stems of every added or renamed file, built once per diff so each deleted test is a lookup. */
function replacementStems(files: readonly DiffFile[]): ReadonlySet<string> {
  const cached = replacementStemCache.get(files);
  if (cached !== undefined) {
    return cached;
  }
  const stems = new Set<string>();
  for (const file of files) {
    if (file.status === 'added' || file.status === 'renamed') {
      stems.add(canonicalStem(file.newPath ?? file.oldPath ?? file.displayPath));
    }
  }
  replacementStemCache.set(files, stems);
  return stems;
}

export function testFileDeleted(context: RuleContext): readonly RuleMatch[] {
  if (context.file.status !== 'deleted' || !context.isTestPath) {
    return [];
  }
  return replacementStems(context.allFiles).has(canonicalStem(context.path)) ? [] : [fileResult()];
}

function requirementName(text: string): string | null {
  const trimmed = text.trimStart();
  if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('-')) {
    return null;
  }
  const operators = ['==', '>=', '~=', '<=', '>', '<', '@'] as const;
  let earliest = -1;
  for (const operator of operators) {
    const found = trimmed.indexOf(operator);
    if (found >= 0 && (earliest < 0 || found < earliest)) {
      earliest = found;
    }
  }
  if (earliest <= 0) {
    return null;
  }
  return trimmed.slice(0, earliest).trim().toLowerCase();
}

function removedPackageKeys(context: RuleContext): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const removed of context.removedLines) {
    const entry = parsePackageEntry(removed.text);
    if (entry !== null) {
      keys.add(entry.key);
    }
  }
  return keys;
}

function modeChanged(file: DiffFile): boolean {
  return (
    file.newMode === '100755' ||
    (file.oldMode !== file.newMode && (file.oldMode === '120000' || file.newMode === '120000'))
  );
}

export function evaluateSecretKnownToken(context: RuleContext): readonly RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const line of context.candidateAddedLines) {
    const spans = findSecretSpans(line.text).filter((span) => span.ruleId === 'secret-known-token');
    if (spans.length > 0) {
      matches.push(lineResult(line));
    }
  }
  return matches;
}

export function evaluateSensitiveFile(context: RuleContext): readonly RuleMatch[] {
  return isSensitivePath(context.path) && context.addedLines.length > 0
    ? context.addedLines.map((line) => lineResult(line))
    : [];
}

export function evaluateHiddenUnicode(context: RuleContext): readonly RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const line of context.addedLines) {
    const hidden = hasHiddenSpan(line.text, {
      isNewFile: context.file.status === 'added',
      lineNumber: line.lineNumber ?? undefined,
    });
    if (hidden) {
      matches.push(lineResult(line));
    }
  }
  if (hasHiddenSpan(context.path, { isPath: true })) {
    matches.push(fileResult());
  }
  return matches;
}

export function evaluateTestAssertionRemoved(context: RuleContext): readonly RuleMatch[] {
  if (!context.isTestPath) {
    return [];
  }
  const removed = context.removedLines.filter((line) => isAssertionLine(line.text)).length;
  const added = context.addedLines.filter((line) => isAssertionLine(line.text)).length;
  const net = removed - added;
  if (net <= 0) {
    return [];
  }
  return context.removedLines
    .filter((line) => isAssertionLine(line.text))
    .map((line, index) => ({
      ...lineResult(line),
      count: index === 0 ? net : 0,
    }));
}

export function evaluateLine(
  context: RuleContext,
  predicate: (text: string) => boolean,
): readonly RuleMatch[] {
  return context.candidateAddedLines
    .filter((line) => predicate(line.text))
    .map((line) => lineResult(line));
}

export function evaluateSecretAssignment(context: RuleContext): readonly RuleMatch[] {
  return context.candidateAddedLines
    .filter((line) =>
      findSecretSpans(line.text).some((span) => span.ruleId === 'secret-assignment'),
    )
    .map((line) => lineResult(line));
}

export function evaluateDependencyAdded(context: RuleContext): readonly RuleMatch[] {
  const base = lowerBase(context.path);
  if (base === 'package.json') {
    const removedKeys = removedPackageKeys(context);
    return context.candidateAddedLines
      .filter((line) => isAddedDependency(line.text, removedKeys))
      .map((line) => lineResult(line));
  }
  if (base.startsWith('requirements') && base.endsWith('.txt')) {
    return context.candidateAddedLines
      .filter((line) => requirementName(line.text) !== null)
      .map((line) => lineResult(line));
  }
  return [];
}

export function evaluateTestFileDeleted(context: RuleContext): readonly RuleMatch[] {
  return testFileDeleted(context);
}

export function evaluateCiContainer(context: RuleContext): readonly RuleMatch[] {
  return matchesAnyGlob(context.path, CI_GLOBS) ? [fileResult()] : [];
}

export function evaluateFileMode(context: RuleContext): readonly RuleMatch[] {
  return modeChanged(context.file) ? [fileResult()] : [];
}

export function evaluateFileDeleted(context: RuleContext): readonly RuleMatch[] {
  return context.file.status === 'deleted' && !context.isTestPath ? [fileResult()] : [];
}

export function evaluateBinary(context: RuleContext): readonly RuleMatch[] {
  const binaryMeta = context.file.hunks.some((hunk) => hunk.meta.includes('binary'));
  return context.file.binary || binaryMeta ? [fileResult()] : [];
}
