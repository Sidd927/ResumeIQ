/**
 * TypeScript contracts mirroring the backend Pydantic schemas
 * (backend/app/schemas/*). Keep these in sync with the backend exactly.
 */

// === Auth ===
export interface UserCreate {
  email: string;
  password: string;
}

export interface UserResponse {
  id: number;
  email: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// === Resume ===
export interface ResumeResponse {
  id: number;
  user_id: number;
  raw_text: string;
  parsed_json: ParsedResume | null;
  file_url: string | null;
  created_at: string;
}

export interface ParsedResume {
  contact_info: {
    name: string;
    email: string;
    phone: string | null;
    location: string | null;
  };
  work_history: WorkEntry[];
  education: EducationEntry[];
  skills: string[];
}

export interface WorkEntry {
  title: string;
  company: string;
  start_date: string;
  end_date: string | null;
  bullets: string[];
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year: number | null;
}

// === Job Description ===
export interface JobDescriptionCreate {
  raw_text: string;
}

export interface JobDescriptionResponse {
  id: number;
  user_id: number;
  raw_text: string;
  parsed_json: ParsedJobDescription | null;
  created_at: string;
}

export interface ParsedJobDescription {
  title: string;
  required_skills: string[];
  preferred_skills: string[];
  experience_level: string | null;
  requirements: string[];
}

// === Match ===
export interface MatchRequest {
  resume_id: number;
  job_id: number;
}

export interface MatchResponse {
  id: number;
  resume_id: number;
  jd_id: number;
  skill_score: number;
  semantic_score: number;
  recency_score: number;
  completeness_score: number;
  composite_score: number;
  missing_skills: string[];
  feedback_text: string | null;
  created_at: string;
}
