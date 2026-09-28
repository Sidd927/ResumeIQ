import { cn } from '../../lib/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Screen-reader label. Pass null when a visible label sits next to the spinner. */
  label?: string | null;
  className?: string;
}

const sizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
} as const;

/** CSS-only spinner: a ring with one coloured segment, rotated by Tailwind's animate-spin. */
export default function LoadingSpinner({ size = 'md', label = 'Loading', className }: LoadingSpinnerProps) {
  return (
    <span role={label ? 'status' : undefined} className={cn('inline-flex', className)}>
      <span
        aria-hidden="true"
        className={cn('animate-spin rounded-full border-current/20 border-t-current', sizes[size])}
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
