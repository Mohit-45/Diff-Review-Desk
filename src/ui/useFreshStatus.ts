import { useState } from 'react';
import type { Announcement } from './announce';

/**
 * The status line a dialog may show: only what was said after it opened. An earlier message,
 * such as "Loaded 8 files, 11 hunks.", describes something the dialog has nothing to do with.
 * Undefined means there is nothing to show, so the dialog keeps its own status.
 */
export function useFreshStatus(open: boolean, status: Announcement): string | undefined {
  const [wasOpen, setWasOpen] = useState(open);
  const [baseline, setBaseline] = useState(status.id);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBaseline(status.id);
    }
  }
  return open && status.id > baseline ? status.text : undefined;
}
