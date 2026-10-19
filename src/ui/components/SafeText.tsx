import { Children, type ReactNode } from 'react';
import { visualizeText, type VisualTextSegment } from '../../core/risk/mask';

type SafeTextProps = {
  readonly children: ReactNode;
  readonly className?: string;
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

function renderChild(child: ReactNode, key: string): ReactNode {
  if (typeof child === 'string') {
    return visualizeText(child).map((segment, index) => renderSegment(segment, `${key}-${index}`));
  }

  return child;
}

export function SafeText({ children, className }: SafeTextProps) {
  return (
    <span className={className}>
      {Children.toArray(children).map((child, index) => renderChild(child, String(index)))}
    </span>
  );
}

export type { SafeTextProps };
