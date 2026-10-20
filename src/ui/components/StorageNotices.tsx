import { DEGRADED_MESSAGE } from '../../storage/notices';
import type { StorageSnapshot } from '../storageSnapshot';

type StorageNoticesProps = {
  readonly snapshot: StorageSnapshot;
  /** Notes about the open review, such as the diff text being withheld. */
  readonly notes?: readonly string[];
};

/**
 * Plain in-flow text, never an alert: the banner stays while progress lives in memory only, and
 * each other wording appears once however often storage raised it.
 */
export function StorageNotices({ snapshot, notes = [] }: StorageNoticesProps) {
  const messages = [...new Set([...snapshot.notices, ...notes])];
  if (!snapshot.degraded && messages.length === 0) {
    return null;
  }
  return (
    <section className="review-notice storage-notice" aria-label="Saved data">
      {snapshot.degraded ? <p>{DEGRADED_MESSAGE}</p> : null}
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </section>
  );
}
