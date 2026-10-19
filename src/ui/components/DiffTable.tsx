import type { DiffFile, Hunk } from '../../core/types';
import { SafeText } from './SafeText';

export type DiffTableProps = {
  readonly hunk: Hunk;
  readonly file?: DiffFile;
  readonly filePath?: string;
  readonly hunkNumber?: number;
  readonly totalHunks?: number;
  readonly className?: string;
};

function displayPath({ file, filePath }: Pick<DiffTableProps, 'file' | 'filePath'>): string {
  return filePath ?? file?.displayPath ?? file?.newPath ?? file?.oldPath ?? 'diff';
}

function rangeText(hunk: Hunk): string {
  if (hunk.header !== null && hunk.header.length > 0) {
    return hunk.header;
  }
  return `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.section}`;
}

function lineNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

function changeLabel(kind: 'context' | 'add' | 'remove'): {
  readonly symbol: string;
  readonly label: string;
} {
  if (kind === 'add') {
    return { symbol: '+', label: 'added' };
  }
  if (kind === 'remove') {
    return { symbol: '−', label: 'removed' };
  }
  return { symbol: '·', label: 'unchanged' };
}

export function DiffTable({
  hunk,
  file,
  filePath,
  hunkNumber = hunk.index + 1,
  totalHunks = hunkNumber,
  className,
}: DiffTableProps) {
  const path = displayPath({ file, filePath });
  const tableClassName = className === undefined ? 'diff-table' : `diff-table ${className}`;

  return (
    <table className={tableClassName}>
      <caption>
        <span className="sr-only">Changes in </span>
        <SafeText>{path}</SafeText>
        <span className="sr-only">
          , hunk {hunkNumber} of {totalHunks}
        </span>
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Old line</span>
          </th>
          <th scope="col">
            <span className="sr-only">New line</span>
          </th>
          <th scope="col">
            <span className="sr-only">Change</span>
          </th>
          <th scope="col">
            <span className="sr-only">Code</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="diff-range">
          <td colSpan={4}>
            <SafeText>{rangeText(hunk)}</SafeText>
            <span className="sr-only">
              Starts at old line {hunk.oldStart}, new line {hunk.newStart}.
            </span>
          </td>
        </tr>
        {hunk.lines.map((line, index) => {
          const change = changeLabel(line.kind);
          return (
            <tr key={`${line.kind}-${index}`} className={`diff-line diff-line-${line.kind}`}>
              <td
                className="diff-line-number"
                aria-label={line.oldNo === null ? 'No old line' : undefined}
              >
                <span>{lineNumber(line.oldNo)}</span>
              </td>
              <td
                className="diff-line-number"
                aria-label={line.newNo === null ? 'No new line' : undefined}
              >
                <span>{lineNumber(line.newNo)}</span>
              </td>
              <td className="diff-change">
                <span aria-hidden="true">{change.symbol}</span>
                <span className="sr-only">{change.label}</span>
              </td>
              <td className="diff-code" dir="ltr">
                <code>
                  <SafeText>{line.text}</SafeText>
                </code>
                {line.noEol === true ? (
                  <span className="diff-no-eol">
                    {' '}
                    <SafeText>no newline at end of file</SafeText>
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
