import type { ParseWarning, WarningCode } from '../types';
import type { PipelineWarning, PipelineWarningCode } from './pipeline';
import type { MutableFile, ScanState, WarningRecord } from './scan-state';

export type WarningSpec = {
  readonly code: WarningCode;
  readonly level: ParseWarning['level'];
  readonly message: string;
};

export type WarningSite = {
  readonly file: MutableFile | null;
  readonly srcLine: number | null;
  readonly sample: string;
};

export const WARNINGS = {
  suspiciousChars: {
    code: 'suspicious-chars',
    level: 'warn',
    message: 'A diff line contains hidden or control characters.',
  },
  orphanNoEol: {
    code: 'orphan-lines',
    level: 'warn',
    message: 'A no-newline marker had no preceding hunk line.',
  },
  hunkCountMismatch: {
    code: 'hunk-count-mismatch',
    level: 'warn',
    message: 'Hunk contains lines beyond its declared counts.',
  },
  hunksOutOfOrder: {
    code: 'hunks-out-of-order',
    level: 'warn',
    message: 'Hunks are out of source order.',
  },
  pathEncoding: {
    code: 'path-encoding',
    level: 'warn',
    message: 'A file path could not be decoded as UTF-8.',
  },
  fileHeaderTruncated: {
    code: 'file-header-truncated',
    level: 'warn',
    message: 'A file header exceeded the header line limit.',
  },
  ambiguousPath: {
    code: 'ambiguous-path',
    level: 'warn',
    message: 'The Git file header had ambiguous path separators.',
  },
  combinedUnsupported: {
    code: 'combined-unsupported',
    level: 'warn',
    message: 'Combined diffs are shown as one metadata hunk.',
  },
  badHunkHeader: {
    code: 'bad-hunk-header',
    level: 'warn',
    message: 'A hunk header could not be parsed.',
  },
  unknownLines: {
    code: 'unknown-lines',
    level: 'warn',
    message: 'Lines could not be attributed to a diff hunk.',
  },
  trailerIgnored: {
    code: 'trailer-ignored',
    level: 'info',
    message: 'Trailing non-diff text was ignored.',
  },
  preambleIgnored: {
    code: 'preamble-ignored',
    level: 'info',
    message: 'Preamble text before the first file was ignored.',
  },
  duplicatePath: {
    code: 'duplicate-path',
    level: 'info',
    message: 'The same path appears more than once in this diff.',
  },
  noHunks: {
    code: 'no-hunks',
    level: 'info',
    message: 'The file has no text hunks.',
  },
} as const satisfies Record<string, WarningSpec>;

const PIPELINE_WARNINGS: Record<PipelineWarningCode, WarningSpec> = {
  'crlf-normalised': {
    code: 'crlf-normalised',
    level: 'info',
    message: 'CRLF line endings were normalised.',
  },
  'mixed-eol': {
    code: 'mixed-eol',
    level: 'info',
    message: 'Mixed line endings were retained.',
  },
  'ansi-stripped': {
    code: 'ansi-stripped',
    level: 'info',
    message: 'ANSI colour sequences were stripped from structural lines.',
  },
  'fence-unwrapped': {
    code: 'fence-unwrapped',
    level: 'info',
    message: 'One Markdown code fence was unwrapped.',
  },
  'nul-replaced': {
    code: 'nul-replaced',
    level: 'warn',
    message: 'NUL characters were replaced with visible symbols.',
  },
  'invalid-utf8': {
    code: 'invalid-utf8',
    level: 'warn',
    message: 'Invalid UTF-8 bytes were replaced with U+FFFD.',
  },
};

/** Where a warning points: the file, the 1-based source line of the zero-based `index`, and a sample. */
export function siteAt(file: MutableFile | null, index: number, sample: string): WarningSite {
  return { file, srcLine: index + 1, sample };
}

function warningSample(value: string): string {
  return value.slice(0, 120);
}

export function addWarning(state: ScanState, spec: WarningSpec, site: WarningSite): void {
  const existing = state.warnings.find(
    (warning) => warning.code === spec.code && warning.file === site.file,
  );
  if (existing !== undefined) {
    existing.count += 1;
    if (existing.samples.length < 3) {
      existing.samples.push(warningSample(site.sample));
    }
    return;
  }
  if (state.warnings.length >= state.limits.maxWarnings) {
    state.warningsDropped += 1;
    return;
  }
  state.warnings.push({
    code: spec.code,
    level: spec.level,
    message: spec.message,
    file: site.file,
    srcLine: site.srcLine,
    count: 1,
    samples: [warningSample(site.sample)],
  });
}

export function addPipelineWarnings(state: ScanState, warnings: readonly PipelineWarning[]): void {
  for (const warning of warnings) {
    const spec = PIPELINE_WARNINGS[warning.code];
    const site: WarningSite = { file: null, srcLine: null, sample: warning.sample };
    for (let count = 0; count < warning.count; count += 1) {
      addWarning(state, spec, site);
    }
  }
}

export function toWarnings(records: readonly WarningRecord[]): ParseWarning[] {
  return records.map((warning) => ({
    code: warning.code,
    level: warning.level,
    message: warning.message,
    fileId: warning.file?.id ?? null,
    srcLine: warning.srcLine,
    count: warning.count,
    samples: warning.samples,
  }));
}
