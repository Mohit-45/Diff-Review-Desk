import type { DiffLine } from './types';

export const HASH_VERSION = 1 as const;

function cyrb53(input: string, seed = 0): number {
  let first = 0xdeadbeef ^ seed;
  let second = 0x41c6ce57 ^ seed;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 2_654_435_761);
    second = Math.imul(second ^ code, 1_597_334_677);
  }
  first =
    Math.imul(first ^ (first >>> 16), 2_246_822_507) ^
    Math.imul(second ^ (second >>> 13), 3_266_489_909);
  second =
    Math.imul(second ^ (second >>> 16), 2_246_822_507) ^
    Math.imul(first ^ (first >>> 13), 3_266_489_909);
  return 4_294_967_296 * (2_097_151 & second) + (first >>> 0);
}

export function h(input: string): string {
  return cyrb53(input).toString(36).padStart(11, '0');
}

export const hash = h;

/**
 * Return the identity material for a hunk.  Line numbers and the hunk header
 * are intentionally absent: moving a hunk without changing its content must
 * preserve its carry-over identity.
 */
export function hunkHash(lines: readonly DiffLine[]): string {
  const encoded = lines
    .map((line) => {
      const marker = line.kind === 'context' ? ' ' : line.kind === 'add' ? '+' : '-';
      return `${marker}${line.text}${line.cr ? '\r' : ''}${line.noEol ? '\\' : ''}`;
    })
    .join('\n');
  return h(`h1\0${encoded}`);
}

/** Alias kept descriptive for callers that construct identities directly. */
export const hashHunk = hunkHash;

export function fileIdForPath(displayPath: string, occurrence = 1): string {
  const suffix = occurrence > 1 ? `~${String(occurrence)}` : '';
  return `f${h(displayPath)}${suffix}`;
}

export const makeFileId = fileIdForPath;
export const fileId = fileIdForPath;

export function hunkIdForHash(fileId: string, hash: string, occurrence = 1): string {
  const suffix = occurrence > 1 ? `#${String(occurrence)}` : '';
  return `${fileId}:${hash}${suffix}`;
}

export const makeHunkId = hunkIdForHash;
export const hunkId = hunkIdForHash;

export function fingerprintForText(normalizedText: string): string {
  return h(`f1\0${normalizedText}`);
}

export const fingerprint = fingerprintForText;
export const diffFingerprint = fingerprintForText;
