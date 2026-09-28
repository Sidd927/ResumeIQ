import { cn } from '../../lib/cn';
import { cardClasses } from './button';

/** A grey pulsing placeholder block. Size it with Tailwind classes. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-gray-200/70', className)} />;
}

/** Skeleton shaped like a History card (score box, title, meta, signal bars). */
export function HistoryCardSkeleton() {
  return (
    <li className={cn(cardClasses, 'flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6')} aria-hidden="true">
      <div className="flex items-center gap-4 sm:w-48">
        <Skeleton className="h-14 w-14 rounded-xl" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="flex items-end gap-1">
        {['h-6', 'h-8', 'h-5', 'h-9'].map((h) => (
          <Skeleton key={h} className={cn('w-2 rounded-sm', h)} />
        ))}
        <Skeleton className="ml-5 h-4 w-24" />
      </div>
    </li>
  );
}

/** Skeleton shaped like the match report (gauge card + side cards). */
export function MatchReportSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-5 h-3 w-24" />
      <Skeleton className="mt-2 h-8 w-80 max-w-full" />
      <Skeleton className="mt-2 h-3 w-56" />
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className={cn(cardClasses, 'p-6 lg:col-span-7')}>
          <div className="flex items-center gap-8">
            <Skeleton className="h-40 w-40 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
          <div className="mt-8 space-y-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6 lg:col-span-5">
          <div className={cn(cardClasses, 'space-y-3 p-6')}>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-2/3" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
