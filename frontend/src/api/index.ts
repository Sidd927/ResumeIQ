/**
 * API barrel — the ONLY module components import from.
 *
 *   npm run dev                       → real FastAPI backend (via the Vite proxy)
 *   VITE_USE_MOCK=true npm run dev    → in-browser mock data, no backend needed
 *
 * ES modules can't `export *` conditionally, so we pick an implementation
 * object and re-export its members. Typing both as ResumeIQApi guarantees the
 * mock and real layers expose identical signatures.
 */
import * as realApi from './api';
import * as mockApi from './mockApi';
import type { ResumeIQApi } from './types';

export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK === 'true';

const real: ResumeIQApi = realApi;
const mock: ResumeIQApi = mockApi;
const impl: ResumeIQApi = USE_MOCK ? mock : real;

export const {
  loginUser,
  registerUser,
  uploadResume,
  getResume,
  createJobDescription,
  getJobDescriptions,
  runMatch,
  getMatch,
  getMatchHistory,
} = impl;

export { ApiError, NETWORK_ERROR_MESSAGE, SESSION_EXPIRED_MESSAGE } from './client';
export type { ResumeIQApi, UploadOptions } from './types';
export { validateResumeFile } from '../lib/files';
