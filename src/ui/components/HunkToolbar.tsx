import type { Ref } from 'react';
import { KeyHint } from '../KeyHint';
import { CommentIcon } from './Icons';
import { hunkMessages } from '../messages/hunk';
import type { Decision } from './HunkCardParts';

type HunkToolbarProps = {
  readonly decision: Decision;
  readonly collapsed: boolean;
  readonly collapsible: boolean;
  readonly approveRef: Ref<HTMLButtonElement>;
  readonly commentRef: Ref<HTMLButtonElement>;
  readonly onChoose: (decision: 'approved' | 'rejected') => void;
  readonly onClear: () => void;
  readonly onComment: () => void;
  readonly onToggleCollapse: () => void;
  /** Present only when the hunk has something masked; this button is the only way to unmask it. */
  readonly reveal: { readonly revealed: boolean; readonly onToggle: () => void } | null;
};

/** Every keyboard shortcut for a hunk has one of these buttons, in the Tab order. */
export function HunkToolbar({
  decision,
  collapsed,
  collapsible,
  approveRef,
  commentRef,
  onChoose,
  onClear,
  onComment,
  onToggleCollapse,
  reveal,
}: HunkToolbarProps) {
  return (
    <div className="hunk-toolbar" role="group" aria-label="Hunk actions">
      <button
        ref={approveRef}
        type="button"
        aria-pressed={decision === 'approved'}
        onClick={() => {
          onChoose('approved');
        }}
      >
        Approve
        <KeyHint command="approve" />
      </button>
      <button
        type="button"
        aria-pressed={decision === 'rejected'}
        onClick={() => {
          onChoose('rejected');
        }}
      >
        Reject
        <KeyHint command="reject" />
      </button>
      <button ref={commentRef} type="button" onClick={onComment}>
        <CommentIcon /> Comment
        <KeyHint command="comment" />
      </button>
      {decision === null ? null : (
        <button type="button" onClick={onClear}>
          Clear decision
          <KeyHint command="clear" />
        </button>
      )}
      {collapsible ? (
        <button type="button" onClick={onToggleCollapse} aria-expanded={!collapsed}>
          {collapsed ? 'Expand hunk' : 'Collapse hunk'}
          <KeyHint command="collapse-hunk" />
        </button>
      ) : null}
      {reveal === null ? null : (
        <button type="button" aria-pressed={reveal.revealed} onClick={reveal.onToggle}>
          {reveal.revealed ? hunkMessages.hideSecrets : hunkMessages.revealSecrets}
        </button>
      )}
    </div>
  );
}
