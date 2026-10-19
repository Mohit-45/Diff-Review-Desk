import { LIMITS } from '../limits';

function findBrace(pattern: string): { readonly start: number; readonly end: number } | null {
  let start = -1;
  let depth = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return { start, end: index };
      }
    }
  }
  return null;
}

export function expandBraces(pattern: string): readonly string[] {
  const brace = findBrace(pattern);
  if (brace === null) {
    return [pattern];
  }

  const inside = pattern.slice(brace.start + 1, brace.end);
  const alternatives: string[] = [];
  let partStart = 0;
  let depth = 0;
  for (let index = 0; index <= inside.length; index += 1) {
    const character = inside[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
    } else if ((character === ',' && depth === 0) || index === inside.length) {
      alternatives.push(inside.slice(partStart, index));
      partStart = index + 1;
    }
  }

  if (alternatives.length < 2) {
    return [pattern];
  }

  const prefix = pattern.slice(0, brace.start);
  const suffix = pattern.slice(brace.end + 1);
  const expanded: string[] = [];
  for (const alternative of alternatives) {
    for (const rest of expandBraces(`${alternative}${suffix}`)) {
      expanded.push(`${prefix}${rest}`);
    }
  }
  return expanded;
}

function segmentMatch(pattern: string, value: string): boolean {
  const rows: boolean[] = Array.from({ length: value.length + 1 }, () => false);
  rows[0] = true;

  for (let patternIndex = 0; patternIndex < pattern.length; patternIndex += 1) {
    const character = pattern[patternIndex];
    const next: boolean[] = Array.from({ length: value.length + 1 }, () => false);
    if (character === '*') {
      next[0] = rows[0];
      for (let valueIndex = 1; valueIndex <= value.length; valueIndex += 1) {
        next[valueIndex] = next[valueIndex - 1] === true || rows[valueIndex] === true;
      }
    } else {
      for (let valueIndex = 1; valueIndex <= value.length; valueIndex += 1) {
        next[valueIndex] =
          rows[valueIndex - 1] === true &&
          (character === '?' || character === value[valueIndex - 1]);
      }
    }
    for (let valueIndex = 0; valueIndex <= value.length; valueIndex += 1) {
      rows[valueIndex] = next[valueIndex] ?? false;
    }
  }
  return rows[value.length] ?? false;
}

function splitSegments(value: string): readonly string[] {
  const segments: string[] = [];
  let start = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index === value.length || value[index] === '/') {
      segments.push(value.slice(start, index));
      start = index + 1;
    }
  }
  return segments;
}

function matchSegments(pattern: readonly string[], path: readonly string[]): boolean {
  const rows: boolean[] = Array.from({ length: path.length + 1 }, () => false);
  rows[0] = true;

  for (const segment of pattern) {
    const next: boolean[] = Array.from({ length: path.length + 1 }, () => false);
    if (segment === '**') {
      next[0] = rows[0];
      for (let pathIndex = 1; pathIndex <= path.length; pathIndex += 1) {
        next[pathIndex] = next[pathIndex - 1] === true || rows[pathIndex] === true;
      }
    } else {
      for (let pathIndex = 1; pathIndex <= path.length; pathIndex += 1) {
        next[pathIndex] =
          rows[pathIndex - 1] === true && segmentMatch(segment, path[pathIndex - 1] ?? '');
      }
    }
    for (let pathIndex = 0; pathIndex <= path.length; pathIndex += 1) {
      rows[pathIndex] = next[pathIndex] ?? false;
    }
  }

  return rows[path.length] ?? false;
}

export function globMatch(pattern: string, path: string): boolean {
  if (path.length > LIMITS.maxPathChars) {
    return false;
  }
  return matchSegments(splitSegments(pattern), splitSegments(path));
}

export function matchesAnyGlob(path: string, patterns: readonly string[]): boolean {
  if (path.length > LIMITS.maxPathChars) {
    return false;
  }
  for (const pattern of patterns) {
    for (const expanded of expandBraces(pattern)) {
      if (globMatch(expanded, path)) {
        return true;
      }
    }
  }
  return false;
}

export const matchesGlob = globMatch;

export const TEST_GLOBS = [
  '**/*.{test,spec}.*',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/*_test.{go,py,rs}',
  '**/test_*.py',
  '**/*Test.java',
] as const;

export function isTestPath(path: string): boolean {
  return matchesAnyGlob(path, TEST_GLOBS);
}
