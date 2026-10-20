import { describe, expect, it } from 'vitest';
import { parsedFiles } from '../app/appFixtures';
import type { DiffFile } from '../core/types';
import { FAKE, secretsDiff } from './diffFixtures';
import { isSensitiveFile, maskHunk } from './hunkMasking';

function fileAt(path: string): DiffFile {
  const file = parsedFiles(secretsDiff()).files.find((item) => item.displayPath === path);
  if (file === undefined) throw new Error('The fixture has no such file.');
  return file;
}

const NAMES = [
  '.env',
  '.env.local',
  'app/.env.production',
  'certs/site.pem',
  'keys/server.key',
  'store.p12',
  'home/id_rsa',
  'home/id_ed25519',
  '.netrc',
  'infra/state.tfstate',
  'gcp/serviceaccount-prod.json',
];

describe('SENSITIVE-PATH which files are masked whole', () => {
  it('SENSITIVE-PATH-YES matches every name in the sensitive-file rule', () => {
    for (const name of NAMES) {
      expect(isSensitiveFile(undefined, name), name).toBe(true);
    }
  });

  it('SENSITIVE-PATH-NO leaves examples, samples, templates and ordinary files alone', () => {
    for (const name of [
      '.env.example',
      '.env.sample',
      'x/.env.template',
      'src/env.ts',
      'keys.md',
    ]) {
      expect(isSensitiveFile(undefined, name), name).toBe(false);
    }
  });

  it('SENSITIVE-PATH-RENAME treats a file as sensitive when any of its names is', () => {
    const file = { ...fileAt('src/config.ts'), oldPath: '.env', displayPath: 'src/config.ts' };

    expect(isSensitiveFile(file, undefined)).toBe(true);
    expect(isSensitiveFile({ ...file, oldPath: 'a.ts' }, undefined)).toBe(false);
  });
});

describe('MASK-HUNK one scan per hunk', () => {
  it('MASK-HUNK-CACHE returns the same result for the same hunk, and reveals lazily', () => {
    const hunk = fileAt('src/config.ts').hunks[0];
    if (hunk === undefined) throw new Error('No hunk.');

    const first = maskHunk(hunk, false);

    expect(maskHunk(hunk, false)).toBe(first);
    expect(first.hasMasked).toBe(true);
    expect(first.revealed()).toBe(first.revealed());
    expect(JSON.stringify(first.masked)).not.toContain(FAKE.awsKey);
    expect(JSON.stringify(first.revealed())).toContain(FAKE.awsKey);
  });

  it('MASK-HUNK-KEY keeps the plain and the sensitive reading of one hunk apart', () => {
    const hunk = fileAt('.env').hunks[0];
    if (hunk === undefined) throw new Error('No hunk.');

    expect(maskHunk(hunk, true)).not.toBe(maskHunk(hunk, false));
    expect(maskHunk(hunk, true).hasMasked).toBe(true);
  });

  it('MASK-HUNK-NONE reports nothing masked for a plain hunk', () => {
    const hunk = fileAt('docs/readme.txt').hunks[0];
    if (hunk === undefined) throw new Error('No hunk.');

    expect(maskHunk(hunk, false).hasMasked).toBe(false);
  });
});
