// Line-level reading of a package.json entry, so dependency-added matches a version spec and not any string.

export type PackageEntry = {
  readonly key: string;
  readonly value: string;
};

// Metadata keys never name a dependency. The URL-valued ones are listed because a URL is a valid
// dependency spec, so "homepage": "https://..." would otherwise look like one.
const NON_DEPENDENCY_KEYS = new Set([
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
  'homepage',
  'url',
  'repository',
  'bugs',
  'funding',
]);

// A bare word is a dist-tag only when it is one of these, so a script such as "build": "tsc" is not.
const DIST_TAGS = new Set([
  'latest',
  'next',
  'beta',
  'alpha',
  'canary',
  'rc',
  'nightly',
  'experimental',
  'stable',
  'dev',
]);

const SPEC_PREFIXES = [
  'git+',
  'git://',
  'github:',
  'gitlab:',
  'bitbucket:',
  'http://',
  'https://',
  'file:',
  'link:',
  'portal:',
  'workspace:',
  'npm:',
] as const;

const RANGE_OPERATORS = '^~<>=';

function skipBlanks(text: string, from: number): number {
  let cursor = from;
  while (text[cursor] === ' ' || text[cursor] === '\t') {
    cursor += 1;
  }
  return cursor;
}

function readQuoted(text: string, quote: number): { value: string; end: number } | null {
  const close = text.indexOf('"', quote + 1);
  if (close < 0) {
    return null;
  }
  const value = text.slice(quote + 1, close);
  return value.includes('\\') ? null : { value, end: close + 1 };
}

/** Reads a whole line shaped `"<key>": "<string>"` with an optional trailing comma. */
export function parsePackageEntry(text: string): PackageEntry | null {
  const start = skipBlanks(text, 0);
  if (text[start] !== '"') {
    return null;
  }
  const key = readQuoted(text, start);
  if (key === null) {
    return null;
  }
  const colon = skipBlanks(text, key.end);
  if (text[colon] !== ':') {
    return null;
  }
  const valueStart = skipBlanks(text, colon + 1);
  const value = text[valueStart] === '"' ? readQuoted(text, valueStart) : null;
  if (value === null) {
    return null;
  }
  const after = skipBlanks(text, value.end);
  const end = text[after] === ',' ? skipBlanks(text, after + 1) : after;
  return end === text.length ? { key: key.value.toLowerCase(), value: value.value } : null;
}

function isDigits(part: string): boolean {
  if (part.length === 0) {
    return false;
  }
  for (const character of part) {
    if (character < '0' || character > '9') {
      return false;
    }
  }
  return true;
}

function isLabel(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  for (const character of text) {
    const isAlphanumeric =
      (character >= '0' && character <= '9') ||
      (character >= 'a' && character <= 'z') ||
      (character >= 'A' && character <= 'Z');
    if (!isAlphanumeric && character !== '.' && character !== '-') {
      return false;
    }
  }
  return true;
}

function isVersionPart(part: string): boolean {
  return isDigits(part) || part === 'x' || part === 'X' || part === '*';
}

/** `1`, `1.2`, `1.2.3`, `1.x`, `*`, with an optional `v`, prerelease and build suffix. */
function isVersionCore(token: string): boolean {
  const unprefixed = token.startsWith('v') || token.startsWith('=') ? token.slice(1) : token;
  const plus = unprefixed.indexOf('+');
  const withoutBuild = plus < 0 ? unprefixed : unprefixed.slice(0, plus);
  if (plus >= 0 && !isLabel(unprefixed.slice(plus + 1))) {
    return false;
  }
  const dash = withoutBuild.indexOf('-');
  const core = dash < 0 ? withoutBuild : withoutBuild.slice(0, dash);
  if (dash >= 0 && !isLabel(withoutBuild.slice(dash + 1))) {
    return false;
  }
  const parts = core.split('.');
  return parts.length <= 3 && parts.every(isVersionPart);
}

function stripOperator(token: string): string {
  let cursor = 0;
  while (cursor < token.length && cursor < 2 && RANGE_OPERATORS.includes(token.charAt(cursor))) {
    cursor += 1;
  }
  return token.slice(cursor);
}

function isOperatorOnly(token: string): boolean {
  return token.length > 0 && stripOperator(token).length === 0;
}

/** One `||` alternative: space-separated comparators, `>= 1.0.0` and `1.0.0 - 2.0.0` included. */
function isComparatorSet(set: string): boolean {
  const tokens = set
    .split(' ')
    .flatMap((part) => part.split('\t'))
    .filter((token) => token.length > 0);
  let versions = 0;
  for (const [index, token] of tokens.entries()) {
    if (token === '-' && index > 0 && index < tokens.length - 1) {
      continue;
    }
    if (isOperatorOnly(token)) {
      if (index === tokens.length - 1) {
        return false;
      }
      continue;
    }
    if (!isVersionCore(stripOperator(token))) {
      return false;
    }
    versions += 1;
  }
  return versions > 0;
}

function hasWhitespace(value: string): boolean {
  for (const char of value) {
    if (char.trim() === '') {
      return true;
    }
  }
  return false;
}

export function isVersionSpec(value: string): boolean {
  const spec = value.trim();
  if (spec.length === 0) {
    return false;
  }
  const lower = spec.toLowerCase();
  if (DIST_TAGS.has(lower)) {
    return true;
  }
  if (SPEC_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return !hasWhitespace(spec);
  }
  return spec.split('||').every(isComparatorSet);
}

/** True for an added line that declares a dependency, unless its key also appears in removed lines. */
export function isAddedDependency(text: string, removedKeys: ReadonlySet<string>): boolean {
  const entry = parsePackageEntry(text);
  return (
    entry !== null &&
    !NON_DEPENDENCY_KEYS.has(entry.key) &&
    !removedKeys.has(entry.key) &&
    isVersionSpec(entry.value)
  );
}
