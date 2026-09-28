import { Link } from 'react-router-dom';

import { cn } from '../../lib/cn';

/** "ResumeIQ" wordmark with the IQ in brand blue. */
export default function Logo({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-md text-lg font-bold tracking-tight text-gray-900',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white shadow-sm shadow-blue-600/30"
      >
        IQ
      </span>
      <span>
        Resume<span className="text-blue-600">IQ</span>
      </span>
    </Link>
  );
}
