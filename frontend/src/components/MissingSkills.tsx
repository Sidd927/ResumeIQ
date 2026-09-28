import { cn } from '../lib/cn';
import type { ParsedJobDescription } from '../types';
import { cardClasses } from './ui/button';
import { AlertIcon, CheckCircleIcon } from './ui/icons';

interface MissingSkillsProps {
  missingSkills: string[];
  /** Parsed JD, used to split gaps into required vs preferred. */
  jobDescription: ParsedJobDescription | null;
  className?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

function SkillChip({ skill, tone }: { skill: string; tone: 'required' | 'preferred' }) {
  return (
    <li
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium ring-1 ring-inset',
        tone === 'required' ? 'bg-red-50 text-red-700 ring-red-600/15' : 'bg-amber-50 text-amber-800 ring-amber-600/20',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-1.5 w-1.5 rounded-full', tone === 'required' ? 'bg-red-500' : 'bg-amber-500')}
      />
      {skill}
    </li>
  );
}

function SkillGroup({
  title,
  hint,
  skills,
  tone,
}: {
  title: string;
  hint: string;
  skills: string[];
  tone: 'required' | 'preferred';
}) {
  if (skills.length === 0) return null;
  return (
    <div>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">{hint}</span>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label={title}>
        {skills.map((skill) => (
          <SkillChip key={skill} skill={skill} tone={tone} />
        ))}
      </ul>
    </div>
  );
}

/** Skills Gap Analysis: missing JD skills grouped by required vs preferred. */
export default function MissingSkills({ missingSkills, jobDescription, className }: MissingSkillsProps) {
  const required = new Set((jobDescription?.required_skills ?? []).map(norm));
  const preferred = new Set((jobDescription?.preferred_skills ?? []).map(norm));

  // Anything not explicitly "preferred" is treated as required — the conservative reading.
  const missingPreferred = missingSkills.filter((s) => preferred.has(norm(s)) && !required.has(norm(s)));
  const missingRequired = missingSkills.filter((s) => !missingPreferred.includes(s));

  const reqTotal = jobDescription?.required_skills.length ?? 0;
  const prefTotal = jobDescription?.preferred_skills.length ?? 0;
  const reqHave = reqTotal - missingSkills.filter((s) => required.has(norm(s))).length;
  const prefHave = prefTotal - missingPreferred.length;

  return (
    <section aria-labelledby="skills-gap-heading" className={cn(cardClasses, 'p-6', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="skills-gap-heading" className="text-base font-semibold text-gray-900">
          Skills Gap Analysis
        </h2>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
            missingSkills.length
              ? 'bg-red-50 text-red-700 ring-red-600/15'
              : 'bg-green-50 text-green-700 ring-green-600/20',
          )}
        >
          {missingSkills.length} missing
        </span>
      </div>

      {jobDescription && (
        <p className="mt-1 text-sm text-gray-500">
          You cover{' '}
          <span className="font-medium text-gray-900">
            {reqHave} of {reqTotal}
          </span>{' '}
          required and{' '}
          <span className="font-medium text-gray-900">
            {prefHave} of {prefTotal}
          </span>{' '}
          preferred skills.
        </p>
      )}

      {missingSkills.length === 0 ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          No gaps — you list every skill this posting asks for.
        </div>
      ) : (
        <>
          <div className="mt-5 space-y-5">
            <SkillGroup title="Required" hint="missing — highest impact" skills={missingRequired} tone="required" />
            <SkillGroup title="Preferred" hint="missing — nice to have" skills={missingPreferred} tone="preferred" />
          </div>
          <p className="mt-6 flex items-start gap-2 border-t border-gray-100 pt-4 text-sm leading-6 text-gray-600">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            Consider adding experience with these skills to improve your match score — required skills carry the most
            weight.
          </p>
        </>
      )}
    </section>
  );
}
