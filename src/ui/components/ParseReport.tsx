import type { RefObject } from 'react';
import type { DiffFile, ParseWarning } from '../../core/types';
import {
  reportCount,
  reportLine,
  warnLevelCount,
  warningMessages,
  warningsBanner,
} from '../messages/warnings';
import { InfoIcon, RiskMediumIcon } from './Icons';
import { SafeText } from './SafeText';

export type ParseReportProps = {
  readonly warnings: readonly ParseWarning[];
  readonly files: readonly DiffFile[];
  /** The disclosure's summary, which "Go to first" for parse notes opens and focuses. */
  readonly summaryRef: RefObject<HTMLElement | null>;
};

function pathOf(files: readonly DiffFile[], fileId: string | null): string | null {
  if (fileId === null) {
    return null;
  }
  return files.find((file) => file.id === fileId)?.displayPath ?? null;
}

function ReportItem({
  warning,
  files,
}: {
  readonly warning: ParseWarning;
  readonly files: readonly DiffFile[];
}) {
  const path = pathOf(files, warning.fileId);
  const where = [reportLine(warning.srcLine), reportCount(warning.count)].filter(
    (part) => part !== '',
  );
  return (
    <li>
      <p>
        {warning.level === 'warn' ? <RiskMediumIcon /> : <InfoIcon />}{' '}
        <strong>
          {warning.level === 'warn' ? warningMessages.warningLevel : warningMessages.noteLevel}.
        </strong>{' '}
        <SafeText>{warning.message}</SafeText>
      </p>
      {path === null && where.length === 0 ? null : (
        <p className="parse-where">
          {path === null ? null : <SafeText className="parse-path">{path}</SafeText>}
          {path !== null && where.length > 0 ? ' · ' : null}
          {where.join(' · ')}
        </p>
      )}
      {warning.samples.map((sample, index) => (
        <p className="parse-sample" key={`${String(index)}-${sample}`}>
          <SafeText>{sample}</SafeText>
        </p>
      ))}
    </li>
  );
}

/**
 * What the parser and decoder noticed. The banner carries only the warning count; every item,
 * the informational ones included, sits inside the "Parse report" disclosure. Samples come from
 * the diff, so everything in it renders through SafeText.
 */
export function ParseReport({ warnings, files, summaryRef }: ParseReportProps) {
  if (warnings.length === 0) {
    return null;
  }
  const count = warnLevelCount(warnings);
  const ordered = [
    ...warnings.filter((warning) => warning.level === 'warn'),
    ...warnings.filter((warning) => warning.level !== 'warn'),
  ];
  return (
    <section
      className={count > 0 ? 'banner parse-banner' : 'review-notice parse-banner'}
      aria-label={warningMessages.reportRegion}
    >
      {count > 0 ? (
        <p>
          <RiskMediumIcon /> {warningsBanner(count)} {warningMessages.bannerHint}
        </p>
      ) : null}
      <details className="parse-report">
        <summary ref={summaryRef}>{warningMessages.reportSummary}</summary>
        <ul>
          {ordered.map((warning, index) => (
            <ReportItem
              key={`${warning.code}-${warning.fileId ?? ''}-${String(index)}`}
              warning={warning}
              files={files}
            />
          ))}
        </ul>
      </details>
    </section>
  );
}
