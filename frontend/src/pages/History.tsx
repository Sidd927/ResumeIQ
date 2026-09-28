import { Link } from 'react-router-dom';

import { buttonClasses, cardClasses } from '../components/ui/button';
import EmptyState from '../components/ui/EmptyState';
import { HistoryCardSkeleton } from '../components/ui/Skeleton';
import { AlertIcon, ArrowRightIcon, ClockIcon } from '../components/ui/icons';
import { useHistory } from '../hooks/useHistory';
import { cn } from '../lib/cn';
import { formatDate, formatRelativeTime, formatTime } from '../lib/format';
import { getScoreBand } from '../lib/score';
import { SIGNALS, toPercent } from '../lib/signals';
import type { JobDescriptionResponse, MatchResponse } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** Four tiny vertical bars — one per signal — with a text alternative. */
function MiniSignalBars({ match }: { match: MatchResponse }) {
  const summary = SIGNALS.map((s) => `${s.name} ${toPercent(match[s.key])}`).join(', ');
  return (
    <div className="flex h-9 items-end gap-1" role="img" aria-label={`Sub-scores: ${summary}`}>
      {SIGNALS.map((s) => (
        <div key={s.key} className="flex h-full w-2 items-end overflow-hidden rounded-sm bg-gray-100" title={`${s.name}: ${toPercent(match[s.key])}`}>
          <div className={cn('w-full rounded-sm', s.barClass)} style={{ height: `${toPercent(match[s.key])}%` }} />
        </div>
      ))}
    </div>
  );
}

function HistoryCard({ match, job }: { match: MatchResponse; job: JobDescriptionResponse | undefined }) {
  const band = getScoreBand(match.composite_score);
  const title = job?.parsed_json?.title ?? `Job description #${match.jd_id}`;
  const missing = match.missing_skills.length;

  return (
    <li>
      <Link
        to={`/match/${match.id}`}
        className={cn(
          cardClasses,
          'group flex flex-col gap-4 p-5 transition-all duration-200 sm:flex-row sm:items-center sm:gap-6',
          'hover:border-gray-300 hover:shadow-md motion-safe:hover:-translate-y-0.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
        )}
      >
        {/* Score */}
        <div className="flex items-center gap-4 sm:w-48 sm:shrink-0">
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-gray-50 ring-1 ring-inset ring-gray-200">
            <span className="text-base font-bold leading-none text-gray-900 tabular-nums">{match.composite_score.toFixed(1)}</span>
            <span className="mt-0.5 text-[10px] text-gray-400">/100</span>
          </div>
          <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold', band.textClass)}>
            <span className={cn('h-2 w-2 rounded-full', band.dotClass)} aria-hidden="true" />
            {band.label}
          </span>
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-blue-700">{title}</p>
          <p className="mt-1 text-xs text-gray-500">
            <time dateTime={match.created_at} title={`${formatDate(match.created_at)} · ${formatTime(match.created_at)}`}>
              {formatRelativeTime(match.created_at)}
            </time>
            <span className="mx-1.5 text-gray-300">•</span>
            <span className={missing ? 'text-red-600' : 'text-green-700'}>
              {missing ? `${missing} missing skill${missing === 1 ? '' : 's'}` : 'No missing skills'}
            </span>
          </p>
        </div>

        {/* Signals + CTA */}
        <div className="flex items-center justify-between gap-6 sm:justify-end">
          <MiniSignalBars match={match} />
          <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
            View Details
            <ArrowRightIcon className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </li>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cn(cardClasses, 'min-w-0 p-4 sm:p-5')}>
      <dt className="truncate text-xs text-gray-500 sm:text-sm">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-bold tracking-tight text-gray-900 tabular-nums sm:text-2xl">{value}</span>
        {hint && <span className="hidden truncate text-xs text-gray-500 sm:inline">{hint}</span>}
      </dd>
    </div>
  );
}

export default function History() {
  useDocumentTitle('Match history');
  const { matches, jobs, loading, error, reload } = useHistory();

  const best = matches.reduce<MatchResponse | null>((b, m) => (!b || m.composite_score > b.composite_score ? m : b), null);
  const average = matches.length ? matches.reduce((sum, m) => sum + m.composite_score, 0) / matches.length : 0;

  return (
    <div>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Match History</h1>
          <p className="mt-1.5 text-sm text-gray-500 sm:text-base">Your past resume-to-JD comparisons</p>
        </div>
        <Link to="/dashboard" className={buttonClasses('primary', 'md', 'self-start sm:self-auto')}>
          New analysis
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </header>

      {loading ? (
        <>
          <span role="status" className="sr-only">
            Loading history
          </span>
          <ul className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <HistoryCardSkeleton key={i} />
            ))}
          </ul>
        </>
      ) : error ? (
        <div className={cardClasses}>
          <EmptyState
            icon={<AlertIcon className="h-6 w-6" />}
            title="Couldn't load your history"
            description={error}
            action={{ label: 'Try again', onClick: reload }}
          />
        </div>
      ) : matches.length === 0 ? (
        <div className={cardClasses}>
          <EmptyState
            icon={<ClockIcon className="h-6 w-6" />}
            title="No matches yet"
            description="No matches yet. Upload a resume and job description to get started."
            action={{ label: 'Run your first match', to: '/dashboard' }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          <dl className="grid grid-cols-3 gap-3 sm:gap-4">
            <Stat label="Analyses" value={String(matches.length)} />
            <Stat label="Avg. score" value={average.toFixed(1)} />
            <Stat
              label="Best match"
              value={best ? best.composite_score.toFixed(1) : '—'}
              hint={(best && jobs[best.jd_id]?.parsed_json?.title) || undefined}
            />
          </dl>
          <ul className="space-y-3">
            {matches.map((match) => (
              <HistoryCard key={match.id} match={match} job={jobs[match.jd_id]} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
