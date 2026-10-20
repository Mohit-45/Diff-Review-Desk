import { useState } from 'react';
import type { Clock } from './clock';

/**
 * The time an export carries: read when the dialog opens and held while it stays open, so the
 * preview, the copy and the download all say the same moment instead of drifting by the minute.
 */
export function useExportTime(open: boolean, clock: Clock): string {
  const [stamp, setStamp] = useState(clock);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStamp(clock());
    }
  }
  return stamp;
}
