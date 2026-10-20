import { isSensitivePath as isSensitiveExportPath } from '../core/export/redact';
import { visualizeLines, type VisualTextSegment } from '../core/risk/mask';
import { isSensitivePath as isSensitiveRulePath } from '../core/risk/rules/paths';
import type { DiffFile, Hunk } from '../core/types';

export type LineSegments = readonly (readonly VisualTextSegment[])[];

export type HunkMasking = {
  /** What shows until Reveal: every line, masked as one hunk so a key spans its lines. */
  readonly masked: LineSegments;
  /** What shows after Reveal: the same lines with only the hidden characters turned into chips. */
  readonly revealed: () => LineSegments;
  readonly hasMasked: boolean;
};

type Slot = { plain?: HunkMasking; sensitive?: HunkMasking };

/** Hunks never change after parsing, so the scan runs once per hunk, not once per render. */
const cache = new WeakMap<Hunk, Slot>();

function sensitivePathIn(path: string | null | undefined): boolean {
  return (
    path !== undefined &&
    path !== null &&
    (isSensitiveRulePath(path) || isSensitiveExportPath(path))
  );
}

/** True when any name the file goes by is a path whose content must never show unmasked. */
export function isSensitiveFile(file: DiffFile | undefined, filePath: string | undefined): boolean {
  return [filePath, file?.displayPath, file?.oldPath, file?.newPath].some(sensitivePathIn);
}

function containsMasked(lines: LineSegments): boolean {
  return lines.some((segments) => segments.some((segment) => segment.kind === 'masked'));
}

function build(hunk: Hunk, sensitive: boolean): HunkMasking {
  const texts = hunk.lines.map((line) => line.text);
  const masked = visualizeLines(texts, { sensitive });
  let revealed: LineSegments | undefined;
  return {
    masked,
    revealed: () => {
      revealed ??= visualizeLines(texts, { reveal: true });
      return revealed;
    },
    hasMasked: containsMasked(masked),
  };
}

export function maskHunk(hunk: Hunk, sensitive: boolean): HunkMasking {
  const slot = cache.get(hunk) ?? {};
  cache.set(hunk, slot);
  const key = sensitive ? 'sensitive' : 'plain';
  const found = slot[key];
  if (found !== undefined) {
    return found;
  }
  const built = build(hunk, sensitive);
  slot[key] = built;
  return built;
}
