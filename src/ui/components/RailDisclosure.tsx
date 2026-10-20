import { useState, type ReactNode } from 'react';
import { useWideRail } from '../useWideRail';

export type RailDisclosureState = {
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  /** Folds the list away again, for a choice that moves the reader to the diff. */
  readonly collapse: () => void;
};

/**
 * Wide screens show the files as a column and the list is always open; below that the list is a
 * disclosure that starts closed, so the diff does not begin a screenful of files down.
 */
export function useRailDisclosure(): RailDisclosureState {
  const wide = useWideRail();
  const [chosen, setChosen] = useState(false);
  return {
    open: wide || chosen,
    onToggle: (next) => {
      if (!wide) {
        setChosen(next);
      }
    },
    collapse: () => {
      setChosen(false);
    },
  };
}

type RailDisclosureProps = {
  readonly fileCount: number;
  readonly state: RailDisclosureState;
  readonly children: ReactNode;
};

/** The "Files (N)" summary is hidden by the stylesheet while the rail is a column. */
export function RailDisclosure({ fileCount, state, children }: RailDisclosureProps) {
  return (
    <details
      className="rail-disclosure"
      open={state.open}
      onToggle={(event) => {
        state.onToggle(event.currentTarget.open);
      }}
    >
      <summary>{`Files (${String(fileCount)})`}</summary>
      <div className="rail-disclosure-body">{children}</div>
    </details>
  );
}
