/**
 * Real API — every function is a typed call to the FastAPI backend.
 * Signatures match mockApi.ts exactly (enforced by the ResumeIQApi interface).
 */
import { validateResumeFile } from '../lib/files';
import type {
  JobDescriptionCreate,
  JobDescriptionResponse,
  MatchRequest,
  MatchResponse,
  ResumeResponse,
  TokenResponse,
  UserResponse,
} from '../types';
import { ApiError, apiClient } from './client';
import type { UploadOptions } from './types';

/** The first match loads the embedding model server-side (can take ~10–30 s on a cold server). */
const SLOW_REQUEST_TIMEOUT_MS = 120_000;
/**
 * Free hosting (Render) sleeps when idle; the first request after a nap can
 * take 30–60 s while the server boots. Auth is usually that first request.
 */
const WAKE_UP_TIMEOUT_MS = 90_000;

/** Resolve 404 → null, rethrow everything else. */
async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export function loginUser(email: string, password: string): Promise<TokenResponse> {
  return apiClient.post<TokenResponse>(
    '/api/auth/login',
    { email, password },
    { skipAuth: true, timeoutMs: WAKE_UP_TIMEOUT_MS },
  );
}

export function registerUser(email: string, password: string): Promise<UserResponse> {
  return apiClient.post<UserResponse>(
    '/api/auth/register',
    { email, password },
    { skipAuth: true, timeoutMs: WAKE_UP_TIMEOUT_MS },
  );
}

// ── Resumes ──────────────────────────────────────────────────────────────────

export async function uploadResume(file: File, options: UploadOptions = {}): Promise<ResumeResponse> {
  const invalid = validateResumeFile(file);
  if (invalid) throw new ApiError(415, invalid); // never send an obviously wrong file

  const formData = new FormData();
  formData.append('file', file);
  return apiClient.upload<ResumeResponse>('/api/resumes', formData, {
    timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
    onUploadProgress: options.onUploadProgress,
  });
}

export function getResume(id: number): Promise<ResumeResponse | null> {
  return orNull(apiClient.get<ResumeResponse>(`/api/resumes/${id}`));
}

// ── Job descriptions ─────────────────────────────────────────────────────────

export function createJobDescription(payload: JobDescriptionCreate): Promise<JobDescriptionResponse> {
  return apiClient.post<JobDescriptionResponse>('/api/jobs', payload);
}

/** Fetch several JDs by id (deduplicated, in parallel). Missing/foreign ids are skipped. */
export async function getJobDescriptions(ids: number[]): Promise<Record<number, JobDescriptionResponse>> {
  const unique = [...new Set(ids)];
  const jobs = await Promise.all(unique.map((id) => orNull(apiClient.get<JobDescriptionResponse>(`/api/jobs/${id}`))));
  return Object.fromEntries(jobs.filter((j): j is JobDescriptionResponse => j !== null).map((j) => [j.id, j]));
}

// ── Matching ─────────────────────────────────────────────────────────────────

export function runMatch(request: MatchRequest): Promise<MatchResponse> {
  return apiClient.post<MatchResponse>('/api/match', request, { timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
}

export function getMatch(id: number): Promise<MatchResponse | null> {
  if (!Number.isInteger(id) || id <= 0) return Promise.resolve(null);
  return orNull(apiClient.get<MatchResponse>(`/api/match/${id}`));
}

export async function getMatchHistory(): Promise<MatchResponse[]> {
  const matches = await apiClient.get<MatchResponse[]>('/api/match/history');
  // The API already returns newest first; sorting again is cheap insurance.
  return [...matches].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
}

/**
 * Fire-and-forget GET /health so a sleeping free-tier backend starts booting
 * while the visitor is still reading the landing page. Errors are ignored.
 */
export function wakeBackend(): void {
  apiClient.get('/health', { skipAuth: true, timeoutMs: WAKE_UP_TIMEOUT_MS }).catch(() => undefined);
}
