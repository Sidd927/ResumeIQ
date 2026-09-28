import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../../lib/cn';
import { buttonClasses } from './button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; to: string };
  className?: string;
}

/** Icon + message + optional CTA. Used before the first match and for empty/not-found views. */
export default function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="relative mb-5">
        <div aria-hidden="true" className="absolute inset-0 -m-3 rounded-full bg-blue-100/60 blur-xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white text-blue-600 shadow-sm">
          {icon}
        </div>
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-gray-500">{description}</p>}
      {action && (
        <Link to={action.to} className={buttonClasses('primary', 'md', 'mt-6')}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
