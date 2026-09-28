import type { ReactNode } from 'react';

import { InfoIcon } from '../ui/icons';
import Logo from './Logo';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/** Centered card on a light-gray canvas, shared by Login and Register. */
export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gray-50 px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-200/50 via-violet-200/40 to-sky-200/40 blur-3xl"
      />
      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <main className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </main>
        <p className="mt-6 text-center text-sm text-gray-600">{footer}</p>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <InfoIcon className="h-3.5 w-3.5" />
          Demo mode — any email and password will work.
        </p>
      </div>
    </div>
  );
}
