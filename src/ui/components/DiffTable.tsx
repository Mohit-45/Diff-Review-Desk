import { useEffect, useRef, useState, type RefObject } from 'react';
import { LIMITS } from '../../core/limits';
import { visualizeText } from '../../core/risk/mask';
import type { DiffFile, Hunk } from '../../core/types';
import { isSensitiveFile, maskHunk } from '../hunkMasking';
import { DiffLineRow } from './DiffLineRow';
import { DiffPager } from './DiffPager';
import { SafeText } from './SafeText';

export type DiffTableProps = {
  readonly hunk: Hunk;
  readonly file?: DiffFile;
  readonly filePath?: string;
  readonly hunkNumber?: number;
  readonly totalHunks?: number;
  readonly className?: string;
  /** Secrets show as typed while this is true. Hidden characters stay visible as chips. */
  readonly revealed?: boolean;
  /** Asked once on mount; when it says yes, focus goes to the first line, as after "Show diff". */
  readonly claimFocus?: () => boolean;
};

type FocusRequest = { readonly row: number; readonly cell: boolean };

function displayPath({ file, filePath }: Pick<DiffTableProps, 'file' | 'filePath'>): string {
  return filePath ?? file?.displayPath ?? file?.newPath ?? file?.oldPath ?? 'diff';
}

/** The range of the `@@` row, with the section text masked when the file is sensitive. */
function RangeRow({ hunk, mask }: { readonly hunk: Hunk; readonly mask: boolean }) {
  const oldRange = `${String(hunk.oldStart)},${String(hunk.oldCount)}`;
  const newRange = `${String(hunk.newStart)},${String(hunk.newCount)}`;
  const text =
    hunk.header !== null && hunk.header.length > 0
      ? hunk.header
      : `@@ -${oldRange} +${newRange} @@${hunk.section}`;
  const sectionStart = text.indexOf('@@', 2);
  if (!mask || sectionStart < 0 || text.slice(sectionStart + 2).trim() === '') {
    return <SafeText>{text}</SafeText>;
  }
  const section = text.slice(sectionStart + 2);
  return (
    <>
      <SafeText>{text.slice(0, sectionStart + 2)}</SafeText>
      <SafeText segments={visualizeText(section, { sensitive: true })} />
    </>
  );
}

/** "Show more" removes its own button, so focus moves to what it revealed. */
function useFocusAfterReveal(body: RefObject<HTMLTableSectionElement | null>, first: boolean) {
  const request = useRef<FocusRequest | null>(first ? { row: 0, cell: false } : null);
  useEffect(() => {
    const pending = request.current;
    request.current = null;
    // The first row of the body is the @@ row, so line `n` is row `n + 1`.
    const row = pending === null ? undefined : body.current?.rows[pending.row + 1];
    if (pending !== null && row !== undefined) {
      (pending.cell ? row.cells[3] : row)?.focus();
    }
  });
  return request;
}

export function DiffTable({
  hunk,
  file,
  filePath,
  hunkNumber = hunk.index + 1,
  totalHunks = hunkNumber,
  className,
  revealed = false,
  claimFocus,
}: DiffTableProps) {
  const path = displayPath({ file, filePath });
  const tableClassName = className === undefined ? 'diff-table' : `diff-table ${className}`;
  const sensitive = isSensitiveFile(file, filePath);
  const masking = maskHunk(hunk, sensitive);
  const segments = revealed ? masking.revealed() : masking.masked;
  const total = hunk.lines.length;
  const [shown, setShown] = useState(() => Math.min(total, LIMITS.maxHunkRenderLines));
  const [expandedLines, setExpandedLines] = useState<ReadonlySet<number>>(() => new Set<number>());
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [focusFirst] = useState(() => claimFocus?.() === true);
  const focusRequest = useFocusAfterReveal(bodyRef, focusFirst);
  const count = Math.min(shown, total);

  return (
    <>
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
        <tbody ref={bodyRef}>
          <tr className="diff-range">
            <td colSpan={4}>
              <RangeRow hunk={hunk} mask={sensitive && !revealed} />
              <span className="sr-only">
                Starts at old line {hunk.oldStart}, new line {hunk.newStart}.
              </span>
            </td>
          </tr>
          {hunk.lines.slice(0, count).map((line, index) => (
            <DiffLineRow
              key={`${line.kind}-${String(index)}`}
              line={line}
              segments={segments[index] ?? []}
              expanded={expandedLines.has(index)}
              onExpand={() => {
                focusRequest.current = { row: index, cell: true };
                setExpandedLines((open) => new Set(open).add(index));
              }}
            />
          ))}
        </tbody>
      </table>
      <DiffPager
        shown={count}
        total={total}
        onShow={(next) => {
          focusRequest.current = { row: count, cell: false };
          setShown(next);
        }}
      />
    </>
  );
}
