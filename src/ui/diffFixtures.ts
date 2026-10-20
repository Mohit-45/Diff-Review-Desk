import { materialize } from '../samples/fakeSecrets';

/** Small seeded generator (mulberry32), so every large fixture is the same on every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function words(random: () => number, count: number): string {
  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    parts.push(`w${String(Math.floor(random() * 1000))}`);
  }
  return parts.join('_');
}

function fileHeader(path: string, isNew: boolean): string[] {
  return [
    `diff --git a/${path} b/${path}`,
    ...(isNew ? ['new file mode 100644'] : ['index 1111111..2222222 100644']),
    `--- ${isNew ? '/dev/null' : `a/${path}`}`,
    `+++ b/${path}`,
  ];
}

/** One modified file with `hunks` three-line hunks, 20 lines apart. */
export function manyHunkDiff(path: string, hunks: number, seed = 1): string {
  const random = seededRandom(seed);
  const lines = fileHeader(path, false);
  for (let index = 0; index < hunks; index += 1) {
    const start = index * 20 + 1;
    lines.push(
      `@@ -${String(start)},3 +${String(start)},3 @@`,
      ` const keep${String(index)} = 1;`,
      `-const old${String(index)} = '${words(random, 2)}';`,
      `+const next${String(index)} = '${words(random, 2)}';`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** One added file whose single hunk holds `count` lines. */
export function longHunkDiff(path: string, count: number, seed = 2): string {
  const random = seededRandom(seed);
  const lines = [...fileHeader(path, true), `@@ -0,0 +1,${String(count)} @@`];
  for (let index = 0; index < count; index += 1) {
    lines.push(`+line${String(index)} ${words(random, 2)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** One added file with a single line of `text`. */
export function oneLineDiff(path: string, text: string): string {
  return `${[...fileHeader(path, true), '@@ -0,0 +1 @@', `+${text}`].join('\n')}\n`;
}

/** A line of `length` characters from a seeded alphabet, without anything secret-shaped. */
export function longLine(length: number, seed = 3): string {
  const random = seededRandom(seed);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz ';
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += alphabet.charAt(Math.floor(random() * alphabet.length));
  }
  return text;
}

/** Fake secrets, assembled at run time so no token-shaped literal sits in the source. */
export const FAKE = {
  awsKey: materialize('{{FAKE:aws-key}}'),
  envValue: ['hunter2', 'envvalue', 'XYZ'].join(''),
  deletedEnvValue: ['oldenv', 'secret', 'ABC'].join(''),
  assignValue: ['correct-horse', 'battery-staple'].join('-'),
  pemBodyOne: ['MIIEvQIBADANBgkqhkiG9w0BAQEFAASC', 'BKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj'].join(''),
  pemBodyTwo: ['MBgNVHREEETAPgg1leGFtcGxlLmNvbTAN', 'BgkqhkiG9w0BAQsFAAOCAQEAu8Ql2f1D'].join(''),
} as const;

const PEM_BEGIN = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const PEM_END = ['-----END', 'PRIVATE KEY-----'].join(' ');
const RLO = String.fromCodePoint(0x202e);

/** Source, certs, a new .env, a deleted .env and a note: every kind of thing that must be masked. */
export function secretsDiff(): string {
  return `${[
    ...fileHeader('src/config.ts', false),
    '@@ -1,3 +1,4 @@',
    ' export const region = "eu";',
    `+export const key = '${FAKE.awsKey}';`,
    `+const password = "${FAKE.assignValue}";`,
    ` export const note = "visible${RLO}tail";`,
    ...fileHeader('certs/deploy.txt', true),
    `@@ -0,0 +1,5 @@`,
    `+${PEM_BEGIN}`,
    `+${FAKE.pemBodyOne}`,
    `+${FAKE.pemBodyTwo}`,
    `+${PEM_END}`,
    '+after the key',
    ...fileHeader('.env', true),
    '@@ -0,0 +1,2 @@',
    `+DB_PASSWORD=${FAKE.envValue}`,
    '+PLAIN_SETTING=visible-setting',
    'diff --git a/old/.env b/old/.env',
    'deleted file mode 100644',
    'index 1111111..0000000',
    '--- a/old/.env',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    `-SECRET_TOKEN=${FAKE.deletedEnvValue}`,
    ...fileHeader('docs/readme.txt', false),
    '@@ -1,2 +1,2 @@',
    ' plain text',
    '-before',
    '+after',
  ].join('\n')}\n`;
}

export const RAW_SECRETS: readonly string[] = [
  FAKE.awsKey,
  FAKE.envValue,
  FAKE.deletedEnvValue,
  FAKE.assignValue,
  FAKE.pemBodyOne,
  FAKE.pemBodyTwo,
  'visible-setting',
];
