/**
 * Mock API — in-browser demo data, no backend required.
 *
 * Enabled with VITE_USE_MOCK=true (e.g. for a demo when the backend is down).
 * Implements the same ResumeIQApi contract as api.ts, including auth: login
 * returns UNSIGNED fake JWTs, so the auth store and route guards run the
 * exact same code path as with the real backend.
 *
 * Matches and job descriptions created during a session are persisted to
 * localStorage so history survives reloads and logout/login.
 */
import { mockJobDescription, mockJobDescriptions, mockMatchHistory, mockMatchResult, mockResume } from '../mocks/data';
import { validateResumeFile } from '../lib/files';
import { makeUnsignedJwt } from '../lib/jwt';
import type {
  JobDescriptionCreate,
  JobDescriptionResponse,
  MatchRequest,
  MatchResponse,
  ResumeResponse,
  TokenResponse,
  UserResponse,
} from '../types';
import { ApiError } from './client';
import type { UploadOptions } from './types';

const LATENCY_MS = {
  auth: 500,
  upload: 1500,
  job: 300,
  match: 1700,
  read: 350,
} as const;

const STORAGE_KEYS = {
  matches: 'resumeiq_mock_matches',
  jobs: 'resumeiq_mock_jobs',
} as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStored<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeStored<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

function allMatches(): MatchResponse[] {
  return [...readStored<MatchResponse>(STORAGE_KEYS.matches), ...mockMatchHistory];
}

function allJobs(): JobDescriptionResponse[] {
  return [...readStored<JobDescriptionResponse>(STORAGE_KEYS.jobs), ...Object.values(mockJobDescriptions)];
}

function nextId(items: Array<{ id: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

const MOCK_USER_ID = 1;
const MOCK_TOKEN_LIFETIME_S = 7 * 24 * 3600;

/** POST /api/auth/login — any credentials work; returns unsigned fake tokens. */
export async function loginUser(email: string, _password: string): Promise<TokenResponse> {
  await delay(LATENCY_MS.auth);
  const exp = Math.floor(Date.now() / 1000) + MOCK_TOKEN_LIFETIME_S;
  const normalized = email.trim().toLowerCase();
  return {
    access_token: makeUnsignedJwt({ sub: String(MOCK_USER_ID), email: normalized, type: 'access', exp }),
    refresh_token: makeUnsignedJwt({ sub: String(MOCK_USER_ID), type: 'refresh', exp }),
    token_type: 'bearer',
  };
}

/** POST /api/auth/register */
export async function registerUser(email: string, _password: string): Promise<UserResponse> {
  await delay(LATENCY_MS.auth);
  return { id: MOCK_USER_ID, email: email.trim().toLowerCase(), created_at: new Date().toISOString() };
}

/** POST /api/resumes */
export async function uploadResume(file: File, options: UploadOptions = {}): Promise<ResumeResponse> {
  const error = validateResumeFile(file);
  if (error) throw new ApiError(415, error);
  // Simulated upload progress, then "parsing".
  for (const fraction of [0.35, 0.7, 1]) {
    await delay(LATENCY_MS.upload / 6);
    options.onUploadProgress?.(fraction);
  }
  await delay(LATENCY_MS.upload / 2);
  return { ...mockResume, created_at: new Date().toISOString() };
}

/** POST /api/jobs */
export async function createJobDescription(payload: JobDescriptionCreate): Promise<JobDescriptionResponse> {
  await delay(LATENCY_MS.job);
  const stored = readStored<JobDescriptionResponse>(STORAGE_KEYS.jobs);
  const job: JobDescriptionResponse = {
    id: nextId(allJobs()),
    user_id: 1,
    raw_text: payload.raw_text,
    parsed_json: mockJobDescription,
    created_at: new Date().toISOString(),
  };
  writeStored(STORAGE_KEYS.jobs, [job, ...stored]);
  return job;
}

/** POST /api/match */
export async function runMatch(request: MatchRequest): Promise<MatchResponse> {
  await delay(LATENCY_MS.match);
  const stored = readStored<MatchResponse>(STORAGE_KEYS.matches);
  const match: MatchResponse = {
    ...mockMatchResult,
    id: nextId(allMatches()),
    resume_id: request.resume_id,
    jd_id: request.job_id,
    created_at: new Date().toISOString(),
  };
  writeStored(STORAGE_KEYS.matches, [match, ...stored]);
  return match;
}

/** GET /api/match/{id} — resolves null where the real API would 404. */
export async function getMatch(id: number): Promise<MatchResponse | null> {
  await delay(LATENCY_MS.read);
  return allMatches().find((m) => m.id === id) ?? null;
}

/** GET /api/match/history — most recent first. */
export async function getMatchHistory(): Promise<MatchResponse[]> {
  await delay(LATENCY_MS.read);
  return allMatches().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** GET /api/jobs/{id} for each id — used for job titles and required/preferred splits. */
export async function getJobDescriptions(ids: number[]): Promise<Record<number, JobDescriptionResponse>> {
  const wanted = new Set(ids);
  return Object.fromEntries(
    allJobs()
      .filter((j) => wanted.has(j.id))
      .map((j) => [j.id, j]),
  );
}

/** GET /api/resumes/{id} */
export async function getResume(id: number): Promise<ResumeResponse | null> {
  return id === mockResume.id ? mockResume : null;
}
