import type {
  JobDescriptionCreate,
  JobDescriptionResponse,
  MatchRequest,
  MatchResponse,
  ResumeResponse,
  TokenResponse,
  UserResponse,
} from '../types';

export interface UploadOptions {
  /** Upload progress as a 0–1 fraction (not called by every implementation). */
  onUploadProgress?: (fraction: number) => void;
}

/**
 * The contract both implementations satisfy — `api.ts` (real FastAPI) and
 * `mockApi.ts` (in-browser demo data). The barrel (`index.ts`) picks one, and
 * TypeScript enforces that the two never drift apart.
 *
 * Lookups resolve `null` where the backend answers 404.
 */
export interface ResumeIQApi {
  // Auth
  loginUser(email: string, password: string): Promise<TokenResponse>;
  registerUser(email: string, password: string): Promise<UserResponse>;

  // Resumes
  uploadResume(file: File, options?: UploadOptions): Promise<ResumeResponse>;
  getResume(id: number): Promise<ResumeResponse | null>;

  // Job descriptions
  createJobDescription(payload: JobDescriptionCreate): Promise<JobDescriptionResponse>;
  getJobDescriptions(ids: number[]): Promise<Record<number, JobDescriptionResponse>>;

  // Matching
  runMatch(request: MatchRequest): Promise<MatchResponse>;
  getMatch(id: number): Promise<MatchResponse | null>;
  getMatchHistory(): Promise<MatchResponse[]>;
}
