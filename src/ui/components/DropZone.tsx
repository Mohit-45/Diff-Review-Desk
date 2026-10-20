import { useState, type DragEvent } from 'react';

type DropEventLike = {
  readonly preventDefault: () => void;
  // A synthetic drop event can arrive without a DataTransfer (some browsers,
  // and programmatic events), even though React's DOM types say it is present.
  readonly dataTransfer?: { readonly files?: ArrayLike<File> | null } | null;
};

export type DropZoneProps = {
  readonly id: string;
  readonly onFile: (file: File, ignoredFileCount: number) => void;
  readonly onUnreadable: () => void;
};

/** A labelled group, not a control: the "Choose file" button is the keyboard path. */
export function DropZone({ id, onFile, onUnreadable }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  function handleDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
  }

  function handleDrop(event: DropEventLike): void {
    event.preventDefault();
    setDragging(false);
    const files: ArrayLike<File> = event.dataTransfer?.files ?? [];
    const first = files[0];
    if (first === undefined) {
      onUnreadable();
      return;
    }
    onFile(first, Math.max(0, files.length - 1));
  }

  // The outer element only receives drag events and carries no semantics. The
  // labelled group inside it is what assistive technology sees.
  return (
    <div
      role="presentation"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        id={id}
        className="drop-zone"
        role="group"
        aria-label="Drop a unified diff"
        data-dragging={dragging ? 'true' : undefined}
      >
        <strong>{dragging ? 'Release to load the diff' : 'Drop a diff here'}</strong>
        <span>or choose a text file from your device.</span>
      </div>
    </div>
  );
}
