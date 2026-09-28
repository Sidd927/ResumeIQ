import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { createJobDescription, runMatch } from '../api';
import JDInput, { MIN_JD_LENGTH } from '../components/JDInput';
import JobPreview from '../components/JobPreview';
import MissingSkills from '../components/MissingSkills';
import ResumePreview from '../components/ResumePreview';
import ResumeUpload from '../components/ResumeUpload';
import ScoreBreakdown from '../components/ScoreBreakdown';
import { buttonClasses, cardClasses } from '../components/ui/button';
import EmptyState from '../components/ui/EmptyState';
import { ArrowRightIcon, ChartIcon, CheckIcon } from '../components/ui/icons';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useToast } from '../hooks/useToast';
import { cn } from '../lib/cn';
import { scrollToElement } from '../lib/scroll';
import { mockJobDescriptionRawText } from '../mocks/data';
import type { JobDescriptionResponse, MatchResponse, ResumeResponse } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type Phase = 'idle' | 'analyzing' | 'done';

interface Result {
  match: MatchResponse;
  job: JobDescriptionResponse;
  resume: ResumeResponse;
}

const ANALYSIS_STEPS = [
  'Parsing the job description',
  'Analyzing skill match',
  'Computing semantic similarity',
  'Weighing title & recency',
  'Generating results',
] as const;
const STEP_INTERVAL_MS = 1100;
/** After this long, explain that the first run loads the language model. */
const SLOW_HINT_AFTER_MS = 7000;

/**
 * Staged progress shown while the scoring engine runs. The stages are timed,
 * not reported by the server — their job is to show that work is happening
 * (the first match on a cold server loads the embedding model: 5–30 s).
 */
function AnalysisProgress() {
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, ANALYSIS_STEPS.length - 1)), STEP_INTERVAL_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_HINT_AFTER_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(slowTimer);
    };
  }, []);

  return (
    <div className={cn(cardClasses, 'flex flex-col items-center px-6 py-14 text-center')} aria-live="polite">
      <LoadingSpinner size="lg" label={null} className="text-blue-600" />
      <p className="mt-6 text-base font-semibold text-gray-900">Analyzing your resume...</p>
      <div className="mt-4 h-1 w-full max-w-sm overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-blue-600" />
      </div>
      <ol className="mt-6 w-full max-w-sm space-y-3 text-left">
        {ANALYSIS_STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300',
                  done ? 'bg-green-600 text-white' : active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-300',
                )}
              >
                {done ? <CheckIcon className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span
                className={cn(
                  'transition-colors',
                  done ? 'text-gray-500' : active ? 'font-medium text-gray-900' : 'text-gray-400',
                )}
              >
                {label}
                {active && '…'}
              </span>
            </li>
          );
        })}
      </ol>
      {slow && (
        <p className="mt-6 max-w-sm animate-fade-in-up text-xs leading-5 text-gray-500">
          Still working — the first analysis loads the language model on the server, which can take up to 30 seconds.
          Later analyses are much faster.
        </p>
      )}
    </div>
  );
}

function StepHeading({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
          done ? 'bg-green-600 text-white' : 'bg-blue-50 text-blue-600',
        )}
      >
        {done ? <CheckIcon className="h-3.5 w-3.5" /> : n}
        <span className="sr-only">{done ? ' (complete)' : ''}</span>
      </span>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
    </div>
  );
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const toast = useToast();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [resume, setResume] = useState<ResumeResponse | null>(null);
  const [jdText, setJdText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<Result | null>(null);

  const jdReady = jdText.trim().length >= MIN_JD_LENGTH;
  const canAnalyze = resume !== null && jdReady && phase !== 'analyzing';

  const missingHint =
    !resume && !jdReady
      ? 'Upload a resume and add a job description to continue.'
      : !resume
        ? 'Upload your resume to continue.'
        : !jdReady
          ? `Add a job description (${MIN_JD_LENGTH}+ characters) to continue.`
          : null;

  const handleAnalyze = async () => {
    if (!resume || !jdReady) return;
    setPhase('analyzing');
    setResult(null);

    // On small screens the results render below the inputs — bring them into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => scrollToElement(resultsRef.current));
    }

    try {
      const job = await createJobDescription({ raw_text: jdText.trim() });
      const match = await runMatch({ resume_id: resume.id, job_id: job.id });
      setResult({ match, job, resume });
      setPhase('done');
      toast.success(`Match analysis complete — Score: ${match.composite_score.toFixed(1)}/100`);
    } catch (err) {
      setPhase('idle');
      toast.error(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    }
  };

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">New analysis</h1>
        <p className="mt-1.5 text-sm text-gray-500 sm:text-base">
          Upload your resume and paste a job description to see how well you match.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Inputs */}
        <div className="space-y-6 lg:col-span-5">
          <section className={cn(cardClasses, 'p-5 sm:p-6')} aria-label="Step 1: Upload resume">
            <StepHeading n={1} title="Upload your resume" done={resume !== null} />
            <ResumeUpload onChange={setResume} />
          </section>

          <section className={cn(cardClasses, 'p-5 sm:p-6')} aria-label="Step 2: Job description">
            <StepHeading n={2} title="Add the job description" done={jdReady} />
            <JDInput value={jdText} onChange={setJdText} sampleText={mockJobDescriptionRawText} />
          </section>

          <div>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              aria-describedby={missingHint ? 'analyze-hint' : undefined}
              className={buttonClasses('primary', 'lg', 'w-full')}
            >
              {phase === 'analyzing' ? (
                <>
                  <LoadingSpinner size="sm" label={null} />
                  Analyzing…
                </>
              ) : (
                <>
                  {result ? 'Re-run Analysis' : 'Analyze Match'}
                  <ArrowRightIcon className="h-4 w-4" />
                </>
              )}
            </button>
            {missingHint && (
              <p id="analyze-hint" className="mt-2 text-center text-xs text-gray-500">
                {missingHint}
              </p>
            )}
          </div>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="lg:col-span-7">
          {phase === 'analyzing' && <AnalysisProgress />}

          {phase === 'idle' && !result && (
            <div
              className={cn(
                cardClasses,
                'flex min-h-[420px] items-center justify-center border-dashed bg-white/60 shadow-none',
              )}
            >
              <EmptyState
                icon={<ChartIcon className="h-6 w-6" />}
                title="Your results will appear here"
                description="Once you've added a resume and job description, run the analysis to get your match score, a 4-signal breakdown and your skills gap."
              />
            </div>
          )}

          {phase === 'done' && result && (
            <div className="animate-fade-in-up space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Results for</p>
                  <p className="truncate text-base font-semibold text-gray-900">
                    {result.job.parsed_json?.title ?? 'Job description'}
                  </p>
                </div>
                <Link to={`/match/${result.match.id}`} className={buttonClasses('link', 'sm')}>
                  Open full report
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
              <ScoreBreakdown match={result.match} />
              <MissingSkills missingSkills={result.match.missing_skills} jobDescription={result.job.parsed_json} />
              {result.job.parsed_json && (
                <JobPreview job={result.job.parsed_json} missingSkills={result.match.missing_skills} />
              )}
              {result.resume.parsed_json && <ResumePreview resume={result.resume.parsed_json} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
