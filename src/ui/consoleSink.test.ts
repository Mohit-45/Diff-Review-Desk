import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(ROOT, 'src');
const SINK = 'src/ui/reportUnexpected.ts';

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

describe('RV-RENDER-CRASH reportUnexpected is the only console sink', () => {
  it('has no console call in the app source outside src/ui/reportUnexpected.ts', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(ROOT, path))
      .filter((path) => path !== SINK)
      .filter((path) => /\bconsole\s*\./u.test(readFileSync(join(ROOT, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps exactly one console.error, and it is in the sink', () => {
    const text = readFileSync(join(ROOT, SINK), 'utf8');
    expect(text.match(/console\.error\(/gu)).toHaveLength(1);
    expect(text).not.toMatch(/console\.(log|warn|info|debug)\(/u);
  });
});
