import { describe, expect, it } from 'vitest';
import type { DiffFile } from '../../types';
import {
  isDocsPath,
  isGeneratedPath,
  isLockPath,
  isSensitivePath,
  isVendoredPath,
  lowBinaryPath,
} from './paths';

function generatedFile(generated: boolean): DiffFile {
  return {
    id: 'f00000000000',
    displayPath: 'a',
    oldPath: 'a',
    newPath: 'a',
    status: 'modified',
    similarity: null,
    oldMode: null,
    newMode: null,
    kind: 'regular',
    binary: false,
    generated,
    hunks: [],
    added: 0,
    removed: 0,
    incomplete: false,
  };
}

describe('isSensitivePath', () => {
  it('matches the specified credential files in any directory and any letter case', () => {
    for (const path of [
      '.env',
      '.env.local',
      'config/.ENV.production',
      'keys/server.pem',
      'a/b/Tls.KEY',
      'cert.p12',
      'infra/state.tfstate',
      'home/id_rsa',
      'id_ed25519',
      '.netrc',
      'serviceaccount-prod.json',
      'gcp/ServiceAccount.json',
    ]) {
      expect(isSensitivePath(path), path).toBe(true);
    }
  });

  it('skips example env files and lookalike names', () => {
    for (const path of [
      '.env.example',
      'src/.env.SAMPLE',
      'x/.env.template',
      'src/env.ts',
      'keyboard.ts',
      'my.key.ts',
      'id_rsa.pub',
      'serviceaccount.txt',
      'package.json',
    ]) {
      expect(isSensitivePath(path), path).toBe(false);
    }
  });
});

describe('path classes that lower severity', () => {
  it('recognises lock files across ecosystems', () => {
    for (const path of [
      'package-lock.json',
      'web/npm-shrinkwrap.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Cargo.lock',
      'Gemfile.lock',
      'composer.lock',
      'go.sum',
      'go.work.sum',
      'ios/Podfile.lock',
      'anything.lock',
      'x.lock.json',
    ]) {
      expect(isLockPath(path), path).toBe(true);
    }
    for (const path of ['lock.ts', 'locks/readme.txt', 'package.json']) {
      expect(isLockPath(path), path).toBe(false);
    }
  });

  it('recognises documentation paths and Markdown files', () => {
    for (const path of [
      'docs/a.ts',
      'src/docs/a.ts',
      'a/documentation/b.ts',
      'README',
      'sub/readme.txt',
      'CHANGELOG',
      'notes.md',
      'x.mdx',
    ]) {
      expect(isDocsPath(path), path).toBe(true);
    }
    for (const path of ['src/a.ts', 'mydocs/a.ts', 'docsify.ts']) {
      expect(isDocsPath(path), path).toBe(false);
    }
  });

  it('recognises vendored dependency directories', () => {
    for (const path of [
      'vendor/a.go',
      'a/vendor/b.go',
      'vendors/x.js',
      'x/vendors/y.js',
      'a/third_party/b.c',
      'a/third-party/b.c',
      'node_modules/x/y.js',
      'a/node_modules/x/y.js',
      'bower_components/x.js',
      'a/bower_components/x.js',
    ]) {
      expect(isVendoredPath(path), path).toBe(true);
    }
    expect(isVendoredPath('src/vendor.ts')).toBe(false);
  });

  it('matches vendored directories at the top level as well as nested', () => {
    for (const path of [
      'third_party/lib/a.c',
      'third-party/lib/a.c',
      'THIRD_PARTY/lib/a.c',
      'vendor/a.go',
      'vendors/a.js',
      'node_modules/a/b.js',
      'bower_components/a.js',
      'pkg/third_party/lib/a.c',
      'pkg/third-party/lib/a.c',
    ]) {
      expect(isVendoredPath(path), path).toBe(true);
    }
    for (const path of ['third_party.ts', 'my_third_party/a.c', 'src/third_party_notes.md']) {
      expect(isVendoredPath(path), path).toBe(false);
    }
  });

  it('recognises generated files by flag or by minified and map suffixes', () => {
    expect(isGeneratedPath('src/a.ts', generatedFile(true))).toBe(true);
    for (const path of ['dist/app.min.js', 'dist/APP.MIN.CSS', 'dist/app.js.map']) {
      expect(isGeneratedPath(path, generatedFile(false)), path).toBe(true);
    }
    expect(isGeneratedPath('dist/app.js', generatedFile(false))).toBe(false);
  });

  it('treats images and fonts as low-risk binary files', () => {
    for (const path of [
      'logo.PNG',
      'a/b.jpg',
      'c.jpeg',
      'd.gif',
      'e.webp',
      'f.svg',
      'g.ico',
      'h.bmp',
      'i.ttf',
      'j.otf',
      'k.woff',
      'k.woff2',
    ]) {
      expect(lowBinaryPath(path), path).toBe(true);
    }
    for (const path of ['data.bin', 'archive.zip', 'doc.pdf']) {
      expect(lowBinaryPath(path), path).toBe(false);
    }
  });
});
