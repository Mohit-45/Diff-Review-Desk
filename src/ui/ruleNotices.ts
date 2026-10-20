import type { DiffFile, RuleNotice } from '../core/types';

/** One rule that threw, the first file it failed on and how many files it failed on in all. */
export type RuleNoticeGroup = {
  readonly ruleId: string;
  readonly path: string;
  readonly files: number;
};

/**
 * The notices that name a rule are checks that threw. A line over the scan limit has no rule and
 * is not one of these. A rule that fails on every file is still one entry, not thousands.
 */
export function groupThrownRules(
  notices: readonly RuleNotice[],
  files: readonly DiffFile[],
): readonly RuleNoticeGroup[] {
  const paths = new Map(files.map((file) => [file.id, file.displayPath]));
  const failed = new Map<string, { path: string; fileIds: Set<string> }>();
  for (const notice of notices) {
    if (notice.ruleId === null) {
      continue;
    }
    const entry = failed.get(notice.ruleId);
    if (entry === undefined) {
      failed.set(notice.ruleId, {
        path: paths.get(notice.fileId) ?? '',
        fileIds: new Set([notice.fileId]),
      });
    } else {
      entry.fileIds.add(notice.fileId);
    }
  }
  return [...failed].map(([ruleId, entry]) => ({
    ruleId,
    path: entry.path,
    files: entry.fileIds.size,
  }));
}
