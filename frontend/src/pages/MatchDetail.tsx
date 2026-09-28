import { Link, useParams } from 'react-router-dom';

import JobPreview from '../components/JobPreview';
import MissingSkills from '../components/MissingSkills';
import ResumePreview from '../components/ResumePreview';
import ScoreBreakdown from '../components/ScoreBreakdown';
import { cardClasses } from '../components/ui/button';
import EmptyState from '../components/ui/EmptyState';
import { AlertIcon, ArrowLeftIcon, SearchIcon } from '../components/ui/icons';
import { MatchReportSkeleton } from '../components/ui/Skeleton';
import { useMatch } from '../hooks/useMatch';
import { formatDate, formatTime } from '../lib/format';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** Full report for one past match: score breakdown, skills gap, parsed resume. */
export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { report, loading, notFound, error } = useMatch(Number(id));
  useDocumentTitle(report?.job?.parsed_json?.title ?? (notFound ? 'Match not found' : 'Match report'));

  const backLink = (
    <Link
      to="/history"
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      Back to history
    </Link>
  );

  if (loading) {
    return (
      <>
        <span role="status" className="sr-only">
          Loading match report
        </span>
        <MatchReportSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <div>
        {backLink}
        <div className={`${cardClasses} mt-6`}>
          <EmptyState
            icon={<AlertIcon className="h-6 w-6" />}
            title="Couldn't load this match"
            description={error}
            action={{ label: 'Try again', onClick: () => window.location.reload() }}
          />
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div>
        {backLink}
        <div className={`${cardClasses} mt-6`}>
          <EmptyState
            icon={<SearchIcon className="h-6 w-6" />}
            title="Match not found"
            description={`We couldn't find a match with ID "${id}". It may have been removed.`}
            action={{ label: 'Go to history', to: '/history' }}
          />
        </div>
      </div>
    );
  }

  const { match, job, resume } = report;

  return (
    <div className="animate-fade-in-up">
      {backLink}
      <header className="mb-8 mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Match report #{match.id}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {job?.parsed_json?.title ?? `Job description #${match.jd_id}`}
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Analyzed on{' '}
          <time dateTime={match.created_at}>
            {formatDate(match.created_at)} at {formatTime(match.created_at)}
          </time>
          {job?.parsed_json?.experience_level && <> · {job.parsed_json.experience_level} experience</>}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <ScoreBreakdown match={match} />
        </div>
        <div className="space-y-6 lg:col-span-5">
          <MissingSkills missingSkills={match.missing_skills} jobDescription={job?.parsed_json ?? null} />
          {job?.parsed_json && <JobPreview job={job.parsed_json} missingSkills={match.missing_skills} />}
          {resume?.parsed_json && <ResumePreview resume={resume.parsed_json} />}
        </div>
      </div>
    </div>
  );
}
