import { findSecretSpans } from '../core/risk/secrets';
import { isSensitivePath as isSensitiveRulePath } from '../core/risk/rules/paths';
import { isSensitivePath as isSensitiveExportPath } from '../core/export/redact';
import type { DiffFile } from '../core/types';
import type { PersistOptions } from './persist';

export type PersistGate = Pick<
  PersistOptions,
  'sensitivePaths' | 'findSecretSpans' | 'hasSensitivePath' | 'redact'
>;

/** Stored free text keeps its words but loses anything the secret scanner recognises. */
export function redactSecrets(text: string): string {
  const spans = findSecretSpans(text);
  let redacted = text;
  for (const span of [...spans].reverse()) {
    redacted = `${redacted.slice(0, span.start)}[REDACTED:${span.ruleId}]${redacted.slice(span.end)}`;
  }
  return redacted;
}

function pathsOf(files: readonly DiffFile[]): readonly string[] {
  const paths: string[] = [];
  for (const file of files) {
    for (const path of [file.displayPath, file.oldPath, file.newPath]) {
      if (path !== null) {
        paths.push(path);
      }
    }
  }
  return paths;
}

/**
 * The real secret and sensitive-path tests for persistReview. Scanning a large diff is not free
 * and persistReview runs on every decision, so the scan of the open diff happens once.
 */
export function createPersistGate(
  files: readonly DiffFile[],
  diffText: string | null,
): PersistGate {
  let scanned: readonly unknown[] | null = null;
  return {
    sensitivePaths: pathsOf(files),
    hasSensitivePath: (path) => isSensitiveRulePath(path) || isSensitiveExportPath(path),
    findSecretSpans: (text) => {
      if (text !== diffText) {
        return findSecretSpans(text);
      }
      scanned ??= findSecretSpans(text);
      return scanned;
    },
    redact: redactSecrets,
  };
}
