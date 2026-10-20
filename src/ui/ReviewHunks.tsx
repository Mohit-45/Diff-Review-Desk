import { carryBadgeIndex } from '../app/carryFacts';
import type { Flag, ReviewState } from '../core/types';
import { HunkCard } from './components/HunkCard';
import type { Decision } from './components/HunkCardParts';
import type { CommentCloseReason } from './components/CommentEditor';
import { hunkMessages, hunksShown, showNextHunks } from './messages/hunk';
import { planFiles, type FilePlan, type RenderState } from './renderPlan';
import type { Entry } from './reviewModel';
import { LIMITS } from '../core/limits';

export type HunkHandlers = {
  readonly onDecision: (id: string, decision: Decision) => void;
  readonly onComment: (id: string, comment: string) => void;
  readonly onCommentClose: (id: string, reason: CommentCloseReason) => void;
  readonly onDraftChange: (id: string, text: string) => void;
  readonly onEditingChange: (id: string, editing: boolean) => void;
  readonly onCollapseChange: (id: string, collapsed: boolean) => void;
  readonly onRevealChange: (id: string, revealed: boolean) => void;
  /** Draws the next window of a long file; focus goes to the first hunk it added. */
  readonly onShowMoreHunks: (fileId: string, firstNewHunkId: string | null) => void;
  readonly onFocusHunk: (id: string) => void;
  readonly register: (id: string, element: HTMLElement | null) => void;
};

/** The handlers that open up what the render limits fold away; the screen adds them to the card handlers. */
export type LimitHandlerName = 'onRevealChange' | 'onShowMoreHunks';

export type HunkListState = {
  readonly state: ReviewState;
  readonly flags: readonly Flag[];
  readonly currentId: string | null;
  readonly collapsedIds: ReadonlySet<string>;
  readonly editingId: string | null;
  readonly render: RenderState;
  readonly revealedIds: ReadonlySet<string>;
};

type ReviewHunksProps = {
  readonly entries: readonly Entry[];
  readonly totalHunks: number;
  readonly list: HunkListState;
  readonly handlers: HunkHandlers;
};

type FileGroupProps = {
  readonly plan: FilePlan;
  readonly totalHunks: number;
  readonly list: HunkListState;
  readonly handlers: HunkHandlers;
};

function HunkWindowPager({ plan, handlers }: Pick<FileGroupProps, 'plan' | 'handlers'>) {
  const remaining = plan.entries.length - plan.shown.length;
  if (remaining <= 0) {
    return null;
  }
  const next = Math.min(remaining, LIMITS.maxFileRenderHunks);
  return (
    <div className="file-limit file-paging" role="group" aria-label="More hunks">
      <p>{hunksShown(plan.shown.length, plan.entries.length)}</p>
      <button
        type="button"
        onClick={() => {
          handlers.onShowMoreHunks(plan.file.id, plan.entries[plan.shown.length]?.hunk.id ?? null);
        }}
      >
        {showNextHunks(next, remaining)}
      </button>
    </div>
  );
}

function FileGroup({ plan, totalHunks, list, handlers }: FileGroupProps) {
  const badgeFor = carryBadgeIndex(list.state);
  return (
    <>
      {plan.shown.map(({ file, hunk, number }) => (
        <HunkCard
          key={hunk.id}
          file={file}
          hunk={hunk}
          hunkNumber={number}
          totalHunks={totalHunks}
          reviewState={list.state}
          flags={list.flags}
          current={list.currentId === hunk.id}
          collapsed={list.collapsedIds.has(hunk.id)}
          editing={list.editingId === hunk.id}
          revealed={list.revealedIds.has(hunk.id)}
          carry={badgeFor(hunk.id)}
          articleRef={(element) => {
            handlers.register(hunk.id, element);
          }}
          onFocusHunk={() => {
            handlers.onFocusHunk(hunk.id);
          }}
          onDecision={(decision) => {
            handlers.onDecision(hunk.id, decision);
          }}
          onComment={(comment) => {
            handlers.onComment(hunk.id, comment);
          }}
          onCommentClose={(reason) => {
            handlers.onCommentClose(hunk.id, reason);
          }}
          onDraftChange={(text) => {
            handlers.onDraftChange(hunk.id, text);
          }}
          onEditingChange={(editing) => {
            handlers.onEditingChange(hunk.id, editing);
          }}
          onCollapseChange={(collapsed) => {
            handlers.onCollapseChange(hunk.id, collapsed);
          }}
          onRevealChange={(revealed) => {
            handlers.onRevealChange(hunk.id, revealed);
          }}
        />
      ))}
      <HunkWindowPager plan={plan} handlers={handlers} />
    </>
  );
}

/** The hunk cards in main, file by file. Each card is controlled by the review screen. */
export function ReviewHunks({ entries, totalHunks, list, handlers }: ReviewHunksProps) {
  const plans = planFiles(entries, list.render, list.currentId);
  return (
    <>
      {plans.map((plan) => (
        <FileGroup
          key={plan.file.id}
          plan={plan}
          totalHunks={totalHunks}
          list={list}
          handlers={handlers}
        />
      ))}
      <p className="review-disclaimer">{hunkMessages.footer}</p>
    </>
  );
}
