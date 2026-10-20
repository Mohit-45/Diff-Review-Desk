import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/core/limits';

const ROOT = resolve(import.meta.dirname, '..');
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
  '.zip',
  '.gz',
  '.mp4',
  '.webm',
]);

type TextFile = {
  readonly path: string;
  readonly text: string;
  readonly lines: readonly string[];
};

function isBinaryExtension(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && BINARY_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** Text that is not valid UTF-8 is treated as binary and skipped. */
function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function collectFiles(directory: string, found: TextFile[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) collectFiles(join(directory, entry.name), found);
      continue;
    }
    if (!entry.isFile() || isBinaryExtension(entry.name)) continue;
    const absolute = join(directory, entry.name);
    const text = decodeText(readFileSync(absolute));
    if (text === null) continue;
    const path = relative(ROOT, absolute).split(sep).join('/');
    found.push({ path, text, lines: text.split('\n') });
  }
}

const FILES: readonly TextFile[] = (() => {
  const found: TextFile[] = [];
  collectFiles(ROOT, found);
  return found;
})();

function readText(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function lineViolations(
  files: readonly TextFile[],
  test: (line: string, path: string) => string | null,
): readonly string[] {
  const violations: string[] = [];
  for (const file of files) {
    file.lines.forEach((line, index) => {
      const problem = test(line, file.path);
      if (problem !== null) violations.push(`${file.path}:${String(index + 1)} ${problem}`);
    });
  }
  return violations;
}

function codePointLabel(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

const isTestFile = (path: string): boolean =>
  /\.test\.[jt]sx?$/u.test(path) || /^tests\//u.test(path);
const isSource = (path: string): boolean => path.startsWith('src/');
const isExemptFromCommentRules = (path: string): boolean =>
  isTestFile(path) || path.startsWith('src/core/risk/rules/') || path.startsWith('src/samples/');

describe('repository hygiene: files', () => {
  it('walks a non-trivial tree and skips generated directories', () => {
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES.some((file) => file.path.startsWith('node_modules/'))).toBe(false);
    expect(FILES.some((file) => file.path.startsWith('dist/'))).toBe(false);
    expect(FILES.some((file) => file.path.startsWith('coverage/'))).toBe(false);
    expect(FILES.some((file) => file.path.startsWith('.git/'))).toBe(false);
  });

  it('has no machine paths outside docs/SPEC.md', () => {
    const needles = [
      ['/Us', 'ers/'],
      ['/ho', 'me/'],
      ['/ro', 'ot/'],
      ['/pri', 'vate/'],
      ['/var/', 'folders/'],
      ['file', ':/', '/'],
    ].map((parts) => parts.join(''));
    const windowsBackslash = /(?<![A-Za-z0-9_])[A-Za-z]:\\{1,2}[A-Za-z0-9_$.]/u;
    const windowsSlash = /(?<![A-Za-z0-9_])[A-Za-z]:\/(?:Users|Windows|Program Files)\b/u;
    const files = FILES.filter((file) => file.path !== 'docs/SPEC.md');
    const violations = lineViolations(files, (line) => {
      const needle = needles.find((candidate) => line.includes(candidate));
      if (needle !== undefined) return `contains the machine path "${needle}"`;
      if (windowsBackslash.test(line) || windowsSlash.test(line)) {
        return 'contains a Windows drive path';
      }
      return null;
    });
    expect(violations).toEqual([]);
  });

  it('has no token-shaped strings outside src/samples/fakeSecrets.ts', () => {
    const shapes: readonly { readonly name: string; readonly pattern: RegExp }[] = [
      { name: 'AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u },
      { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/u },
      { name: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/u },
      { name: 'Slack token', pattern: /\bxox[abeprs]-[A-Za-z0-9-]{10,}/u },
      {
        name: 'Slack webhook',
        pattern: /hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+/u,
      },
      {
        name: 'OpenAI or Anthropic key',
        pattern: /\bsk-(?:proj|ant|live|test)?-?[A-Za-z0-9_-]{20,}/u,
      },
      { name: 'Stripe key', pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{8,}/u },
      { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{30,}/u },
      { name: 'GitLab token', pattern: /\bglpat-[A-Za-z0-9_-]{16,}/u },
      { name: 'npm token', pattern: /\bnpm_[A-Za-z0-9]{30,}/u },
      { name: 'JSON web token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./u },
      {
        name: 'private key block',
        pattern: /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----\s*[A-Za-z0-9+/=]{40,}/u,
      },
    ];
    const files = FILES.filter((file) => file.path !== 'src/samples/fakeSecrets.ts');
    const violations = lineViolations(files, (line) => {
      const shape = shapes.find((candidate) => candidate.pattern.test(line));
      return shape === undefined ? null : `looks like a ${shape.name}; build it at runtime`;
    });
    const multiline = files.flatMap((file) =>
      /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----\s*[A-Za-z0-9+/=]{40,}/u.test(file.text)
        ? [`${file.path} contains a private key block; build it at runtime`]
        : [],
    );
    expect([...violations, ...multiline]).toEqual([]);
  });

  it('has no format, control, NUL or other C0/C1 characters in any text file', () => {
    const violations = lineViolations(FILES, (line) => {
      const found = new Set<string>();
      for (const char of line) {
        if (char === '\t') continue;
        if (/[\p{Cf}\p{Cc}]/u.test(char)) found.add(codePointLabel(char));
      }
      if (found.size === 0) return null;
      return `contains raw ${[...found].join(', ')}; use a \\u{...} escape or a placeholder`;
    });
    expect(violations).toEqual([]);
  });

  it('has no TODO, FIXME, HACK or XXX comments and no localStorage.clear in src', () => {
    const marker = /(?:\/\/|\/\*|^\s*\*)[^\n]*\b(?:TODO|FIXME|HACK|XXX)\b/u;
    const files = FILES.filter(
      (file) => isSource(file.path) && !isExemptFromCommentRules(file.path),
    );
    const violations = lineViolations(files, (line) => {
      if (marker.test(line)) return 'has a TODO, FIXME, HACK or XXX comment';
      if (/\blocalStorage\.clear\b/u.test(line)) return 'calls localStorage.clear';
      return null;
    });
    expect(violations).toEqual([]);
  });

  it('has at most two real eslint-disable directives, each with a reason', () => {
    const directive =
      /(?:^|\s)(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?(?=[\s*]|$)(.*)$/u;
    const found: { readonly where: string; readonly reasoned: boolean }[] = [];
    for (const file of FILES) {
      file.lines.forEach((line, index) => {
        const match = directive.exec(line);
        if (match === null) return;
        const where = `${file.path}:${String(index + 1)}`;
        found.push({ where, reasoned: /\s--\s+\S/u.test(match[1] ?? '') });
      });
    }
    const where = found.map((entry) => entry.where).join('; ');
    expect(found.length, `eslint-disable directives at: ${where}`).toBeLessThanOrEqual(2);
    const unreasoned = found.filter((entry) => !entry.reasoned).map((entry) => entry.where);
    expect(unreasoned, 'every eslint-disable needs a " -- reason"').toEqual([]);
  });
});

describe('repository hygiene: configuration', () => {
  it('keeps .npmrc safe and free of registry lines', () => {
    const lines = readText('.npmrc')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith(';'));
    expect(lines).toEqual(expect.arrayContaining(['ignore-scripts=true']));
    expect(lines).toEqual(expect.arrayContaining(['save-exact=true', 'fund=false', 'audit=false']));
    const registryLines = lines.filter((line) =>
      /registry|_auth|_password|:_authToken/iu.test(line),
    );
    expect(registryLines).toEqual([]);
  });

  it('has a v3 lockfile with registry-only resolved URLs and linux native entries', () => {
    const lock = JSON.parse(readText('package-lock.json')) as {
      readonly lockfileVersion?: number;
      readonly packages?: Readonly<Record<string, { readonly resolved?: string }>>;
    };
    expect(lock.lockfileVersion).toBe(3);
    const packages = lock.packages ?? {};
    const outside = Object.entries(packages).flatMap(([name, entry]) =>
      entry.resolved === undefined || entry.resolved.startsWith('https://registry.npmjs.org/')
        ? []
        : [`${name} resolves to ${entry.resolved}`],
    );
    expect(outside).toEqual([]);
    const names = Object.keys(packages);
    const families: readonly (readonly [string, readonly string[]])[] = [
      ['node_modules/@rolldown/binding-linux-', ['x64-gnu', 'arm64-gnu']],
      ['node_modules/@rollup/rollup-linux-', ['x64-gnu', 'arm64-gnu']],
      ['node_modules/@esbuild/linux-', ['x64', 'arm64']],
    ];
    const missing = families.flatMap(([prefix, suffixes]) =>
      prefix.includes('rolldown') || names.some((name) => name.startsWith(prefix))
        ? suffixes.map((suffix) => `${prefix}${suffix}`).filter((name) => !names.includes(name))
        : [],
    );
    expect(missing, 'lockfile lacks linux optional native packages').toEqual([]);
  });

  it('pins one Node version in .nvmrc and the Dockerfile', () => {
    const dockerfile = readText('Dockerfile');
    const arg = /^ARG NODE_VERSION=(\S+)$/mu.exec(dockerfile)?.[1];
    expect(arg).toBeDefined();
    expect(readText('.nvmrc').trim()).toBe(arg);
  });

  it('keeps the Dockerfile on a non-root user and the documented commands', () => {
    const dockerfile = readText('Dockerfile');
    expect(dockerfile).toMatch(/^USER node$/mu);
    expect(dockerfile).toMatch(/^RUN npm ci\b/mu);
    expect(dockerfile).toMatch(/^RUN npm run build$/mu);
    expect(dockerfile).toMatch(/^CMD \["npm",\s*"start"\]$/mu);
  });

  it('lists the required ignore entries', () => {
    const entries = (text: string): readonly string[] =>
      text
        .split('\n')
        .map((line) => line.trim().replace(/^\//u, '').replace(/\/$/u, ''))
        .filter((line) => line !== '' && !line.startsWith('#'));
    const dockerignore = entries(readText('.dockerignore'));
    const gitignore = entries(readText('.gitignore'));
    const envEntries = ['.env', '.env.*', '!.env.example'];
    expect(dockerignore).toEqual(
      expect.arrayContaining(['node_modules', 'dist', 'coverage', '.git', ...envEntries]),
    );
    expect(gitignore).toEqual(
      expect.arrayContaining([
        'node_modules',
        'dist',
        'coverage',
        '.vite',
        '*.tsbuildinfo',
        '*.log',
        '.DS_Store',
        ...envEntries,
      ]),
    );
  });

  it('ships .env.example, LICENSE and the CI workflow', () => {
    expect(readText('.env.example')).toMatch(/^HOST=/mu);
    expect(readText('.env.example')).toMatch(/^PORT=/mu);
    expect(existsSync(join(ROOT, 'LICENSE'))).toBe(true);
    expect(existsSync(join(ROOT, '.github/workflows/ci.yml'))).toBe(true);
  });
});

const LIMIT_ROWS: Readonly<Record<string, keyof typeof LIMITS>> = {
  'Input bytes': 'maxInputBytes',
  Files: 'maxFiles',
  'Diff lines': 'maxTotalDiffLines',
  'Header line characters': 'maxHeaderLineChars',
  'Warnings retained': 'maxWarnings',
  'Review records': 'maxReviewRecords',
  'Saved diff characters': 'maxSavedDiffChars',
  'Review record characters': 'maxRecordChars',
  'Comment characters': 'maxCommentChars',
  'Overall note characters': 'maxOverallNoteChars',
  'Review label characters': 'maxLabelChars',
  'Path characters for glob matching': 'maxPathChars',
  'Hunk section characters': 'maxSectionChars',
  'Rule scan characters per line': 'maxLineScanChars',
  'Display characters per long line': 'maxLineChars',
  'Render lines per hunk page': 'maxHunkRenderLines',
  'Render hunks per file window': 'maxFileRenderHunks',
  'Lines per Show all action': 'maxShowAllLines',
  'Feedback excerpt lines': 'maxExcerptLines',
  'Feedback excerpt characters': 'maxExcerptChars',
};

function stripCode(markdown: string): string {
  return markdown.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gmu, '').replace(/`[^`\n]*`/gu, '');
}

function parseLimitValue(cell: string): number {
  const mebibytes = /^(\d+) MiB$/u.exec(cell);
  return mebibytes === null ? Number(cell.replaceAll(',', '')) : Number(mebibytes[1]) * 1024 * 1024;
}

describe('repository hygiene: README', () => {
  const readme = readText('README.md');
  const prose = stripCode(readme);

  it('has the required h2 sections', () => {
    const headings = [...prose.matchAll(/^## (.+?)\s*$/gmu)].map((match) => match[1] ?? '');
    const required = [
      'Setup',
      'Run',
      'Test',
      'Docker',
      'Keyboard shortcuts',
      'Privacy',
      'What this is not',
      'Architecture',
      'Limitations',
    ];
    const missing = required.filter(
      (name) => !headings.some((heading) => heading === name || heading.startsWith(`${name} `)),
    );
    expect(missing, 'README is missing h2 sections').toEqual([]);
  });

  it('has a Limits table equal to LIMITS', () => {
    const section = /^## Limits\s*$([\s\S]*?)(?=^## )/mu.exec(readme)?.[1] ?? '';
    const rows = section
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      )
      .filter((cells) => cells.length === 2 && !/^:?-+:?$/u.test(cells[0] ?? ''))
      .filter((cells) => cells[0] !== 'Limit');
    const documented: Record<string, number> = {};
    const unknown: string[] = [];
    for (const [label = '', value = ''] of rows) {
      const key = LIMIT_ROWS[label];
      if (key === undefined) unknown.push(`README Limits row "${label}" has no LIMITS key`);
      else documented[key] = parseLimitValue(value);
    }
    expect(unknown).toEqual([]);
    expect(documented).toEqual(LIMITS);
    expect(Object.keys(LIMIT_ROWS).length).toBe(Object.keys(LIMITS).length);
  });

  it('links only to files that exist', () => {
    const broken: string[] = [];
    for (const match of prose.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)) {
      const target = match[1] ?? '';
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/iu.test(target)) continue;
      const path = decodeURIComponent(target.split('#')[0]?.split('?')[0] ?? '');
      if (path === '') continue;
      if (!existsSync(resolve(ROOT, dirname('README.md'), path))) {
        broken.push(`README.md links to missing "${target}"`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('mentions only npm scripts that exist', () => {
    const scripts = Object.keys(
      (JSON.parse(readText('package.json')) as { readonly scripts?: Record<string, string> })
        .scripts ?? {},
    );
    const unknown = [...readme.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/gu)]
      .map((match) => match[1] ?? '')
      .filter((name) => !scripts.includes(name))
      .map((name) => `README.md mentions "npm run ${name}" which is not a package.json script`);
    expect(unknown).toEqual([]);
  });
});
