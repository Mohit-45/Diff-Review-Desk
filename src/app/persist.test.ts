import { describe, expect, it } from 'vitest';
import type { Prefs, ReviewState } from '../core/types';
import {
  DIFF_KEY_PREFIX,
  MemoryStorageArea,
  createMemoryStorageAdapter,
  createStorageAdapter,
  type ReviewStorageAdapter,
} from '../storage/adapter';
import {
  persist,
  persistReview,
  prefsWithRememberDiff,
  rememberDiffOff,
  toStoredReview,
} from './persist';

const first = 'f00000000001:00000000001';
const second = 'f00000000001:00000000002';
const third = 'f00000000002:00000000003';
const fingerprint = '00000000001';
const updatedAt = '2026-10-19T00:00:00.000Z';
const REDACTED = '[REDACTED:secret]';

// Token-shaped values are assembled at runtime so no literal looks like a real credential.
function pieces(...parts: readonly string[]): string {
  return parts.join('');
}

const SHORT_GITHUB_TOKEN = pieces('gh', 'p_abcdefgh12');
const DEGRADED_BANNER =
  "Progress isn't being saved in this browser. Export your review to keep it.";

function stateWith(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    fingerprint,
    round: 1,
    label: 'Review',
    overallNote: '',
    hunks: {
      [first]: { decision: 'approved', comment: '' },
      [second]: { decision: 'rejected', comment: 'needs work' },
    },
    hunkIds: [first, second, third],
    prior: null,
    ...overrides,
  };
}

function persistentAdapter(maxReviewRecords?: number): ReviewStorageAdapter {
  return createStorageAdapter({
    local: new MemoryStorageArea(),
    session: new MemoryStorageArea(),
    ...(maxReviewRecords === undefined ? {} : { maxReviewRecords }),
  });
}

function storedDiff(adapter: ReviewStorageAdapter, key = fingerprint): string | null {
  const result = adapter.getDiff(key);
  return result.ok ? result.value : 'read failed';
}

function savedDiffCount(decided: number): string {
  return `Your diff text was not saved because it contains a secret-like string. ${String(decided)} decisions are stored. Paste the same diff to restore them.`;
}

class QuotaOnDiffArea extends MemoryStorageArea {
  override setItem(key: string, value: string): void {
    if (key.startsWith(DIFF_KEY_PREFIX)) {
      const quota = new DOMException('full', 'QuotaExceededError');
      throw quota;
    }
    super.setItem(key, value);
  }
}

describe('toStoredReview', () => {
  it('stores a sparse record in hunk id order with a null-prototype decisions map', () => {
    const state = stateWith({
      overallNote: 'overall',
      hunks: {
        [third]: { decision: null, comment: 'comment only' },
        [first]: { decision: 'approved', comment: '' },
        [second]: { decision: null, comment: '' },
        'f99999999999:99999999999': { decision: 'rejected', comment: 'not in this diff' },
      },
    });
    const record = toStoredReview(state, updatedAt);
    expect(record).toEqual({
      schemaVersion: 1,
      hashVersion: 1,
      updatedAt,
      fingerprint,
      round: 1,
      label: 'Review',
      overallNote: 'overall',
      decisions: {
        [first]: { decision: 'approved', comment: '' },
        [third]: { decision: null, comment: 'comment only' },
      },
      hunkIds: [first, second, third],
      prior: null,
    });
    expect(Object.getPrototypeOf(record.decisions)).toBeNull();
    expect(Object.keys(record.decisions)).toEqual([first, third]);
    expect(record.hunkIds).not.toBe(state.hunkIds);
  });

  it('passes the carry-over record through untouched', () => {
    const prior = {
      round: 1,
      unchangedIds: [first],
      carried: { [first]: 'approved' as const },
      goneCount: 2,
      goneRejected: 1,
    };
    expect(toStoredReview(stateWith({ round: 2, prior }), updatedAt).prior).toBe(prior);
  });

  it('applies a custom redactor to label, note and comments only', () => {
    const record = toStoredReview(
      stateWith({ label: 'label', overallNote: 'note' }),
      updatedAt,
      (text) => text.toUpperCase(),
    );
    expect(record.label).toBe('LABEL');
    expect(record.overallNote).toBe('NOTE');
    expect(record.decisions[second]?.comment).toBe('NEEDS WORK');
    expect(record.hunkIds).toEqual([first, second, third]);
    expect(record.updatedAt).toBe(updatedAt);
  });

  it.each([
    ['AWS access key', pieces('AK', 'IAABCDEFGHIJKLMNOP')],
    ['GitHub token', SHORT_GITHUB_TOKEN],
    ['GitHub fine-grained token', pieces('github', '_pat_abcdefgh12')],
    ['Slack token', pieces('xo', 'xb-abcdefgh12')],
    ['OpenAI-style live key', pieces('sk', '-live-abcdefgh12')],
    ['project key', pieces('sk', '-proj-abcdefgh12')],
    ['Anthropic-style key', pieces('sk', '-ant-abcdefgh12')],
    ['npm token', pieces('np', 'm_abcdefgh12')],
    ['GitLab token with hyphens and underscores', pieces('gl', 'pat-ab-cd_ef-gh12')],
    ['Google API key', pieces('AI', 'zaabcdefghijklmnopqrst')],
    ['Google API key with hyphen and underscore', pieces('AI', 'zaabcdefghij-klmno_pqrst')],
    ['bearer header', 'Authorization: Bearer abc.def'],
    ['quoted api key', 'api_key = "abcdefgh12"'],
    ['quoted secret with single quotes', "SECRET: 'abcdefgh'"],
    ['quoted private-key assignment', 'private-key="abcdefgh12"'],
    ['lone private key header', '-----BEGIN PRIVATE KEY-----'],
  ])('redacts a %s with the default redactor', (_label, secret) => {
    const record = toStoredReview(stateWith({ label: `a ${secret} b` }), updatedAt);
    expect(record.label).toBe(`a ${REDACTED} b`);
  });

  it('redacts credentials embedded in a URL up to the at sign', () => {
    const record = toStoredReview(
      stateWith({ label: 'https://user:pass@example.test/x' }),
      updatedAt,
    );
    expect(record.label).toBe(`${REDACTED}example.test/x`);
  });

  it('redacts a whole private key block as one unit', () => {
    const block = '-----BEGIN RSA PRIVATE KEY-----\nabc\ndef\n-----END RSA PRIVATE KEY-----';
    const record = toStoredReview(stateWith({ overallNote: `before ${block} after` }), updatedAt);
    expect(record.overallNote).toBe('before [REDACTED:private-key] after');
  });

  it.each([
    ['a short GitHub token', 'ghp_short'],
    ['a short live key', 'sk-live-abc'],
    ['a truncated AWS key', 'AKIA123'],
    ['a short quoted token', 'token = "short"'],
    ['a long unquoted token', 'token = abcdefgh12'],
    ['plain prose', 'Please rename this variable.'],
  ])('leaves %s alone', (_label, text) => {
    const record = toStoredReview(stateWith({ label: text }), updatedAt);
    expect(record.label).toBe(text);
  });

  it('redacts comments on decided hunks too', () => {
    const state = stateWith({
      hunks: { [first]: { decision: 'rejected', comment: `leaked ${SHORT_GITHUB_TOKEN} here` } },
    });
    expect(toStoredReview(state, updatedAt).decisions[first]?.comment).toBe(
      `leaked ${REDACTED} here`,
    );
  });
});

describe('persistReview diff handling', () => {
  it('saves a safe diff when remembering is on', () => {
    const adapter = persistentAdapter();
    const result = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'diff text',
      rememberDiff: true,
    });
    expect(result.ok && result.value.diff).toBe('saved');
    expect(result.ok && result.value.notices).toEqual([]);
    expect(result.ok && result.value.record.fingerprint).toBe(fingerprint);
    expect(storedDiff(adapter)).toBe('diff text');
    expect(adapter.getReview(fingerprint).ok).toBe(true);
  });

  it('ST-DENIED reports the degraded banner exactly once for a memory adapter', () => {
    const adapter = createMemoryStorageAdapter();
    const result = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'diff text',
      rememberDiff: true,
    });
    expect(result.ok && result.value.notices).toEqual([DEGRADED_BANNER]);
  });

  it('IN-SECRET-DIFF withholds when the default detector sees a secret', () => {
    const adapter = persistentAdapter();
    adapter.setDiff(fingerprint, 'older text');
    const result = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'password = "hunter2hunter2"',
      rememberDiff: true,
    });
    expect(result.ok && result.value.diff).toBe('withheld');
    expect(result.ok && result.value.notices).toEqual([savedDiffCount(2)]);
    expect(storedDiff(adapter)).toBeNull();
  });

  it('counts only decided hunks in the withheld notice', () => {
    const state = stateWith({
      hunks: {
        [first]: { decision: null, comment: 'comment only' },
        [second]: { decision: 'approved', comment: '' },
      },
    });
    const result = persistReview(state, {
      adapter: persistentAdapter(),
      updatedAt,
      diffText: 'api_key = "abcdefgh12"',
      rememberDiff: true,
    });
    expect(result.ok && result.value.notices).toEqual([savedDiffCount(1)]);
  });

  it('withholds a diff over the saved-text limit with the same notice', () => {
    const adapter = persistentAdapter();
    const result = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'x'.repeat(500_001),
      rememberDiff: true,
    });
    expect(result.ok && result.value.diff).toBe('withheld');
    expect(result.ok && result.value.notices).toEqual([savedDiffCount(2)]);
    expect(storedDiff(adapter)).toBeNull();
    const atLimit = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'x'.repeat(500_000),
      rememberDiff: true,
    });
    expect(atLimit.ok && atLimit.value.diff).toBe('saved');
  });

  it('uses a custom secret detector and treats a throwing detector as a hit', () => {
    const adapter = persistentAdapter();
    const clean = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'password = "hunter2hunter2"',
      rememberDiff: true,
      findSecretSpans: () => [],
    });
    expect(clean.ok && clean.value.diff).toBe('saved');
    const hit = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'harmless',
      rememberDiff: true,
      findSecretSpans: () => ['span'],
    });
    expect(hit.ok && hit.value.diff).toBe('withheld');
    const throwing = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'harmless',
      rememberDiff: true,
      findSecretSpans: () => {
        throw new Error('rule crashed');
      },
    });
    expect(throwing.ok && throwing.value.diff).toBe('withheld');
    expect(storedDiff(adapter)).toBeNull();
  });

  it.each([
    '.env',
    'config/.env',
    '.env.production',
    'cert.pem',
    'deploy/server.key',
    'store.p12',
    'infra/terraform.tfstate',
    'id_rsa',
    '.ssh/id_ed25519',
    '.netrc',
    'serviceaccount.json',
    'gcp/ServiceAccount-prod.json',
  ])('IN-SECRET-DIFF withholds when %s is a sensitive path', (path) => {
    const result = persistReview(stateWith(), {
      adapter: persistentAdapter(),
      updatedAt,
      diffText: 'harmless',
      rememberDiff: true,
      sensitivePaths: ['src/app.ts', path],
    });
    expect(result.ok && result.value.diff).toBe('withheld');
  });

  it.each([
    'environment.ts',
    'src/key.ts',
    '.environment',
    'id_rsa.pub',
    'notes.pem.bak',
    'a.envx',
    'serviceaccount.yaml',
  ])('saves the diff when %s is not a sensitive path', (path) => {
    const result = persistReview(stateWith(), {
      adapter: persistentAdapter(),
      updatedAt,
      diffText: 'harmless',
      rememberDiff: true,
      sensitivePaths: [path],
    });
    expect(result.ok && result.value.diff).toBe('saved');
  });

  it('uses a custom path predicate and treats a throwing predicate as sensitive', () => {
    const adapter = persistentAdapter();
    const seen: string[] = [];
    const allowed = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'harmless',
      rememberDiff: true,
      sensitivePaths: ['.env', 'b'],
      hasSensitivePath: (path) => {
        seen.push(path);
        return false;
      },
    });
    expect(allowed.ok && allowed.value.diff).toBe('saved');
    expect(seen).toEqual(['.env', 'b']);
    const throwing = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'harmless',
      rememberDiff: true,
      sensitivePaths: ['a'],
      hasSensitivePath: () => {
        throw new Error('predicate crashed');
      },
    });
    expect(throwing.ok && throwing.value.diff).toBe('withheld');
    const noPaths = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'harmless',
      rememberDiff: true,
      hasSensitivePath: () => {
        throw new Error('never called without paths');
      },
    });
    expect(noPaths.ok && noPaths.value.diff).toBe('saved');
  });

  it('ST-REMEMBER-OFF removes the stored diff when remembering is off or unset', () => {
    const adapter = persistentAdapter();
    adapter.setDiff(fingerprint, 'older text');
    const off = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'new text',
      rememberDiff: false,
    });
    expect(off.ok && off.value.diff).toBe('removed');
    expect(off.ok && off.value.notices).toEqual([]);
    expect(storedDiff(adapter)).toBeNull();
    adapter.setDiff(fingerprint, 'older text');
    const unset = persistReview(stateWith(), { adapter, updatedAt, diffText: 'new text' });
    expect(unset.ok && unset.value.diff).toBe('removed');
    expect(storedDiff(adapter)).toBeNull();
  });

  it('removes the stored diff when no text is supplied and remembering is off', () => {
    const adapter = persistentAdapter();
    adapter.setDiff(fingerprint, 'older text');
    const result = persistReview(stateWith(), { adapter, updatedAt, diffText: null });
    expect(result.ok && result.value.diff).toBe('removed');
    expect(storedDiff(adapter)).toBeNull();
  });

  it('leaves the stored diff alone when no text is supplied and remembering is on', () => {
    const adapter = persistentAdapter();
    adapter.setDiff(fingerprint, 'older text');
    const none = persistReview(stateWith(), { adapter, updatedAt, rememberDiff: true });
    expect(none.ok && none.value.diff).toBe('not-requested');
    const nulled = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: null,
      rememberDiff: true,
    });
    expect(nulled.ok && nulled.value.diff).toBe('not-requested');
    expect(storedDiff(adapter)).toBe('older text');
  });

  it('ST-QUOTA withholds the diff and reports the failure when the diff key cannot be written', () => {
    const adapter = createStorageAdapter({
      local: new MemoryStorageArea(),
      session: new QuotaOnDiffArea(),
    });
    const result = persistReview(stateWith(), {
      adapter,
      updatedAt,
      diffText: 'harmless',
      rememberDiff: true,
    });
    expect(result.ok && result.value.diff).toBe('withheld');
    expect(result.ok && result.value.notices).toEqual([
      'The diff text could not be saved after the browser quota was reached.',
      'Browser storage quota was reached; older reviews were removed.',
      DEGRADED_BANNER,
    ]);
    expect(adapter.getReview(fingerprint).ok).toBe(true);
  });
});

describe('persistReview record handling', () => {
  it('stores the redacted record and returns it', () => {
    const adapter = persistentAdapter();
    const result = persistReview(stateWith({ label: `token ${SHORT_GITHUB_TOKEN}` }), {
      adapter,
      updatedAt,
    });
    expect(result.ok && result.value.record.label).toBe(`token ${REDACTED}`);
    const stored = adapter.getReview(fingerprint);
    expect(stored.ok && stored.value?.label).toBe(`token ${REDACTED}`);
    expect(stored.ok && stored.value?.updatedAt).toBe(updatedAt);
  });

  it('uses the supplied redactor instead of the default', () => {
    const result = persistReview(stateWith({ label: SHORT_GITHUB_TOKEN }), {
      adapter: persistentAdapter(),
      updatedAt,
      redact: (text) => text.replaceAll('ghp_', 'x'),
    });
    expect(result.ok && result.value.record.label).toBe('xabcdefgh12');
  });

  it('reports a redactor failure as an invalid record', () => {
    const result = persistReview(stateWith(), {
      adapter: persistentAdapter(),
      updatedAt,
      redact: () => {
        throw new Error('redactor crashed');
      },
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid-record', message: 'The review could not be prepared for saving.' },
    });
  });

  it('reports a rejected record as a storage failure with the adapter detail', () => {
    const result = persistReview(stateWith({ round: 0 }), {
      adapter: persistentAdapter(),
      updatedAt,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'storage', message: 'The review could not be saved.' },
    });
  });

  it('protects the open review from eviction through openFingerprint', () => {
    const adapter = persistentAdapter(2);
    adapter.setReview(stored('00000000001', '2026-10-17T00:00:00.000Z'), null);
    adapter.setReview(stored('00000000002', '2026-10-18T00:00:00.000Z'), null);
    const result = persistReview(stateWith({ fingerprint: '00000000003' }), {
      adapter,
      updatedAt: '2026-10-19T00:00:00.000Z',
      openFingerprint: '00000000001',
    });
    expect(result.ok).toBe(true);
    const keys = ['00000000001', '00000000002', '00000000003'].map((key) => {
      const read = adapter.getReview(key);
      return read.ok && read.value !== null;
    });
    expect(keys).toEqual([true, false, true]);
  });
});

function stored(key: string, at: string): ReturnType<typeof toStoredReview> {
  return toStoredReview(stateWith({ fingerprint: key }), at);
}

describe('persist overloads', () => {
  it('accepts an options object', () => {
    const adapter = persistentAdapter();
    const result = persist(stateWith(), { adapter, updatedAt });
    expect(result.ok && result.value.record.updatedAt).toBe(updatedAt);
  });

  it('accepts adapter, timestamp and trailing options', () => {
    const adapter = persistentAdapter();
    const result = persist(stateWith(), adapter, updatedAt, {
      diffText: 'diff text',
      rememberDiff: true,
    });
    expect(result.ok && result.value.diff).toBe('saved');
    expect(storedDiff(adapter)).toBe('diff text');
  });

  it('defaults the trailing options to none', () => {
    const adapter = persistentAdapter();
    const result = persist(stateWith(), adapter, updatedAt);
    expect(result.ok && result.value.diff).toBe('removed');
  });

  it('requires a timestamp for the positional form', () => {
    const adapter = persistentAdapter();
    const withoutTimestamp = persist as unknown as (
      state: ReviewState,
      adapter: ReviewStorageAdapter,
    ) => unknown;
    const result = withoutTimestamp(stateWith(), adapter);
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid-record', message: 'A persistence timestamp is required.' },
    });
  });
});

describe('rememberDiffOff and prefsWithRememberDiff', () => {
  it('ST-REMEMBER-OFF deletes the diff key immediately', () => {
    const adapter = persistentAdapter();
    adapter.setDiff(fingerprint, 'older text');
    expect(rememberDiffOff(adapter, fingerprint)).toEqual({ ok: true, value: undefined });
    expect(storedDiff(adapter)).toBeNull();
  });

  it('reports a storage failure with the adapter detail', () => {
    const failing: ReviewStorageAdapter = {
      ...persistentAdapter(),
      removeDiff: () => ({
        ok: false,
        error: {
          code: 'unavailable',
          title: 'Browser storage is unavailable',
          detail: 'remove failed',
          suggestion: 'Keep this tab open.',
        },
      }),
    };
    expect(rememberDiffOff(failing, fingerprint)).toEqual({
      ok: false,
      error: { code: 'storage', message: 'remove failed' },
    });
  });

  it('copies preferences with a new rememberDiff value', () => {
    const prefs: Prefs = {
      theme: 'dark',
      shortcutsEnabled: false,
      autoAdvance: true,
      rememberDiff: false,
    };
    const next = prefsWithRememberDiff(prefs, true);
    expect(next).toEqual({ ...prefs, rememberDiff: true });
    expect(next).not.toBe(prefs);
    expect(prefs.rememberDiff).toBe(false);
  });
});
