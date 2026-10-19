import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'aria-hidden' | 'viewBox'>;

function Svg({ children, className, ...props }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      {...props}
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PendingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
    </Svg>
  );
}

export function ApprovedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m5 8 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function RejectedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="m6 6 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function RiskHighIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2 14 13H2L8 2Z" fill="currentColor" />
      <path
        d="M8 5.5v3.25M8 11.25v.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function RiskMediumIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m8 2 6 6-6 6-6-6 6-6Z" fill="currentColor" />
    </Svg>
  );
}

export function RiskLowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5" fill="currentColor" />
    </Svg>
  );
}

export function CommentIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3 3.5h10v7H7l-3.5 2v-2H3v-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="5" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 5V3H3v8h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export type ChevronDirection = 'down' | 'left' | 'right' | 'up';

type ChevronIconProps = Omit<IconProps, 'direction'> & { readonly direction?: ChevronDirection };

export function ChevronIcon({ direction = 'down', ...props }: ChevronIconProps) {
  const rotation =
    direction === 'right' ? 0 : direction === 'down' ? 90 : direction === 'left' ? 180 : 270;
  return (
    <Svg {...props}>
      <path
        d="m6 4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`rotate(${rotation} 8 8)`}
      />
    </Svg>
  );
}

export function UnchangedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6.25h8M4 9.75h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function NewOrChangedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 7.25v3.25M8 5.25v.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export type IconName =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'risk-high'
  | 'risk-medium'
  | 'risk-low'
  | 'comment'
  | 'copy'
  | 'chevron'
  | 'unchanged'
  | 'new-or-changed'
  | 'info';

export function Icon({
  name,
  direction,
  ...props
}: Omit<IconProps, 'direction'> & {
  readonly name: IconName;
  readonly direction?: ChevronDirection;
}) {
  switch (name) {
    case 'pending':
      return <PendingIcon {...props} />;
    case 'approved':
      return <ApprovedIcon {...props} />;
    case 'rejected':
      return <RejectedIcon {...props} />;
    case 'risk-high':
      return <RiskHighIcon {...props} />;
    case 'risk-medium':
      return <RiskMediumIcon {...props} />;
    case 'risk-low':
      return <RiskLowIcon {...props} />;
    case 'comment':
      return <CommentIcon {...props} />;
    case 'copy':
      return <CopyIcon {...props} />;
    case 'chevron':
      return <ChevronIcon {...props} direction={direction} />;
    case 'unchanged':
      return <UnchangedIcon {...props} />;
    case 'new-or-changed':
      return <NewOrChangedIcon {...props} />;
    case 'info':
      return <InfoIcon {...props} />;
  }
}

export type { IconProps };
