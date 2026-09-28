/**
 * Phase 1 mock API.
 *
 * Function names, arguments and return types mirror the real endpoints in
 * CLAUDE.md, so Phase 3 only swaps each body for an `apiClient` call —
 * no component or page needs to change.
 *
 * Matches and job descriptions created during a session are persisted to
 * localStorage so history survives reloads and logout/login.
 */
import {
  mockJobDescription,
  mockJobDescriptions,
  mockMatchHistory,
  mockMatchResult,
  mockResume,
} from '../mocks/data';
import type {
  JobDescriptionCreate,
  JobDescriptionResponse,
  MatchRequest,
  MatchResponse,
  ResumeResponse,
} from '../types';

const LATENCY_MS = {
  upload: 1500,
  job: 300,
  match: 1700,
  read: 350,
} as const;

const STORAGE_KEYS = {
  matches: 'resumeiq_mock_matches',
  jobs: 'resumeiq_mock_jobs',
} as const;

export const ACCEPTED_RESUME_EXTENSIONS = ['.pdf', '.docx'] as const;
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

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

/** Client-side validation shared by the upload UI. Returns an error message or null. */
export function validateResumeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_RESUME_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `"${file.name}" isn't supported. Upload a PDF or DOCX file.`;
  }
  if (file.size > MAX_RESUME_BYTES) {
    return 'That file is larger than 5 MB. Try exporting a smaller PDF.';
  }
  return null;
}

/** POST /api/resumes */
export async function uploadResume(file: File): Promise<ResumeResponse> {
  const error = validateResumeFile(file);
  if (error) throw new Error(error);
  await delay(LATENCY_MS.upload);
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

/** Lookup used to show job titles and classify missing skills. */
export async function getJobDescriptions(ids: number[]): Promise<Record<number, JobDescriptionResponse>> {
  const wanted = new Set(ids);
  return Object.fromEntries(allJobs().filter((j) => wanted.has(j.id)).map((j) => [j.id, j]));
}

/** Resume lookup for match detail views. */
export async function getResume(id: number): Promise<ResumeResponse | null> {
  return id === mockResume.id ? mockResume : null;
}
