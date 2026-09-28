import { cn } from '../lib/cn';
import { inputClasses } from './ui/button';

export const MIN_JD_LENGTH = 100;

interface JDInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Optional one-click demo text. */
  sampleText?: string;
}

/** Job description textarea with live character count and a 100-char minimum. */
export default function JDInput({ value, onChange, sampleText }: JDInputProps) {
  const length = value.trim().length;
  const remaining = MIN_JD_LENGTH - length;
  const ready = remaining <= 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor="jd-input" className="text-sm font-medium text-gray-900">
          Job description
        </label>
        <div className="flex items-center gap-1">
          {sampleText && value !== sampleText && (
            <button
              type="button"
              onClick={() => onChange(sampleText)}
              className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Use sample
            </button>
          )}
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <textarea
          id="jd-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste the job description here..."
          rows={10}
          aria-describedby="jd-helper"
          className={cn(inputClasses, 'resize-y pb-8 leading-6')}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute bottom-2.5 right-3 rounded bg-white/90 px-1 text-xs tabular-nums',
            ready ? 'text-gray-400' : 'text-gray-500',
          )}
        >
          {value.length.toLocaleString()} chars
        </span>
      </div>

      <p id="jd-helper" aria-live="polite" className={cn('mt-2 text-xs', ready ? 'text-green-700' : 'text-gray-500')}>
        {ready
          ? '✓ Looks good — enough detail to analyze.'
          : length === 0
            ? `Paste at least ${MIN_JD_LENGTH} characters so we can extract requirements.`
            : `Add ${remaining} more character${remaining === 1 ? '' : 's'} to enable matching.`}
      </p>
    </div>
  );
}
