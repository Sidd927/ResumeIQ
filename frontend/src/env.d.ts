/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. "https://api.resumeiq.app". Unset in dev → relative URLs via the Vite proxy. */
  readonly VITE_API_URL?: string;
  /** "true" → use in-browser mock data (no backend needed). */
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
