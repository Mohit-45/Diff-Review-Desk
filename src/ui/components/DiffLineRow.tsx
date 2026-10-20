import { LIMITS } from '../../core/limits';
import { cutSegments, type VisualTextSegment } from '../../core/risk/mask';
import type { DiffLine } from '../../core/types';
import { showMoreCharacters } from '../messages/hunk';
import { SafeText } from './SafeText';

type DiffLineRowProps = {
  readonly line: DiffLine;
  /** The line as masked with its whole hunk in view. */
  readonly segments: readonly VisualTextSegment[];
  /** True once "Show more characters" was pressed for this line. */
  readonly expanded: boolean;
  readonly onExpand: () => void;
};

function lineNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

function changeLabel(kind: DiffLine['kind']): { readonly symbol: string; readonly label: string } {
  if (kind === 'add') {
    return { symbol: '+', label: 'added' };
  }
  if (kind === 'remove') {
    return { symbol: '−', label: 'removed' };
  }
  return { symbol: '·', label: 'unchanged' };
}

/** One table row. A line past the character limit is cut after masking, so a secret is never half shown. */
export function DiffLineRow({ line, segments, expanded, onExpand }: DiffLineRowProps) {
  const change = changeLabel(line.kind);
  const cut = expanded ? null : cutSegments(segments, LIMITS.maxLineChars);
  const hidden = cut === null ? 0 : Math.max(0, line.text.length - cut.shownUnits);
  return (
    <tr className={`diff-line diff-line-${line.kind}`} tabIndex={-1}>
      <td className="diff-line-number" aria-label={line.oldNo === null ? 'No old line' : undefined}>
        <span>{lineNumber(line.oldNo)}</span>
      </td>
      <td className="diff-line-number" aria-label={line.newNo === null ? 'No new line' : undefined}>
        <span>{lineNumber(line.newNo)}</span>
      </td>
      <td className="diff-change">
        <span aria-hidden="true">{change.symbol}</span>
        <span className="sr-only">{change.label}</span>
      </td>
      <td className="diff-code" dir="ltr" tabIndex={-1}>
        <code>
          <SafeText segments={cut === null ? segments : cut.segments} />
        </code>
        {hidden > 0 ? (
          <button type="button" className="diff-more" onClick={onExpand}>
            {showMoreCharacters(hidden)}
          </button>
        ) : null}
        {line.noEol === true ? (
          <span className="diff-no-eol">
            {' '}
            <SafeText>no newline at end of file</SafeText>
          </span>
        ) : null}
      </td>
    </tr>
  );
}
