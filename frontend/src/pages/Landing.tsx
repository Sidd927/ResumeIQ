import { Link } from 'react-router-dom';

import { buttonClasses } from '../components/ui/button';
import { ArrowRightIcon, ChartIcon, ClipboardIcon, UploadIcon } from '../components/ui/icons';
import { cn } from '../lib/cn';
import { scrollToElement } from '../lib/scroll';
import { SIGNALS } from '../lib/signals';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const STEPS = [
  {
    icon: UploadIcon,
    title: 'Upload Resume',
    description: 'Drop in a PDF or DOCX — we extract your roles, skills and education.',
  },
  {
    icon: ClipboardIcon,
    title: 'Paste Job Description',
    description: 'Paste any posting. We pull out required and preferred skills automatically.',
  },
  {
    icon: ChartIcon,
    title: 'Get Your Score',
    description: 'See a 0–100 match score, four explainable signals, and exactly what to fix.',
  },
] as const;

function scrollToHowItWorks() {
  scrollToElement(document.getElementById('how-it-works'));
}

export default function Landing() {
  useDocumentTitle(null);
  return (
    <div className="space-y-24 pb-8 sm:space-y-32">
      {/* Hero */}
      <section className="relative pt-8 text-center sm:pt-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-10 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-gradient-to-r from-blue-200/50 via-violet-200/40 to-sky-200/50 blur-3xl"
        />
        <p className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
          <span className="flex h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden="true" />
          Explainable scoring · no black-box AI numbers
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl sm:leading-[1.05]">
          Know Your <span className="whitespace-nowrap text-blue-600">ATS Score</span> Before You Apply
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600">
          Upload your resume, paste a job description, and get an instant breakdown of how well you match — powered by
          the same 4 signals real ATS systems use.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/register" className={buttonClasses('primary', 'lg', 'w-full sm:w-auto')}>
            Try It Now
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <button type="button" onClick={scrollToHowItWorks} className={buttonClasses('secondary', 'lg', 'w-full sm:w-auto')}>
            See How It Works
          </button>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-heading">
        <div className="text-center">
          <p className="text-sm font-semibold text-blue-600">How it works</p>
          <h2 id="how-heading" className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Three steps, under a minute
          </h2>
        </div>
        <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, description }, i) => (
            <li
              key={title}
              className="relative rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-gray-300 tabular-nums">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-gray-900">
                <span className="sr-only">Step {i + 1}: </span>
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-gray-600">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* The 4 signals */}
      <section aria-labelledby="signals-heading">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-blue-600">The scoring engine</p>
          <h2 id="signals-heading" className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Not Just One Score — Four Explainable Signals
          </h2>
          <p className="mt-4 text-base leading-7 text-gray-600">
            Every point in your score traces back to a concrete signal. Same resume, same job, same score — every time.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {SIGNALS.map((signal) => (
            <article
              key={signal.key}
              className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 pl-7 shadow-sm transition-shadow duration-200 hover:shadow-md"
            >
              <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', signal.barClass)} />
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-gray-900">{signal.name}</h3>
                <span className={cn('rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums', signal.softBgClass, signal.textClass)}>
                  {Math.round(signal.weight * 100)}%
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-600">{signal.pitch}</p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-8 w-fit max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-white px-4 py-2.5 font-mono text-xs text-gray-600 shadow-sm sm:text-sm">
          score = 0.4·skill + 0.3·semantic + 0.2·recency + 0.1·completeness
        </p>
      </section>

      {/* Bottom CTA */}
      <section className="relative overflow-hidden rounded-2xl bg-gray-900 px-6 py-14 text-center sm:px-12 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-600/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-violet-600/30 blur-3xl"
        />
        <h2 className="relative text-3xl font-bold tracking-tight text-white">Ready to check your match?</h2>
        <p className="relative mx-auto mt-3 max-w-md text-base text-gray-300">
          It's free, takes under a minute, and tells you exactly which skills to add.
        </p>
        <Link
          to="/register"
          className={buttonClasses('inverse', 'lg', 'relative mt-8 focus-visible:ring-offset-gray-900')}
        >
          Analyze My Resume
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
