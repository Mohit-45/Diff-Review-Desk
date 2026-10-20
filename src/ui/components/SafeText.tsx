import { Children, type ReactNode } from 'react';
import { visualizeText, type VisualTextSegment } from '../../core/risk/mask';

type SafeTextProps = {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Segments that were masked with the whole hunk in view; shown as they are, not scanned again. */
  readonly segments?: readonly VisualTextSegment[];
};

function renderSegment(segment: VisualTextSegment, key: string): ReactNode {
  if (segment.kind === 'text') {
    return segment.text;
  }

  if (segment.kind === 'hidden') {
    return (
      <bdi key={key}>
        <span role="img" aria-label={segment.ariaLabel}>
          [{segment.codePoint}]
        </span>
      </bdi>
    );
  }

  return (
    <span key={key} role="img" aria-label={segment.ariaLabel}>
      {segment.text}
    </span>
  );
}

function renderSegments(segments: readonly VisualTextSegment[], key: string): ReactNode {
  return segments.map((segment, index) => renderSegment(segment, `${key}-${String(index)}`));
}

function renderChild(child: ReactNode, key: string): ReactNode {
  if (typeof child === 'string') {
    return renderSegments(visualizeText(child), key);
  }

  return child;
}

export function SafeText({ children, className, segments }: SafeTextProps) {
  return (
    <span className={className}>
      {segments === undefined
        ? Children.toArray(children).map((child, index) => renderChild(child, String(index)))
        : renderSegments(segments, 'segments')}
    </span>
  );
}

export type { SafeTextProps };
