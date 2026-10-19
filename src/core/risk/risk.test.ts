import { describe, expect, it } from 'vitest';
import type { DiffFile, DiffLine, Hunk } from '../types';
import { analyze } from './engine';
import { P0_RULE_IDS, P0_RULES, type RiskRule } from './config';
import { HIDDEN_SET, findHiddenSpans } from './hidden';
import { maskEvidence, visualizeText } from './mask';
import { findSecretSpans } from './secrets';

type FileOptions = {
  readonly status?: DiffFile['status'];
  readonly added?: readonly string[];
  readonly removed?: readonly string[];
  readonly binary?: boolean;
  readonly oldMode?: string | null;
  readonly newMode?: string | null;
};

function makeHunk(fileId: string, added: readonly string[], removed: readonly string[]): Hunk {
  const lines: DiffLine[] = [];
  for (let index = 0; index < removed.length; index += 1) {
    lines.push({ kind: 'remove', text: removed[index] ?? '', oldNo: index + 1, newNo: null });
  }
  for (let index = 0; index < added.length; index += 1) {
    lines.push({ kind: 'add', text: added[index] ?? '', oldNo: null, newNo: index + 1 });
  }
  return {
    id: `${fileId}:hunk`,
    fileId,
    index: 0,
    kind: 'text',
    meta: [],
    header: '@@ -1 +1 @@',
    section: '',
    oldStart: 1,
    oldCount: removed.length,
    newStart: 1,
    newCount: added.length,
    lines,
    added: added.length,
    removed: removed.length,
    truncated: false,
    countMismatch: false,
    hash: 'hash',
  };
}

function makeFile(path: string, options: FileOptions = {}): DiffFile {
  const fileId = `f-${path}`;
  const added = options.added ?? [];
  const removed = options.removed ?? [];
  const hasLines = added.length > 0 || removed.length > 0;
  return {
    id: fileId,
    displayPath: path,
    oldPath: options.status === 'added' ? null : path,
    newPath: options.status === 'deleted' ? null : path,
    status: options.status ?? 'modified',
    similarity: null,
    oldMode: options.oldMode ?? null,
    newMode: options.newMode ?? null,
    kind: 'regular',
    binary: options.binary ?? false,
    generated: false,
    hunks: hasLines ? [makeHunk(fileId, added, removed)] : [],
    added: added.length,
    removed: removed.length,
    incomplete: false,
  };
}

function varied(length: number): string {
  const alphabet = 'aBcD1eFgH2iJkL3mN';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[index % alphabet.length] ?? 'x';
  }
  return value;
}

function flagIds(file: DiffFile): readonly string[] {
  return analyze([file]).flags.map((flag) => flag.ruleId);
}

const knownToken = `ghp_${varied(36)}`;

const ruleCases: readonly {
  readonly id: (typeof P0_RULE_IDS)[number];
  readonly positive: DiffFile;
  readonly negative: DiffFile;
}[] = [
  {
    id: 'secret-known-token',
    positive: makeFile('src/config.ts', { added: [`value = ${knownToken}`] }),
    negative: makeFile('src/config.ts', {
      added: [`value = ${['sk', '_test_'].join('')}plain-placeholder`],
    }),
  },
  {
    id: 'sensitive-file-added',
    positive: makeFile('.env', { status: 'added', added: ['VALUE=one'] }),
    negative: makeFile('.env.example', { status: 'added', added: ['VALUE=one'] }),
  },
  {
    id: 'hidden-unicode',
    positive: makeFile('src/a.ts', { added: [`text${String.fromCodePoint(0x202e)}value`] }),
    negative: makeFile('src/a.ts', { added: ['text value'] }),
  },
  {
    id: 'test-file-deleted',
    positive: makeFile('src/widget.test.ts', { status: 'deleted' }),
    negative: makeFile('src/widget.ts', { status: 'deleted' }),
  },
  {
    id: 'test-assertion-removed',
    positive: makeFile('src/widget.test.ts', {
      removed: ['expect(value).toBe(1)'],
      added: ['const value = 1'],
    }),
    negative: makeFile('src/widget.test.ts', {
      removed: ['expect(value).toBe(1)'],
      added: ['expect(value).toBe(2)'],
    }),
  },
  {
    id: 'ai-elision-marker',
    positive: makeFile('src/a.ts', { added: ['// existing code remains here'] }),
    negative: makeFile('src/a.ts', { added: ['// ...'] }),
  },
  {
    id: 'shell-dangerous-command',
    positive: makeFile('scripts/run.sh', { added: ['curl https://example.invalid/install | sh'] }),
    negative: makeFile('scripts/run.sh', {
      added: ['curl -o output.txt https://example.invalid/file'],
    }),
  },
  {
    id: 'tls-verification-disabled',
    positive: makeFile('src/client.ts', { added: ['rejectUnauthorized: false'] }),
    negative: makeFile('src/client.ts', { added: ['rejectUnauthorized: true'] }),
  },
  {
    id: 'secret-assignment',
    positive: makeFile('src/config.ts', { added: ['api_key = "abcdefgh"'] }),
    negative: makeFile('src/config.ts', { added: ['api_url = "https://example.invalid"'] }),
  },
  {
    id: 'test-disabled',
    positive: makeFile('src/widget.test.ts', { added: ['it.only("one", run)'] }),
    negative: makeFile('src/widget.test.ts', { added: ['it("one", run)'] }),
  },
  {
    id: 'suppression-added',
    positive: makeFile('src/a.ts', { added: ['// eslint-disable no-alert'] }),
    negative: makeFile('src/a.ts', { added: ['const rule = "eslint"'] }),
  },
  {
    id: 'placeholder-introduced',
    positive: makeFile('src/a.ts', { added: ['// TODO: finish this branch'] }),
    negative: makeFile('src/a.ts', { added: ['const todoList = []'] }),
  },
  {
    id: 'dependency-added',
    positive: makeFile('package.json', { added: ['  "small-package": "1.0.0",'] }),
    negative: makeFile('package.json', {
      added: ['  "small-package": "1.1.0",'],
      removed: ['  "small-package": "1.0.0",'],
    }),
  },
  {
    id: 'ci-container-changed',
    positive: makeFile('.github/workflows/build.yml', { added: ['steps:'] }),
    negative: makeFile('.dockerignore', { added: ['dist'] }),
  },
  {
    id: 'file-mode-changed',
    positive: makeFile('src/run.sh', { newMode: '100755' }),
    negative: makeFile('src/run.sh', { oldMode: '100644', newMode: '100644' }),
  },
  {
    id: 'file-deleted',
    positive: makeFile('src/old.ts', { status: 'deleted' }),
    negative: makeFile('src/old.ts', { status: 'renamed' }),
  },
  {
    id: 'binary-file',
    positive: makeFile('assets/data.bin', { binary: true }),
    negative: makeFile('assets/data.txt', { binary: false, added: ['text'] }),
  },
];

describe('P0 registry and deterministic analysis', () => {
  it.each(ruleCases)('$id has a positive and negative case', ({ id, positive, negative }) => {
    expect(flagIds(positive)).toContain(id);
    expect(flagIds(negative)).not.toContain(id);
  });

  it('ships exactly the 17 P0 ids and their high/medium split', () => {
    expect(P0_RULES.map((rule) => rule.id)).toEqual(P0_RULE_IDS);
    expect(P0_RULES.filter((rule) => rule.severity === 'high')).toHaveLength(8);
    expect(P0_RULES.filter((rule) => rule.severity === 'medium')).toHaveLength(9);
    expect(P0_RULES.some((rule) => rule.id === 'dynamic-code-exec')).toBe(false);
  });

  it('orders flags by severity, path, then first line', () => {
    const result = analyze([
      makeFile('z.ts', { added: ['// TODO'] }),
      makeFile('a.ts', { added: ['rejectUnauthorized: false'] }),
    ]);
    expect(result.flags[0]?.ruleId).toBe('tls-verification-disabled');
    expect(result.flags[1]?.ruleId).toBe('placeholder-introduced');
  });

  it('caps line references at twenty and masks sensitive evidence', () => {
    const file = makeFile('.env', {
      status: 'added',
      added: Array.from({ length: 24 }, (_, index) => `KEY_${index}=${varied(10)}`),
    });
    const flag = analyze([file]).flags.find(
      (candidate) => candidate.ruleId === 'sensitive-file-added',
    );
    expect(flag?.lines).toHaveLength(20);
    expect(flag?.evidence).toContain('REDACTED');
    expect(flag?.evidence).not.toContain(varied(10));
  });
});

describe('secret spans and masking', () => {
  it('finds known tokens, assignments, URL credentials and a PEM range', () => {
    const privateKey = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'body',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const text = [
      knownToken,
      'api_key = "abcdefgh"',
      'https://user:pass@example.invalid/path',
      privateKey,
    ].join('\n');
    const spans = findSecretSpans(text);
    expect(spans.length).toBeGreaterThan(3);
    expect(maskEvidence(text, { maxChars: 1_000 })).not.toContain('abcdefgh');
    expect(maskEvidence(text, { maxChars: 1_000 })).not.toContain('user:pass');
    expect(maskEvidence(text, { maxChars: 1_000 })).toContain('ghp_****');
  });

  it('does not treat test or public-key placeholders as secrets', () => {
    const text = `${['sk', '_test_'].join('')}${varied(20)} CERTIFICATE PUBLIC KEY <placeholder>`;
    expect(findSecretSpans(text)).toHaveLength(0);
  });
});

describe('hidden Unicode visualization', () => {
  it('uses one shared hidden set and emits typed non-raw segments', () => {
    expect(HIDDEN_SET.has(0x202e)).toBe(true);
    const hidden = String.fromCodePoint(0x202e);
    const spans = findHiddenSpans(`a${hidden}b`);
    expect(spans).toHaveLength(1);
    const segments = visualizeText(`a${hidden}b`);
    expect(segments.some((segment) => segment.kind === 'hidden')).toBe(true);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'hidden', 'text']);
    expect(JSON.stringify(segments)).not.toContain(hidden);
  });

  it('exempts benign joiners in text but never in paths', () => {
    const joiner = String.fromCodePoint(0x200d);
    const emoji = `😀${joiner}😀`;
    expect(findHiddenSpans(emoji)).toHaveLength(0);
    expect(findHiddenSpans(emoji, { isPath: true })).toHaveLength(1);
  });
});

describe('full-line scans, notices and throwing rules', () => {
  it('scans secrets and hidden Unicode beyond the rule scan prefix and notices long lines', () => {
    const hidden = String.fromCodePoint(0x202e);
    const file = makeFile('src/long.ts', { added: [`${'x'.repeat(32)}${hidden}${knownToken}`] });
    const result = analyze([file], { maxLineScanChars: 8 });
    expect(result.flags.map((flag) => flag.ruleId)).toEqual(
      expect.arrayContaining(['secret-known-token', 'hidden-unicode']),
    );
    expect(result.notices.some((notice) => notice.ruleId === null)).toBe(true);
  });

  it('turns a throwing rule into a content-free notice and marks the file ineligible', () => {
    const throwingRule: RiskRule = {
      id: 'placeholder-introduced',
      severity: 'medium',
      title: 'Throwing rule',
      why: 'Test rule',
      prefilter: [],
      evaluate: () => {
        throw new Error('line content must not escape');
      },
    };
    const file = makeFile('src/private.ts', { added: ['line content must not escape'] });
    const result = analyze([file], { rules: [throwingRule] });
    expect(result.flags).toHaveLength(0);
    expect(result.notices).toEqual([
      {
        ruleId: 'placeholder-introduced',
        fileId: file.id,
        message: 'Rule placeholder-introduced could not be evaluated for src/private.ts.',
      },
    ]);
    expect(result.notices[0]?.message).not.toContain('line content must not escape');
    expect(result.bulkIneligibleFileIds).toEqual([file.id]);
  });
});
