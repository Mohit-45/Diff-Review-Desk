import { LIMITS } from '../../core/limits';
import { linesShown, showAllLines, showNextLines } from '../messages/hunk';

type DiffPagerProps = {
  readonly shown: number;
  readonly total: number;
  readonly onShow: (count: number) => void;
};

/** Lines revealed by the first button: one page, or whatever is left of it. */
export function nextPageCount(shown: number, total: number): number {
  return Math.min(total, shown + LIMITS.maxHunkRenderLines);
}

/** Lines revealed by "Show all": everything left, but never more than the cap in one go. */
export function showAllCount(shown: number, total: number): number {
  return Math.min(total, shown + LIMITS.maxShowAllLines);
}

/** Buttons under a hunk table that has more lines than are rendered. */
export function DiffPager({ shown, total, onShow }: DiffPagerProps) {
  const remaining = total - shown;
  if (remaining <= 0) {
    return null;
  }
  const next = nextPageCount(shown, total);
  const all = showAllCount(shown, total);
  return (
    <div className="diff-paging" role="group" aria-label="More lines">
      <p>{linesShown(shown, total)}</p>
      <button
        type="button"
        onClick={() => {
          onShow(next);
        }}
      >
        {next === total ? showAllLines(remaining) : showNextLines(next - shown, remaining)}
      </button>
      {remaining > LIMITS.maxHunkRenderLines ? (
        <button
          type="button"
          onClick={() => {
            onShow(all);
          }}
        >
          {all === total ? showAllLines(remaining) : showNextLines(all - shown, remaining)}
        </button>
      ) : null}
    </div>
  );
}
