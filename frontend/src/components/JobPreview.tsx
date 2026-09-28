import { useId, useState } from 'react';

import { cn } from '../lib/cn';
import type { ParsedJobDescription } from '../types';
import { cardClasses } from './ui/button';
import { CheckIcon, ChevronDownIcon, XIcon } from './ui/icons';

interface JobPreviewProps {
  job: ParsedJobDescription;
  /** Used to mark each extracted skill as covered or missing. */
  missingSkills: string[];
  className?: string;
}

function SkillList({ label, skills, missing }: { label: string; skills: string[]; missing: Set<string> }) {
  if (skills.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {skills.map((skill) => {
          const isMissing = missing.has(skill.toLowerCase());
          return (
            <li
              key={skill}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                isMissing ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700',
              )}
            >
              {isMissing ? <XIcon className="h-3 w-3" /> : <CheckIcon className="h-3 w-3" />}
              <span className="sr-only">{isMissing ? 'Missing: ' : 'On your resume: '}</span>
              {skill}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What the parser extracted from the job description: title, level, skills, requirement lines. */
export default function JobPreview({ job, missingSkills, className }: JobPreviewProps) {
  const [showRequirements, setShowRequirements] = useState(false);
  const panelId = useId();
  const missing = new Set(missingSkills.map((s) => s.toLowerCase()));
  const nothingFound = !job.required_skills.length && !job.preferred_skills.length;

  return (
    <section aria-labelledby="job-preview-heading" className={cn(cardClasses, 'p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="job-preview-heading" className="text-base font-semibold text-gray-900">
            Parsed Job Description
          </h2>
          <p className="mt-1 truncate text-sm text-gray-500">{job.title ?? 'Title not found'}</p>
        </div>
        {job.experience_level && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {job.experience_level}
          </span>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {nothingFound ? (
          <p className="text-sm text-gray-500">
            No recognisable skills were found in this posting — try pasting the full description including its
            requirements section.
          </p>
        ) : (
          <>
            <SkillList label="Required skills" skills={job.required_skills} missing={missing} />
            <SkillList label="Preferred skills" skills={job.preferred_skills} missing={missing} />
          </>
        )}
      </div>

      {job.requirements.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => setShowRequirements((v) => !v)}
            aria-expanded={showRequirements}
            aria-controls={panelId}
            className="flex w-full items-center justify-between rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {job.requirements.length} requirement{job.requirements.length === 1 ? '' : 's'} compared semantically
            <ChevronDownIcon className={cn('h-4 w-4 text-gray-400 transition-transform', showRequirements && 'rotate-180')} />
          </button>
          {showRequirements && (
            <ul id={panelId} className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-gray-600 marker:text-gray-300">
              {job.requirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
