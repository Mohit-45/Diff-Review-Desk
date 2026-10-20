import { Fragment } from 'react';
import type { DiffFile, Flag, Hunk, HunkReview } from '../../core/types';
import { isSensitiveFile, maskHunk } from '../hunkMasking';
import { hunkMessages, metaHeading, showDiff } from '../messages/hunk';
import { SafeText } from './SafeText';
import {
  ApprovedIcon,
  InfoIcon,
  PendingIcon,
  RejectedIcon,
  RiskHighIcon,
  RiskLowIcon,
  RiskMediumIcon,
} from './Icons';
import { DiffTable } from './DiffTable';

export type Decision = HunkReview['decision'];

export function pathFor(file: DiffFile | undefined, filePath: string | undefined): string {
  return filePath ?? file?.displayPath ?? file?.newPath ?? file?.oldPath ?? 'diff';
}

/** The lines a hunk covers. A side with no lines (a new or deleted file) does not pull the range to 0. */
function hunkLines(hunk: Hunk): { readonly start: number; readonly end: number } {
  const sides = [
    { first: hunk.oldStart, count: hunk.oldCount },
    { first: hunk.newStart, count: hunk.newCount },
  ].filter((side) => side.count > 0);
  if (sides.length === 0) {
    const only = Math.max(hunk.oldStart, hunk.newStart);
    return { start: only, end: only };
  }
  return {
    start: Math.min(...sides.map((side) => side.first)),
    end: Math.max(...sides.map((side) => side.first + side.count - 1)),
  };
}

function metaReason(reason: Hunk['meta'][number]): string {
  switch (reason) {
    case 'rename':
      return 'This file was renamed; there are no line changes to review.';
    case 'copy':
      return 'This file was copied; there are no line changes to review.';
    case 'mode-change':
      return 'This hunk records a file mode change.';
    case 'type-change':
      return 'This hunk records a file type change.';
    case 'binary':
      return 'This is a binary change and has no text diff to display.';
    case 'empty-file':
      return 'This hunk records an empty file.';
    case 'no-hunks':
      return 'This file has no text hunks.';
    case 'content-omitted':
      return 'The file content was omitted from the diff.';
    case 'combined':
      return 'This combined diff is shown as metadata.';
    case 'unparsed':
      return 'Some diff lines could not be parsed. Review them as raw text.';
  }
}

function flagIcon(severity: Flag['severity']) {
  if (severity === 'high') {
    return <RiskHighIcon />;
  }
  return severity === 'medium' ? <RiskMediumIcon /> : <RiskLowIcon />;
}

function decisionIcon(decision: Decision) {
  if (decision === 'approved') {
    return <ApprovedIcon />;
  }
  return decision === 'rejected' ? <RejectedIcon /> : <PendingIcon />;
}

export function decisionLabel(decision: Decision): string {
  if (decision === 'approved') {
    return 'Approved';
  }
  return decision === 'rejected' ? 'Rejected' : 'Pending';
}

function highestSeverity(flags: readonly Flag[]): Flag['severity'] | null {
  for (const severity of ['high', 'medium', 'low'] as const) {
    if (flags.some((flag) => flag.severity === severity)) {
      return severity;
    }
  }
  return null;
}

/** Flags that belong to this hunk: file-wide ones plus the ones pinned to its id. */
export function relevantFlagsFor(
  flags: readonly Flag[],
  file: DiffFile | undefined,
  hunk: Hunk,
): readonly Flag[] {
  return flags.filter((flag) => {
    if (file !== undefined && flag.fileId !== file.id) {
      return false;
    }
    return flag.hunkId === null || flag.hunkId === hunk.id;
  });
}

/** The hidden summary the article's aria-describedby points at. */
export function hunkSummary(decision: Decision, flags: readonly Flag[], comment: string): string {
  const count = flags.length;
  const highest = highestSeverity(flags) ?? 'none';
  const hasComment = comment.trim().length > 0 ? 'yes' : 'no';
  return `${decisionLabel(decision)}. ${String(count)} flag${count === 1 ? '' : 's'}, highest ${highest}. Comment: ${hasComment}.`;
}

type HunkHeaderProps = {
  readonly id: string;
  readonly hunk: Hunk;
  readonly hunkNumber: number;
  readonly totalHunks: number;
  readonly decision: Decision;
};

function hunkHeading(hunk: Hunk, hunkNumber: number, totalHunks: number): string {
  const place = `Hunk ${String(hunkNumber)} of ${String(totalHunks)}`;
  if (hunk.kind === 'meta') {
    return `${place}, ${metaHeading(hunk.meta[0])}`;
  }
  const range = hunkLines(hunk);
  return `${place}, lines ${String(range.start)}–${String(range.end)}`;
}

export function HunkHeader({ id, hunk, hunkNumber, totalHunks, decision }: HunkHeaderProps) {
  return (
    <header className="hunk-header">
      <h3 id={id}>{hunkHeading(hunk, hunkNumber, totalHunks)}</h3>
      <span className={`decision decision-${decision ?? 'pending'}`}>
        {decisionIcon(decision)}
        <span>{decisionLabel(decision)}</span>
      </span>
    </header>
  );
}

export function FlagSection({ flags }: { readonly flags: readonly Flag[] }) {
  if (flags.length === 0) {
    return (
      <p className="no-flags">
        <InfoIcon /> {hunkMessages.noFlags}
      </p>
    );
  }
  return (
    <>
      <div className="risk-chips" role="group" aria-label="Risk flags">
        {flags.map((flag, index) => (
          <span
            className={`risk-chip risk-${flag.severity}`}
            key={`${flag.ruleId}-${String(index)}`}
          >
            {flagIcon(flag.severity)}
            <SafeText>{flag.severity}</SafeText>
            <SafeText>{flag.title}</SafeText>
          </span>
        ))}
      </div>
      <details className="flag-details">
        <summary>Why flagged ({flags.length})</summary>
        <ul>
          {flags.map((flag, index) => (
            <li key={`${flag.ruleId}-detail-${String(index)}`}>
              <strong>
                <SafeText>{flag.title}</SafeText>
              </strong>
              <p>
                <SafeText>{flag.why}</SafeText>
              </p>
              {flag.evidence === undefined ? null : (
                <p className="flag-evidence">
                  <SafeText>{flag.evidence}</SafeText>
                </p>
              )}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

type HunkBodyProps = {
  readonly hunk: Hunk;
  readonly file: DiffFile | undefined;
  readonly path: string;
  readonly hunkNumber: number;
  readonly totalHunks: number;
  readonly collapsed: boolean;
  readonly revealed: boolean;
  /** Opens a folded diff; the card hands focus to the first row it shows. */
  readonly onShowDiff: () => void;
  /** Called once when the table mounts; true means focus its first row. */
  readonly claimFocus: () => boolean;
};

export function HunkBody({
  hunk,
  file,
  path,
  hunkNumber,
  totalHunks,
  collapsed,
  revealed,
  onShowDiff,
  claimFocus,
}: HunkBodyProps) {
  if (hunk.kind === 'meta') {
    const masking = maskHunk(hunk, isSensitiveFile(file, path));
    const lines = revealed ? masking.revealed() : masking.masked;
    return (
      <>
        <p className="meta-hunk-message">
          <SafeText>{metaReason(hunk.meta[0] ?? 'unparsed')}</SafeText>
        </p>
        {lines.length > 0 ? (
          <pre className="meta-hunk-lines">
            {lines.map((segments, index) => (
              <Fragment key={index}>
                {index === 0 ? null : '\n'}
                <SafeText segments={segments} />
              </Fragment>
            ))}
          </pre>
        ) : null}
      </>
    );
  }
  if (collapsed) {
    return (
      <div className="diff-folded">
        <button type="button" onClick={onShowDiff}>
          {showDiff(hunk.lines.length)}
        </button>
      </div>
    );
  }
  return (
    <DiffTable
      hunk={hunk}
      file={file}
      filePath={path}
      hunkNumber={hunkNumber}
      totalHunks={totalHunks}
      revealed={revealed}
      claimFocus={claimFocus}
    />
  );
}
