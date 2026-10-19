import type { DiffFile } from '../../types';
import { findHiddenSpans } from '../hidden';
import { isTestPath, matchesAnyGlob } from '../glob';
import { findSecretSpans } from '../secrets';
import type { RiskLine, RuleContext, RuleMatch } from '../config';

const CI_GLOBS = [
  '.github/workflows/**',
  '.gitlab-ci.yml',
  'Dockerfile*',
  'docker-compose*',
  '.devcontainer/**',
] as const;

const TEST_ASSERTION_MARKERS = [
  'expect(',
  'assert',
  'assertequal',
  'assertthat',
  'should.',
  't.fatal',
  't.error',
  'require.',
  'self.assert',
  'xctassert',
] as const;

const PACKAGE_META_KEYS = new Set([
  'name',
  'version',
  'description',
  'main',
  'module',
  'types',
  'type',
  'license',
  'author',
  'packagemanager',
  'node',
  'npm',
]);

function pathBase(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? path : path.slice(slash + 1);
}

function lowerBase(path: string): string {
  return pathBase(path).toLowerCase();
}

export function isGeneratedPath(path: string, file: DiffFile): boolean {
  const lower = path.toLowerCase();
  return (
    file.generated ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('.map')
  );
}

export function isVendoredPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('/vendor/') ||
    lower.startsWith('vendor/') ||
    lower.includes('/vendors/') ||
    lower.startsWith('vendors/') ||
    lower.includes('/third_party/') ||
    lower.includes('/third-party/') ||
    lower.includes('/node_modules/') ||
    lower.startsWith('node_modules/') ||
    lower.includes('/bower_components/') ||
    lower.startsWith('bower_components/')
  );
}

export function isLockPath(path: string): boolean {
  const base = lowerBase(path);
  return (
    base === 'package-lock.json' ||
    base === 'npm-shrinkwrap.json' ||
    base === 'yarn.lock' ||
    base === 'pnpm-lock.yaml' ||
    base === 'cargo.lock' ||
    base === 'gemfile.lock' ||
    base === 'composer.lock' ||
    base === 'go.sum' ||
    base === 'go.work.sum' ||
    base === 'podfile.lock' ||
    base.endsWith('.lock') ||
    base.endsWith('.lock.json')
  );
}

export function isDocsPath(path: string): boolean {
  const lower = path.toLowerCase();
  const base = lowerBase(path);
  return (
    lower.includes('/docs/') ||
    lower.startsWith('docs/') ||
    lower.includes('/documentation/') ||
    base.startsWith('readme') ||
    base.startsWith('changelog') ||
    base.endsWith('.md') ||
    base.endsWith('.mdx')
  );
}

export function isSensitivePath(path: string): boolean {
  const base = lowerBase(path);
  if (
    base === '.env' ||
    (base.startsWith('.env.') &&
      !base.endsWith('.example') &&
      !base.endsWith('.sample') &&
      !base.endsWith('.template'))
  ) {
    return true;
  }
  return (
    base.endsWith('.pem') ||
    base.endsWith('.key') ||
    base.endsWith('.p12') ||
    base === 'id_rsa' ||
    base === 'id_ed25519' ||
    base === '.netrc' ||
    base.endsWith('.tfstate') ||
    (base.startsWith('serviceaccount') && base.endsWith('.json'))
  );
}

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

function includesAny(value: string, markers: readonly string[]): boolean {
  for (const marker of markers) {
    if (value.includes(marker)) {
      return true;
    }
  }
  return false;
}

function isComment(text: string): boolean {
  const trimmed = text.trimStart();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('<!--') ||
    trimmed.startsWith('--')
  );
}

function isAssertionLine(text: string): boolean {
  return includesAny(text.toLowerCase(), TEST_ASSERTION_MARKERS);
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

export function testFileDeleted(context: RuleContext): readonly RuleMatch[] {
  if (context.file.status !== 'deleted' || !context.isTestPath) {
    return [];
  }
  const oldStem = canonicalStem(context.path);
  for (const other of context.allFiles) {
    if (other.id === context.file.id) {
      continue;
    }
    const otherPath = other.newPath ?? other.oldPath ?? other.displayPath;
    if (
      (other.status === 'added' || other.status === 'renamed') &&
      canonicalStem(otherPath) === oldStem
    ) {
      return [];
    }
  }
  return [fileResult()];
}

function findPackageKey(text: string): string | null {
  const start = text.indexOf('"');
  if (start < 0) {
    return null;
  }
  const end = text.indexOf('"', start + 1);
  if (end <= start) {
    return null;
  }
  let cursor = end + 1;
  while (text[cursor] === ' ' || text[cursor] === '\t') {
    cursor += 1;
  }
  if (text[cursor] !== ':') {
    return null;
  }
  cursor += 1;
  while (text[cursor] === ' ' || text[cursor] === '\t') {
    cursor += 1;
  }
  if (text[cursor] !== '"') {
    return null;
  }
  return text.slice(start + 1, end).toLowerCase();
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

function dependencyLine(context: RuleContext, line: RiskLine): boolean {
  const base = lowerBase(context.path);
  if (base === 'package.json') {
    const key = findPackageKey(line.text);
    if (key === null || PACKAGE_META_KEYS.has(key)) {
      return false;
    }
    return !context.removedLines.some((removed) => findPackageKey(removed.text) === key);
  }
  if (base.startsWith('requirements') && base.endsWith('.txt')) {
    return requirementName(line.text) !== null;
  }
  return false;
}

function dangerousShell(text: string): boolean {
  const lower = text.toLowerCase();
  if (isComment(text)) {
    return false;
  }
  const pipedShell =
    (lower.includes('curl') || lower.includes('wget')) &&
    lower.includes('|') &&
    includesAny(lower, [
      ' sh',
      '|sh',
      ' bash',
      '|bash',
      ' zsh',
      '|zsh',
      ' fish',
      '|fish',
      ' pwsh',
      '|pwsh',
    ]);
  if (
    pipedShell ||
    lower.includes('chmod 777') ||
    lower.includes('mkfs') ||
    lower.includes('dd of=/dev/')
  ) {
    return true;
  }
  const remove = lower.indexOf('rm -rf');
  if (remove >= 0) {
    const target = lower.slice(remove + 'rm -rf'.length).trimStart();
    if (
      target === '/' ||
      target === '.' ||
      target.startsWith('/*') ||
      target.startsWith('*') ||
      target.startsWith('$home') ||
      target.startsWith('~') ||
      target.startsWith('..') ||
      target.startsWith('./..')
    ) {
      return true;
    }
  }
  return false;
}

function disabledTls(text: string): boolean {
  if (isComment(text)) {
    return false;
  }
  const lower = text.toLowerCase();
  if (
    lower.includes('node_tls_reject_unauthorized=0') ||
    lower.includes('node_tls_reject_unauthorized = 0') ||
    lower.includes('curl -k') ||
    lower.includes('insecureskipverify: true') ||
    lower.includes('insecureskipverify=true') ||
    lower.includes('verify=false')
  ) {
    return true;
  }
  const reject = lower.indexOf('rejectunauthorized');
  return reject >= 0 && lower.slice(reject).includes('false');
}

function elisionMarker(text: string): boolean {
  if (!isComment(text)) {
    return false;
  }
  const lower = text.toLowerCase();
  if (lower.includes('...') && !includesAny(lower, ['existing code', 'rest of', 'code omitted'])) {
    return false;
  }
  return includesAny(lower, [
    'existing code',
    'rest of the file',
    'rest of file',
    'rest of the code',
    'rest of code',
    'rest of the function',
    'rest of function',
    'unchanged',
    'same as before',
    'same as above',
    'implementation here',
    'code omitted',
  ]);
}

function placeholder(text: string): boolean {
  return (
    text.includes('TODO') ||
    text.includes('FIXME') ||
    text.includes('XXX') ||
    text.includes('HACK') ||
    text.includes('NotImplementedError') ||
    text.includes('todo!(') ||
    text.toLowerCase().includes('not implemented')
  );
}

function disabledTest(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('.only(') ||
    lower.includes('.skip(') ||
    lower.includes('xit(') ||
    lower.includes('pytest.mark.skip') ||
    lower.includes('pytest.mark.xfail') ||
    lower.includes('t.skip') ||
    lower.includes('@disabled') ||
    lower.includes('@ignore')
  );
}

function suppression(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('eslint-disable') ||
    lower.includes('@ts-ignore') ||
    lower.includes('@ts-nocheck') ||
    lower.includes('@ts-expect-error') ||
    lower.includes('type: ignore') ||
    lower.includes('noqa') ||
    lower.includes('nolint')
  );
}

function modeChanged(file: DiffFile): boolean {
  return (
    file.newMode === '100755' ||
    (file.oldMode !== file.newMode && (file.oldMode === '120000' || file.newMode === '120000'))
  );
}

function lowBinaryPath(path: string): boolean {
  const lower = path.toLowerCase();
  return includesAny(lower, [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.ico',
    '.bmp',
    '.ttf',
    '.otf',
    '.woff',
  ]);
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
    const spans = findHiddenSpans(line.text, {
      isNewFile: context.file.status === 'added',
      lineNumber: line.lineNumber ?? undefined,
    });
    if (spans.length > 0) {
      matches.push(lineResult(line));
    }
  }
  if (findHiddenSpans(context.path, { isPath: true }).length > 0) {
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
  return context.candidateAddedLines
    .filter((line) => dependencyLine(context, line))
    .map((line) => lineResult(line));
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

export {
  dangerousShell,
  disabledTls,
  elisionMarker,
  placeholder,
  disabledTest,
  suppression,
  dependencyLine,
  isTestPath,
  lowBinaryPath,
};
