import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none ' +
  'transition-all duration-150 ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50 ' +
  'motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/25',
  secondary: 'bg-white text-gray-900 ring-1 ring-inset ring-gray-300 shadow-sm hover:bg-gray-50 hover:ring-gray-400',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  link: 'text-blue-600 hover:bg-blue-50 hover:text-blue-700',
  /** For dark backgrounds. */
  inverse: 'bg-white text-gray-900 shadow-sm hover:bg-gray-100 hover:shadow-md',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/**
 * Shared button styling. A class helper (rather than a polymorphic <Button>)
 * lets the same look apply to <button>, <Link> and <a> with full native typing.
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
): string {
  return cn(base, variants[variant], sizes[size], extra);
}

export const inputClasses =
  'block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm ' +
  'placeholder:text-gray-400 transition-colors ' +
  'focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/15 ' +
  'aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/15';

export const cardClasses = 'rounded-xl border border-gray-200 bg-white shadow-sm';
