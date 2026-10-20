import { describe, expect, it } from 'vitest';
import type { DiffFile, Hunk } from '../types';
import { findSecretSpans } from '../risk/secrets';
import {
  clipEscaped,
  isSensitivePath,
  redactHunkLines,
  redactTextWithCount,
  sanitizeSingleLine,
  sanitizeText,
} from './redact';

const KNOWN_TOKEN = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
// Built from pieces so that no machine-looking path literal sits in the source.
const MACHINE_PATH = ['/Us', 'ers/someone/project/file.ts'].join('');
const HOME_ROUTE = ['/ho', 'me/list'].join('');
const FILE_URL = ['file', ':///etc/hosts'].join('');
const PGP_BEGIN = ['-----BEGIN ', 'PGP PRIVATE KEY BLOCK', '-----'].join('');
const PGP_END = ['-----END ', 'PGP PRIVATE KEY BLOCK', '-----'].join('');
const MARKER = '[REDACTED:secret-known-token]';
const WINDOWS_ENV_PATH = ['C', ':\\proj\\.ENV'].join('');

function lineHunk(...texts: string[]): Hunk {
  return {
    id: 'f00000000000:h',
    fileId: 'f00000000000',
    index: 0,
    kind: 'text',
    meta: [],
    header: null,
    section: '',
    oldStart: 1,
    oldCount: texts.length,
    newStart: 1,
    newCount: texts.length,
    lines: texts.map((text, index) => ({ kind: 'add', text, oldNo: null, newNo: index + 1 })),
    added: texts.length,
    removed: 0,
    truncated: false,
    countMismatch: false,
    hash: 'h',
  };
}

function fileNamed(path: string): DiffFile {
  return {
    id: 'f00000000000',
    displayPath: path,
    oldPath: path,
    newPath: path,
    status: 'added',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated: false,
    hunks: [],
    added: 0,
    removed: 0,
    incomplete: false,
  };
}

describe('redaction rules', () => {
  it('replaces known tokens, URL credentials, bearer headers and webhooks with rule ids', () => {
    expect(redactTextWithCount(`k=${KNOWN_TOKEN}`)).toEqual({
      text: 'k=[REDACTED:secret-known-token]',
      count: 1,
    });
    const url = redactTextWithCount('open https://user:hunter22@example.invalid/db now');
    expect(url.text).toBe('open https://[REDACTED:secret-known-token]@example.invalid/db now');
    const bearer = redactTextWithCount('Authorization: Bearer abc.def-ghi');
    expect(bearer).toEqual({
      text: 'Authorization: Bearer [REDACTED:secret-known-token]',
      count: 1,
    });
  });

  it('keeps repeated-character bodies, which are not real tokens', () => {
    const text = `k=AKIA${'A'.repeat(16)}`;
    expect(redactTextWithCount(text)).toEqual({ text, count: 0 });
  });

  it('redacts quoted values of secret-like names but not placeholders or short values', () => {
    expect(redactTextWithCount('password = "correct-horse-battery"').text).toBe(
      'password = "[REDACTED:secret-assignment]"',
    );
    expect(redactTextWithCount('password = "changeme"').count).toBe(0);
    expect(redactTextWithCount('password = "short"').count).toBe(0);
    expect(redactTextWithCount('password = "your-password-here"').count).toBe(0);
  });

  it('EX-REDACT-SECRETS-ONLY leaves URLs, relative imports, shebangs, paths and author lines alone', () => {
    for (const text of [
      'const u = "https://example.com/api/v1";',
      `fetch("http://localhost:3000${HOME_ROUTE}")`,
      'ssh://git@example.invalid/team/repo.git',
      "import { x } from '../lib/format';",
      '#!/usr/bin/env node',
      `see ${MACHINE_PATH} and ${FILE_URL} for details`,
      'Author: Someone Else <a@b.invalid>',
      'from: main',
    ]) {
      expect(redactTextWithCount(text), text).toEqual({ text, count: 0 });
    }
  });

  it('redacts a secret inside a URL without touching the rest of the line', () => {
    const line = `curl https://example.com/x?k=${KNOWN_TOKEN} http://localhost:3000/ done`;
    expect(redactTextWithCount(line)).toEqual({
      text: `curl https://example.com/x?k=${MARKER} http://localhost:3000/ done`,
      count: 1,
    });
  });

  it('redacts exactly the spans findSecretSpans reports, so passwd and short JWTs do not leak', () => {
    const passwd = 'const x = { passwd = "correct-horse-battery" }';
    expect(redactTextWithCount(passwd).text).toBe(
      'const x = { passwd = "[REDACTED:secret-assignment]" }',
    );
    const jwt = ['eyJhbGc', 'eyJzdWIi', 'c2lnbmF0dXJl'].join('.');
    expect(findSecretSpans(jwt)).not.toHaveLength(0);
    expect(redactTextWithCount(`t=${jwt}`).text).toBe(`t=${MARKER}`);
  });

  it('redacts a private key block line by line from BEGIN to END', () => {
    const block = [
      'before',
      '-----BEGIN RSA PRIVATE KEY-----',
      'body line',
      '-----END RSA PRIVATE KEY----- after',
      'outside',
    ].join('\n');
    expect(redactTextWithCount(block)).toEqual({
      text: [
        'before',
        '[REDACTED:secret-known-token]',
        '[REDACTED:secret-known-token]',
        '[REDACTED:secret-known-token] after',
        'outside',
      ].join('\n'),
      count: 3,
    });
  });

  it('redacts a PGP private key block body that spans several lines', () => {
    const body = 'lQdGBF1234567890abcdef';
    const block = ['a', PGP_BEGIN, body, '', PGP_END, 'z'].join('\n');
    const result = redactTextWithCount(block);
    expect(result.text).toBe(['a', MARKER, MARKER, MARKER, MARKER, 'z'].join('\n'));
    expect(result.text).not.toContain(body);
    expect(result.count).toBe(4);
  });

  it('redacts an unterminated private key block to the end of the text', () => {
    const result = redactTextWithCount(['x', PGP_BEGIN, 'secret body'].join('\n'));
    expect(result.text).toBe(['x', MARKER, MARKER].join('\n'));
  });

  it('redacts every line of a sensitive file', () => {
    expect(redactTextWithCount('A=1\nB=2', { sensitiveFile: true })).toEqual({
      text: '[REDACTED:sensitive-file-added]\n[REDACTED:sensitive-file-added]',
      count: 2,
    });
  });
});

describe('isSensitivePath', () => {
  it('matches the specified sensitive file names and not their examples', () => {
    for (const path of [
      '.env',
      'config/.env.local',
      'keys/server.pem',
      'a/b/tls.key',
      'cert.p12',
      'infra/state.tfstate',
      'home/id_rsa',
      'id_ed25519',
      '.netrc',
      'serviceaccount-prod.json',
      WINDOWS_ENV_PATH,
    ]) {
      expect(isSensitivePath(path)).toBe(true);
    }
    for (const path of ['.env.example', '.env.sample', 'x/.env.template', 'src/env.ts', 'a.json']) {
      expect(isSensitivePath(path)).toBe(false);
    }
  });
});

describe('sanitizeText order: redact, escape, cut', () => {
  it('escapes hidden characters after redaction and before the cut', () => {
    const raw = `a\u202eb ${KNOWN_TOKEN}`;
    expect(sanitizeSingleLine(raw, 160).text).toBe('a\\u{202E}b [REDACTED:secret-known-token]');
  });

  it('never cuts inside a redaction or escape token', () => {
    const redacted = `x ${KNOWN_TOKEN} y`;
    expect(sanitizeSingleLine(redacted, 30).text).toBe('x ');
    expect(sanitizeSingleLine(redacted, 31).text).toBe('x [REDACTED:secret-known-token]');
    expect(sanitizeSingleLine('a\u202eb', 3).text).toBe('a');
    expect(sanitizeSingleLine('a\u202eb', 9).text).toBe('a\\u{202E}');
  });

  it('never splits a surrogate pair and counts code points', () => {
    expect(clipEscaped('\u{1f600}\u{1f600}', 1)).toBe('\u{1f600}');
    expect(clipEscaped('ab\u{1f600}', 3)).toBe('ab\u{1f600}');
    expect(clipEscaped('abc', 0)).toBe('');
  });

  it('clips each line of multi-line text on its own', () => {
    expect(sanitizeText('abcdef\nghijkl', { maxChars: 3 }).text).toBe('abc\nghi');
    expect(sanitizeText('a\nb', { singleLine: true }).text).toBe('a\\u{000A}b');
  });
});

describe('redactHunkLines', () => {
  it('keeps line structure while redacting across lines', () => {
    const hunk = lineHunk('first', `token ${KNOWN_TOKEN}`, 'tab\there');
    const result = redactHunkLines(null, hunk);
    expect(result.lines).toEqual([
      'first',
      'token [REDACTED:secret-known-token]',
      'tab\\u{0009}here',
    ]);
    expect(result.count).toBe(1);
  });

  it('redacts every line of a sensitive file hunk', () => {
    const result = redactHunkLines(fileNamed('.env'), lineHunk('A=1', 'B=2'));
    expect(result.lines).toEqual([
      '[REDACTED:sensitive-file-added]',
      '[REDACTED:sensitive-file-added]',
    ]);
    expect(result.count).toBe(2);
  });
});
