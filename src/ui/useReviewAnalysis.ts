import { useMemo } from 'react';
import { analyze } from '../core/risk/engine';
import type { DiffFile, Flag, ParseWarning } from '../core/types';
import { warnLevelCount } from './messages/warnings';
import { groupThrownRules, type RuleNoticeGroup } from './ruleNotices';

export type ReviewAnalysis = {
  readonly flags: readonly Flag[];
  /** Rules that threw, one entry per rule. Any entry means no diff text rests in storage. */
  readonly ruleGroups: readonly RuleNoticeGroup[];
  /** Only warnings reach an export; the informational items stay in the parse report. */
  readonly exportWarnings: readonly ParseWarning[];
};

const NO_WARNINGS: readonly ParseWarning[] = [];

function isWarning(warning: ParseWarning): boolean {
  return warning.level === 'warn';
}

/** The risk flags of the open diff, the checks that could not run, and what an export reports. */
export function useReviewAnalysis(
  files: readonly DiffFile[],
  warnings: readonly ParseWarning[],
): ReviewAnalysis {
  const analysis = useMemo(() => analyze(files), [files]);
  const ruleGroups = useMemo(
    () => groupThrownRules(analysis.notices, files),
    [analysis.notices, files],
  );
  const exportWarnings = useMemo(
    () => (warnLevelCount(warnings) === 0 ? NO_WARNINGS : warnings.filter(isWarning)),
    [warnings],
  );
  return { flags: analysis.flags, ruleGroups, exportWarnings };
}
