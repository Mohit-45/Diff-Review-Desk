import { describe, expect, it } from 'vitest';
import { parsedFiles } from '../app/appFixtures';
import { LIMITS } from '../core/limits';
import { longHunkDiff, manyHunkDiff } from './diffFixtures';
import {
  COLLAPSE_FILE_BODY_LINES,
  EMPTY_RENDER_STATE,
  WINDOW_FILE_HUNKS,
  bodyLineCount,
  collapsedByDefault,
  defaultCollapsedIds,
  planFiles,
  withMoreHunks,
  withTarget,
} from './renderPlan';
import { buildEntries } from './reviewModel';

function entriesOf(text: string) {
  return buildEntries(parsedFiles(text).files);
}

describe('LIMITS-WINDOW files over 200 hunks render 100 at a time', () => {
  it('LIMITS-WINDOW-FIRST draws the first 100 of a 600 hunk file and keeps the full list', () => {
    const entries = entriesOf(manyHunkDiff('src/big.ts', 600));
    const [plan] = planFiles(entries, EMPTY_RENDER_STATE, null);

    expect(LIMITS.maxFileRenderHunks).toBe(100);
    expect(plan?.entries).toHaveLength(600);
    expect(plan?.shown).toHaveLength(100);
    expect(plan?.shown[0]?.hunk.id).toBe(entries[0]?.hunk.id);
  });

  it('LIMITS-WINDOW-BOUND draws the same count however many hunks the file has', () => {
    const drawn = [250, 600, 3000].map((count) => {
      const [plan] = planFiles(
        entriesOf(manyHunkDiff('src/big.ts', count)),
        EMPTY_RENDER_STATE,
        null,
      );
      return plan?.shown.length;
    });

    expect(drawn).toEqual([100, 100, 100]);
  });

  it('LIMITS-WINDOW-EDGE draws every hunk of a file with exactly 200 hunks', () => {
    const [plan] = planFiles(
      entriesOf(manyHunkDiff('src/edge.ts', WINDOW_FILE_HUNKS)),
      EMPTY_RENDER_STATE,
      null,
    );

    expect(plan?.shown).toHaveLength(200);
  });

  it('LIMITS-WINDOW-MORE adds 100 per step and stops at the end', () => {
    const entries = entriesOf(manyHunkDiff('src/big.ts', 250));
    const fileId = entries[0]?.file.id ?? '';
    let state = withMoreHunks(EMPTY_RENDER_STATE, fileId);

    expect(planFiles(entries, state, null)[0]?.shown).toHaveLength(200);
    state = withMoreHunks(state, fileId);
    expect(planFiles(entries, state, null)[0]?.shown).toHaveLength(250);
  });

  it('LIMITS-WINDOW-CURRENT always draws the current hunk, wherever it sits', () => {
    const entries = entriesOf(manyHunkDiff('src/big.ts', 600));
    const target = entries[450];
    const [plan] = planFiles(entries, EMPTY_RENDER_STATE, target?.hunk.id ?? null);

    expect(plan?.shown).toHaveLength(451);
    expect(plan?.shown.at(-1)).toBe(target);
  });

  it('LIMITS-WINDOW-TARGET widens the window to a page boundary that holds the target', () => {
    const entries = entriesOf(manyHunkDiff('src/big.ts', 600));
    const fileId = entries[0]?.file.id ?? '';
    const far = entries[450];
    const near = entries[5];

    expect(far).toBeDefined();
    const widened = far === undefined ? EMPTY_RENDER_STATE : withTarget(EMPTY_RENDER_STATE, far);
    expect(widened.windows.get(fileId)).toBe(500);
    expect(near === undefined ? widened : withTarget(widened, near)).toBe(widened);
    expect(near === undefined ? EMPTY_RENDER_STATE : withTarget(EMPTY_RENDER_STATE, near)).toBe(
      EMPTY_RENDER_STATE,
    );
  });

  it('LIMITS-WINDOW-FILES groups visible hunks by file in order and windows each file alone', () => {
    const text = `${manyHunkDiff('src/a.ts', 300)}${manyHunkDiff('src/b.ts', 2)}`;
    const entries = entriesOf(text);
    const plans = planFiles(entries, EMPTY_RENDER_STATE, null);

    expect(plans.map((plan) => plan.file.displayPath)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(plans.map((plan) => plan.shown.length)).toEqual([100, 2]);
    const filtered = planFiles(
      entries.filter((entry) => entry.number > 299),
      EMPTY_RENDER_STATE,
      null,
    );
    expect(filtered.map((plan) => plan.shown.length)).toEqual([1, 2]);
  });
});

describe('LIMITS-COLLAPSE large and generated files start folded', () => {
  it('LIMITS-COLLAPSE-GENERATED folds a lock file whatever its size', () => {
    const [entry] = entriesOf(manyHunkDiff('package-lock.json', 1));
    const file = entry?.file;

    expect(file === undefined ? null : collapsedByDefault(file)).toBe(true);
    expect(defaultCollapsedIds(entry === undefined ? [] : [entry]).has(entry?.hunk.id ?? '')).toBe(
      true,
    );
  });

  it('LIMITS-COLLAPSE-LINES folds a file at 1,000 body lines and not at 999', () => {
    const folded = entriesOf(longHunkDiff('src/big.ts', COLLAPSE_FILE_BODY_LINES))[0]?.file;
    const open = entriesOf(longHunkDiff('src/small.ts', COLLAPSE_FILE_BODY_LINES - 1))[0]?.file;

    expect(folded === undefined ? 0 : bodyLineCount(folded)).toBe(1000);
    expect(folded === undefined ? false : collapsedByDefault(folded)).toBe(true);
    expect(open === undefined ? true : collapsedByDefault(open)).toBe(false);
  });

  it('LIMITS-COLLAPSE-SUM adds the lines of every hunk of the file', () => {
    const file = entriesOf(manyHunkDiff('src/many.ts', 400))[0]?.file;

    expect(file === undefined ? 0 : bodyLineCount(file)).toBe(1200);
    expect(file === undefined ? false : collapsedByDefault(file)).toBe(true);
  });

  it('LIMITS-COLLAPSE-IDS folds only text hunks of folded files', () => {
    const text = `${manyHunkDiff('package-lock.json', 2)}${manyHunkDiff('src/ok.ts', 2)}`;
    const entries = entriesOf(text);
    const ids = defaultCollapsedIds(entries);

    expect(entries.map((entry) => ids.has(entry.hunk.id))).toEqual([true, true, false, false]);
  });
});
