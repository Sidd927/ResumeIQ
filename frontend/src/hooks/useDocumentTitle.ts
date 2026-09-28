import { useEffect } from 'react';

const APP_NAME = 'ResumeIQ';

/** Sets a per-page <title> so tabs and screen readers announce SPA navigation. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : `${APP_NAME} — Know your match score before you apply`;
  }, [title]);
}
