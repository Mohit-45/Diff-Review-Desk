import { useMemo } from 'react';
import type { DiffFile, Flag, ParseWarning, ReviewState } from '../../core/types';
import { generateAgentFeedback } from '../../core/export/agentFeedback';
import { exportFilename } from '../../core/export/filename';
import { normalizeExportInput } from '../../core/export/model';
import { generateMarkdownSummary } from '../../core/export/summary';
import type { ExportFormat, ExportWarning } from './exportTypes';
import { buildExportWarnings } from './exportWarnings';

export type ExportPreviewOptions = {
  readonly reviewState: ReviewState;
  readonly note: string;
  readonly files: readonly DiffFile[];
  readonly flags: readonly Flag[];
  readonly warnings: readonly ParseWarning[] | readonly string[];
  readonly format: ExportFormat;
  readonly timestamp: string;
};

export type ExportPreview = {
  readonly text: string;
  readonly filename: string;
  readonly notes: readonly ExportWarning[];
};

/** Derives the exported text, its filename and the pre-send notes for one render. */
export function useExportPreview({
  reviewState,
  note,
  files,
  flags,
  warnings,
  format,
  timestamp,
}: ExportPreviewOptions): ExportPreview {
  const input = useMemo(
    () =>
      normalizeExportInput(
        { ...reviewState, overallNote: note },
        files,
        flags,
        warnings,
        timestamp,
      ),
    [reviewState, note, files, flags, warnings, timestamp],
  );
  const text = useMemo(
    () =>
      format === 'agent-feedback' ? generateAgentFeedback(input) : generateMarkdownSummary(input),
    [input, format],
  );
  const filename = useMemo(
    () => exportFilename(format, reviewState.label, reviewState.round, timestamp),
    [format, reviewState.label, reviewState.round, timestamp],
  );
  const notes = useMemo(() => buildExportWarnings(input), [input]);
  return { text, filename, notes };
}
