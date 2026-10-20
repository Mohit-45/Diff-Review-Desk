import { describe, expect, it } from 'vitest';
import { findSecretSpans } from './secrets';

type Found = { readonly kind: string; readonly text: string; readonly prefix: string | null };

function found(text: string): Found[] {
  return findSecretSpans(text).map((span) => ({
    kind: span.kind,
    text: text.slice(span.start, span.end),
    prefix: span.publicPrefix,
  }));
}

function varied(length: number): string {
  const alphabet = 'aBcD1eFgH2iJkL3mN';
  return Array.from({ length }, (_unused, index) => alphabet[index % alphabet.length]).join('');
}

const AWS = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const GITHUB = `${['gh', 'p_'].join('')}${varied(36)}`;

describe('known token prefixes', () => {
  it('requires the exact 16-character body for AWS key ids', () => {
    expect(found(`key ${AWS}`)).toEqual([{ kind: 'known-token', text: AWS, prefix: 'AKIA' }]);
    expect(found(`key ${AWS.slice(0, -1)}`)).toEqual([]);
    expect(found(`key ${AWS}Q`)).toEqual([]);
  });

  it('requires the minimum body length for other prefixes', () => {
    expect(found(GITHUB)).toEqual([{ kind: 'known-token', text: GITHUB, prefix: 'ghp_' }]);
    expect(found(`ghp_${varied(19)}`)).toEqual([]);
    expect(found(`sk-ant-${varied(10)}`)).toHaveLength(1);
    expect(found(`sk-ant-${varied(9)}`)).toEqual([]);
  });

  it('needs a non-token character before the prefix', () => {
    expect(found(`"${GITHUB}"`)).toHaveLength(1);
    expect(found(`token=${GITHUB}`)).toHaveLength(1);
    expect(found(`x${GITHUB}`)).toEqual([]);
    expect(found(`_${GITHUB}`)).toEqual([]);
  });

  it('ignores repeated-character bodies and placeholders', () => {
    expect(found(`ghp_${'a'.repeat(30)}`)).toEqual([]);
    expect(found('ghp_<token>')).toEqual([]);
    expect(found(`${['sk', '_test_'].join('')}${varied(20)}`)).toEqual([]);
  });
});

describe('structured secrets', () => {
  it('finds JWT-shaped tokens with three long parts', () => {
    const jwt = ['eyJ', 'hbGciOiJIUzI1.eyJzdWIiOiIxMjM0.c2lnbmF0dXJl'].join('');
    expect(found(`jwt=${jwt};`)).toEqual([{ kind: 'known-token', text: jwt, prefix: null }]);
    expect(found('eyJabc.eyJdef.ghi')).toEqual([]);
    expect(found('eyJabc.eyJdef.ghij')).toHaveLength(1);
  });

  it('masks only the credential part of a URL', () => {
    expect(found('open https://user:hunter22@example.invalid/db')).toEqual([
      { kind: 'url-credentials', text: 'user:hunter22', prefix: null },
    ]);
    expect(found('https://user@example.invalid/db')).toEqual([]);
    expect(found('https://${USER}:${PASS}@example.invalid/db')).toEqual([]);
  });

  it('finds bearer tokens in any letter case and skips placeholders', () => {
    expect(found('Authorization: Bearer abc.def-ghi_jkl')).toEqual([
      { kind: 'bearer-token', text: 'abc.def-ghi_jkl', prefix: null },
    ]);
    expect(found('AUTHORIZATION :\tbearer  zzzz.yyyy')).toEqual([
      { kind: 'bearer-token', text: 'zzzz.yyyy', prefix: null },
    ]);
    expect(found('Authorization: Bearer <token>')).toEqual([]);
    expect(found('Authorization: Basic abcdef')).toEqual([]);
  });

  it('finds chat webhook URLs up to the closing delimiter', () => {
    const slack = ['https://hooks.slack.com', '/services/T000/B000/abc123'].join('');
    expect(found(`post("${slack}")`)).toEqual([{ kind: 'webhook', text: slack, prefix: null }]);
    const discord = ['https://discord.com', '/api/webhooks/123/abc'].join('');
    expect(found(`url: ${discord}, next`)).toEqual([
      { kind: 'webhook', text: discord, prefix: null },
    ]);
    expect(found(['https://hooks.slack.com', '/services/'].join(''))).toEqual([]);
  });
});

describe('private key blocks', () => {
  it('covers BEGIN through END and runs to the end of an unterminated block', () => {
    const closed = '-----BEGIN RSA PRIVATE KEY-----\nbody\n-----END RSA PRIVATE KEY-----';
    expect(found(`a\n${closed}\nb`)).toEqual([{ kind: 'pem', text: closed, prefix: null }]);
    const open = '-----BEGIN PRIVATE KEY-----\nbody';
    expect(found(`a\n${open}`)).toEqual([{ kind: 'pem', text: open, prefix: null }]);
    const mismatched = '-----BEGIN PRIVATE KEY-----\nbody\n-----END CERTIFICATE-----';
    expect(found(mismatched)).toEqual([{ kind: 'pem', text: mismatched, prefix: null }]);
  });

  it('skips certificates and public keys', () => {
    expect(found('-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----')).toEqual([]);
    expect(found('-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----')).toEqual([]);
  });
});

describe('secret assignments', () => {
  it('covers only the quoted value and accepts both quote styles and separators', () => {
    expect(found('api_key = "abcdefgh"')).toEqual([
      { kind: 'assignment', text: 'abcdefgh', prefix: null },
    ]);
    expect(found("token:\t'abcdefgh1'")).toEqual([
      { kind: 'assignment', text: 'abcdefgh1', prefix: null },
    ]);
    expect(found('API_KEY="abcdefgh"')).toHaveLength(1);
    for (const name of ['apikey', 'secret', 'password', 'passwd', 'private_key', 'privatekey']) {
      expect(found(`${name} = "abcdefgh"`), name).toHaveLength(1);
    }
  });

  it('accepts values of 8 to 120 characters only', () => {
    expect(found(`token = "${'a1'.repeat(3)}b"`)).toEqual([]);
    expect(found(`token = "${varied(8)}"`)).toHaveLength(1);
    expect(found(`token = "${varied(120)}"`)).toHaveLength(1);
    expect(found(`token = "${varied(121)}"`)).toEqual([]);
  });

  it('skips placeholders, other quote characters and unterminated values', () => {
    for (const value of [
      'changeme',
      'your-key-goes-here',
      'your_key_goes_here',
      '${SECRET_VALUE}',
      '<value-here>',
    ]) {
      expect(found(`token = "${value}"`), value).toEqual([]);
    }
    expect(found('token = `abcdefghij`')).toEqual([]);
    expect(found('token = "abcdefghij')).toEqual([]);
    expect(found('token == "abcdefghij"')).toEqual([]);
  });

  it('skips names that are part of a longer identifier or end in a safe suffix', () => {
    for (const name of ['mytoken', 'api_key_url', 'token_type', 'secret_name', 'password_id']) {
      expect(found(`${name} = "abcdefghij"`), name).toEqual([]);
    }
    expect(found('my_token = "abcdefghij"')).toHaveLength(1);
    expect(found('config.password = "abcdefghij"')).toHaveLength(1);
  });
});

describe('span merging', () => {
  it('lets an assignment win over a token that starts at the same offset', () => {
    expect(found(`token = "${GITHUB}"`)).toEqual([
      { kind: 'assignment', text: GITHUB, prefix: null },
    ]);
  });

  it('keeps the known token when a bearer span starts at the same offset', () => {
    expect(found(`Authorization: Bearer ${GITHUB}`)).toEqual([
      { kind: 'known-token', text: GITHUB, prefix: 'ghp_' },
    ]);
  });

  it('swallows spans that start inside a private key block', () => {
    const block = '-----BEGIN PRIVATE KEY-----\npassword = "abcdefghij"\n-----END PRIVATE KEY-----';
    expect(found(block)).toEqual([{ kind: 'pem', text: block, prefix: null }]);
  });

  it('returns ordered, non-overlapping spans', () => {
    const text = `${AWS} api_key = "abcdefgh" https://u:p4ssword@h.invalid/x`;
    const spans = findSecretSpans(text);
    expect(spans.map((span) => span.kind)).toEqual([
      'known-token',
      'assignment',
      'url-credentials',
    ]);
    for (let index = 1; index < spans.length; index += 1) {
      expect(spans[index]?.start ?? 0).toBeGreaterThanOrEqual(spans[index - 1]?.end ?? 0);
    }
  });
});
