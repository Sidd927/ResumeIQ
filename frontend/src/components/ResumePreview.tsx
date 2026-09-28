import { useId, useState, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { formatMonthYear } from '../lib/format';
import type { ParsedResume } from '../types';
import { cardClasses } from './ui/button';
import { ChevronDownIcon } from './ui/icons';

function AccordionSection({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-gray-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
        >
          <span className="text-sm font-medium text-gray-900">{title}</span>
          <span className="flex items-center gap-2">
            {meta && <span className="text-xs text-gray-400">{meta}</span>}
            <ChevronDownIcon
              className={cn('h-4 w-4 text-gray-400 transition-transform duration-200', open && 'rotate-180')}
            />
          </span>
        </button>
      </h3>
      <div
        id={panelId}
        aria-hidden={!open}
        className={cn('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={cn('truncate text-sm', value ? 'text-gray-900' : 'italic text-gray-400')}>{value ?? 'Not found'}</dd>
    </div>
  );
}

/** Accordion view of what the parser extracted — proves parsing worked. */
export default function ResumePreview({ resume, className }: { resume: ParsedResume; className?: string }) {
  const { contact_info: contact, work_history: work, education, skills } = resume;

  return (
    <section aria-labelledby="resume-preview-heading" className={cn(cardClasses, 'overflow-hidden', className)}>
      <div className="px-6 pb-3 pt-5">
        <h2 id="resume-preview-heading" className="text-base font-semibold text-gray-900">
          Parsed Resume
        </h2>
        <p className="mt-1 text-sm text-gray-500">What our parser extracted from your file.</p>
      </div>

      <div className="border-t border-gray-100">
        <AccordionSection title="Contact Info" defaultOpen>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" value={contact.name} />
            <Field label="Email" value={contact.email} />
            <Field label="Phone" value={contact.phone} />
            <Field label="Location" value={contact.location} />
          </dl>
        </AccordionSection>

        <AccordionSection title="Work History" meta={`${work.length} role${work.length === 1 ? '' : 's'}`}>
          <ol className="space-y-5">
            {work.map((job) => (
              <li key={`${job.company}-${job.start_date}`} className="relative border-l-2 border-gray-100 pl-4">
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute -left-[5px] top-1.5 h-2 w-2 rounded-full',
                    job.end_date === null ? 'bg-blue-600' : 'bg-gray-300',
                  )}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-semibold text-gray-900">{job.title}</p>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {formatMonthYear(job.start_date)} — {formatMonthYear(job.end_date)}
                  </p>
                </div>
                <p className="text-sm text-gray-600">{job.company}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-gray-600 marker:text-gray-300">
                  {job.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </AccordionSection>

        <AccordionSection title="Education" meta={`${education.length}`}>
          <ul className="space-y-3">
            {education.map((ed) => (
              <li key={`${ed.institution}-${ed.degree}`} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{ed.degree}</p>
                  <p className="text-sm text-gray-600">{ed.institution}</p>
                </div>
                {ed.year && <p className="text-xs text-gray-500 tabular-nums">{ed.year}</p>}
              </li>
            ))}
          </ul>
        </AccordionSection>

        <AccordionSection title="Extracted Skills" meta={`${skills.length}`}>
          <ul className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <li key={skill} className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                {skill}
              </li>
            ))}
          </ul>
        </AccordionSection>
      </div>
    </section>
  );
}
