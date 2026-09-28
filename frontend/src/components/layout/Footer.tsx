import { USE_MOCK } from '../../api';
import { ExternalLinkIcon } from '../ui/icons';

// TODO: point at the real repository once it is public.
const GITHUB_URL = 'https://github.com/';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-gray-500 sm:flex-row sm:px-6 lg:px-8">
        <p className="flex items-center gap-2">
          Built with React, FastAPI, and sentence-transformers
          {USE_MOCK && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              Mock data mode
            </span>
          )}
        </p>
        <div className="flex items-center gap-5">
          <span className="text-gray-400">© {new Date().getFullYear()} ResumeIQ</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            GitHub
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
