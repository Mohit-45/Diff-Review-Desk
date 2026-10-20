import { describe, expect, it, vi } from 'vitest';
import * as secrets from '../core/risk/secrets';
import { decidedState, memoryAreas, parsedFiles, smallDiff } from './appFixtures';
import { forgetAllDiffs, persistReview } from './persist';
import { createPersistGate, redactSecrets } from './persistGate';

const updatedAt = '2026-10-20T00:00:00.000Z';
const TOKEN = `${['ghp', '_'].join('')}abcdefghijklmnopqrstuvwxyz0123456789`;

describe('redactSecrets', () => {
  it('replaces a recognised token and keeps the words around it', () => {
    const redacted = redactSecrets(`use ${TOKEN} for the deploy`);
    expect(redacted).not.toContain(TOKEN);
    expect(redacted.startsWith('use [REDACTED:')).toBe(true);
    expect(redacted.endsWith('] for the deploy')).toBe(true);
  });

  it('leaves ordinary text untouched', () => {
    expect(redactSecrets('rename the helper and add a test')).toBe(
      'rename the helper and add a test',
    );
  });
});

describe('createPersistGate', () => {
  it('lists every path of the diff and flags sensitive ones', () => {
    const { files } = parsedFiles(smallDiff());
    const gate = createPersistGate(files, smallDiff());
    expect(gate.sensitivePaths).toContain('src/a.ts');
    expect(gate.hasSensitivePath?.('.env')).toBe(true);
    expect(gate.hasSensitivePath?.('keys/deploy.pem')).toBe(true);
    expect(gate.hasSensitivePath?.('src/a.ts')).toBe(false);
  });

  it('scans the open diff once however many times it is asked', () => {
    const spy = vi.spyOn(secrets, 'findSecretSpans');
    const text = smallDiff();
    const gate = createPersistGate(parsedFiles(text).files, text);
    gate.findSecretSpans?.(text);
    gate.findSecretSpans?.(text);
    gate.findSecretSpans?.(text);
    expect(spy).toHaveBeenCalledTimes(1);
    gate.findSecretSpans?.('other text');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('IN-SECRET-DIFF keeps a secret-bearing diff out of storage but stores decisions', () => {
    const text = `${smallDiff()}+const key = '${TOKEN}';\n`;
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    const result = persistReview(state, {
      adapter,
      updatedAt,
      diffText: text,
      rememberDiff: true,
      ...createPersistGate(parsedFiles(text).files, text),
    });
    expect(result.ok && result.value.diff).toBe('withheld');
    expect(result.ok && result.value.diffNote).toBe(
      'Your diff text was not saved because it contains a secret-like string. 2 decisions are stored. Paste the same diff to restore them.',
    );
    const stored = adapter.getReview(state.fingerprint);
    expect(stored.ok && stored.value?.decisions).toBeDefined();
    const diff = adapter.getDiff(state.fingerprint);
    expect(diff.ok && diff.value).toBeNull();
  });

  it('withholds the diff of a sensitive file path', () => {
    const text = smallDiff().replaceAll('src/a.ts', '.env');
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    const result = persistReview(state, {
      adapter,
      updatedAt,
      diffText: text,
      rememberDiff: true,
      ...createPersistGate(parsedFiles(text).files, text),
    });
    expect(result.ok && result.value.diff).toBe('withheld');
  });

  it('stores a clean diff when remembering is on and none when it is off', () => {
    const text = smallDiff();
    const gate = createPersistGate(parsedFiles(text).files, text);
    const on = memoryAreas();
    const state = decidedState(text);
    persistReview(state, {
      adapter: on.adapter,
      updatedAt,
      diffText: text,
      rememberDiff: true,
      ...gate,
    });
    const stored = on.adapter.getDiff(state.fingerprint);
    expect(stored.ok && stored.value).toBe(text);
    const off = memoryAreas();
    const result = persistReview(state, {
      adapter: off.adapter,
      updatedAt,
      diffText: text,
      rememberDiff: false,
      ...gate,
    });
    expect(result.ok && result.value.diff).toBe('removed');
    expect(result.ok && result.value.diffNote).toBeNull();
  });

  it('stores a comment with its secret redacted', () => {
    const text = smallDiff();
    const gate = createPersistGate(parsedFiles(text).files, text);
    const { adapter } = memoryAreas();
    const state = decidedState(text);
    const [, second] = Object.keys(state.hunks);
    if (second === undefined) throw new Error('fixture');
    const withSecret = {
      ...state,
      hunks: {
        ...state.hunks,
        [second]: { decision: 'rejected' as const, comment: `rotate ${TOKEN}` },
      },
    };
    persistReview(withSecret, { adapter, updatedAt, ...gate });
    const stored = adapter.getReview(state.fingerprint);
    expect(JSON.stringify(stored.ok && stored.value)).not.toContain(TOKEN);
  });
});

describe('forgetAllDiffs', () => {
  it('ST-REMEMBER-OFF removes every stored diff', () => {
    const { adapter } = memoryAreas();
    adapter.setDiff('00000000001', 'a');
    adapter.setDiff('00000000002', 'b');
    expect(forgetAllDiffs(adapter)).toEqual({ ok: true, value: undefined });
    const first = adapter.getDiff('00000000001');
    const second = adapter.getDiff('00000000002');
    expect(first.ok && first.value).toBeNull();
    expect(second.ok && second.value).toBeNull();
  });

  it('reports a storage failure', () => {
    const { adapter } = memoryAreas();
    const failing = {
      ...adapter,
      removeAllDiffs: () => ({
        ok: false as const,
        error: {
          code: 'unavailable' as const,
          title: 'Browser storage is unavailable',
          detail: 'blocked',
          suggestion: 'Keep this tab open.',
        },
      }),
    };
    expect(forgetAllDiffs(failing)).toEqual({
      ok: false,
      error: { code: 'storage', message: 'blocked' },
    });
  });
});
