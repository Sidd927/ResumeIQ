import { useId, useState } from 'react';

import { useCountUp, useMounted } from '../hooks/useCountUp';
import { cn } from '../lib/cn';
import { getScoreBand } from '../lib/score';
import { SIGNALS, contribution, toPercent, type Signal } from '../lib/signals';
import type { MatchResponse } from '../types';
import { cardClasses } from './ui/button';
import { ChevronDownIcon } from './ui/icons';

const GAUGE_SIZE = 168;
const GAUGE_STROKE = 12;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

/** Circular composite-score gauge; ring fills and number counts up on mount. */
function CompositeGauge({ score }: { score: number }) {
  const mounted = useMounted();
  const display = useCountUp(score, 1100);
  const band = getScoreBand(score);
  const offset = mounted ? GAUGE_CIRCUMFERENCE * (1 - score / 100) : GAUGE_CIRCUMFERENCE;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}>
        <svg
          width={GAUGE_SIZE}
          height={GAUGE_SIZE}
          viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
          className="-rotate-90"
          role="img"
          aria-label={`Match score ${score.toFixed(1)} out of 100 — ${band.label}`}
        >
          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={GAUGE_RADIUS}
            fill="none"
            strokeWidth={GAUGE_STROKE}
            className="stroke-gray-100"
          />
          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={GAUGE_RADIUS}
            fill="none"
            stroke={band.color}
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1100ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          />
        </svg>
        <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tracking-tight text-gray-900 tabular-nums">{display.toFixed(1)}</span>
          <span className="text-xs font-medium text-gray-400">/ 100</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-500">Match Score</p>
    </div>
  );
}

/** One sub-score: label row + animated bar + expandable explanation. */
function SubScoreRow({ signal, match, index }: { signal: Signal; match: MatchResponse; index: number }) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const percent = toPercent(match[signal.key]);
  const points = contribution(signal, match);

  return (
    <li className="rounded-lg transition-colors hover:bg-gray-50/80">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full rounded-lg px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', signal.barClass)} aria-hidden="true" />
            <span className="truncate text-sm font-medium text-gray-900">{signal.name}</span>
            <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', signal.softBgClass, signal.textClass)}>
              {Math.round(signal.weight * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {percent}
              <span className="font-normal text-gray-400">/100</span>
            </span>
            <ChevronDownIcon
              className={cn('h-4 w-4 text-gray-400 transition-transform duration-200', open && 'rotate-180')}
            />
          </div>
        </div>
        <div
          className="mt-2.5 h-2 overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-label={`${signal.name} score`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-[800ms] ease-out', signal.barClass)}
            style={{ width: mounted ? `${percent}%` : '0%', transitionDelay: `${index * 90}ms` }}
          />
        </div>
      </button>

      <div
        id={panelId}
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 text-sm leading-6 text-gray-600">
            <p>{signal.explanation}</p>
            <p className="mt-2 text-xs text-gray-500">
              Contributes{' '}
              <span className="font-semibold text-gray-900 tabular-nums">{points.toFixed(1)}</span> points (
              {signal.weight} × {percent}) to your composite score.
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

/** Stacked bar showing how each weighted signal adds up to the composite. */
function ContributionBar({ match }: { match: MatchResponse }) {
  const mounted = useMounted();
  const parts = SIGNALS.map((s) => ({ signal: s, points: contribution(s, match) }));

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        {parts.map(({ signal, points }) => (
          <div
            key={signal.key}
            className={cn('h-full border-r-2 border-white transition-[width] duration-1000 ease-out last:border-r-0', signal.barClass)}
            style={{ width: mounted ? `${points}%` : '0%' }}
          />
        ))}
      </div>
      <p className="mt-2.5 text-xs leading-5 text-gray-500">
        <span className="font-semibold text-gray-900 tabular-nums">{match.composite_score.toFixed(1)}</span> ={' '}
        {parts.map(({ signal, points }, i) => (
          <span key={signal.key}>
            {i > 0 && ' + '}
            <span className={cn('font-medium tabular-nums', signal.textClass)}>{points.toFixed(1)}</span>
          </span>
        ))}{' '}
        <span className="text-gray-400">(weighted skill + semantic + recency + completeness)</span>
      </p>
    </div>
  );
}

interface ScoreBreakdownProps {
  match: MatchResponse;
  className?: string;
}

/** Composite gauge, the 4 explainable sub-scores, and a one-line interpretation. */
export default function ScoreBreakdown({ match, className }: ScoreBreakdownProps) {
  const band = getScoreBand(match.composite_score);

  return (
    <section aria-labelledby="score-heading" className={cn(cardClasses, 'overflow-hidden', className)}>
      <div className="flex flex-col items-center gap-6 border-b border-gray-100 p-6 sm:flex-row sm:items-center sm:gap-8">
        <CompositeGauge score={match.composite_score} />
        <div className="text-center sm:text-left">
          <h2 id="score-heading" className="sr-only">
            Score breakdown
          </h2>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', band.badgeClass)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', band.dotClass)} aria-hidden="true" />
            {band.label}
          </span>
          <p className="mt-3 text-lg font-semibold leading-snug text-gray-900">{band.message}</p>
          <p className="mt-1.5 text-sm text-gray-500">
            Four independent signals, weighted and combined. Select any signal to see how it was scored.
          </p>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <ul className="space-y-1">
          {SIGNALS.map((signal, i) => (
            <SubScoreRow key={signal.key} signal={signal} match={match} index={i} />
          ))}
        </ul>
      </div>

      <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-4">
        <ContributionBar match={match} />
      </div>
    </section>
  );
}
