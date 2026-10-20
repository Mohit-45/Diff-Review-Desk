import { useCallback, useState } from 'react';

const MAX_LENGTH = 120;

export type Announcement = { readonly id: number; readonly text: string };

function clip(text: string): string {
  return text.length <= MAX_LENGTH ? text : `${text.slice(0, MAX_LENGTH - 1)}…`;
}

/** Last message wins; the id changes on every call so a repeated message is read again. */
export function useAnnouncer(): readonly [Announcement, (text: string) => void] {
  const [announcement, setAnnouncement] = useState<Announcement>({ id: 0, text: '' });
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ id: previous.id + 1, text: clip(text) }));
  }, []);
  return [announcement, announce];
}

/** The one polite live region. Keying the text node makes assistive tech re-read repeats. */
export function LiveRegion({ announcement }: { readonly announcement: Announcement }) {
  return (
    <p className="status-line" role="status" aria-atomic="true">
      <span key={announcement.id}>{announcement.text}</span>
    </p>
  );
}
