/**
 * ApiClient — the only place the frontend talks HTTP.
 *
 * - Base URL: VITE_API_URL, or '' (relative) so the Vite dev proxy forwards
 *   /api → FastAPI and CORS never comes into play locally.
 * - Auth: attaches `Authorization: Bearer <access>`; if the access token is
 *   (about to be) expired it refreshes FIRST, and on a 401 it refreshes and
 *   retries the request exactly ONCE. Concurrent 401s share one refresh call.
 * - Session end: if the refresh token is rejected, tokens are cleared, the
 *   auth store flips to "expired" (route guards redirect to /login) and a
 *   toast explains why. Network failures never log the user out.
 * - Errors: everything is normalised to ApiError with a user-friendly message
 *   (FastAPI's {"detail": ...} string or validation list is parsed).
 *
 * Built on axios (per CLAUDE.md) because it exposes upload progress, which
 * fetch() cannot.
 */
import axios, { type AxiosInstance, type AxiosRequestConfig, type CreateAxiosDefaults } from 'axios';

import { globalToast } from '../components/ui/toastContext';
import { isJwtExpired } from '../lib/jwt';
import { endSession, getAccessToken, getRefreshToken, hasSession, setAccessToken } from '../stores/authStore';
import type { AccessTokenResponse } from '../types';

export const NETWORK_ERROR_MESSAGE = 'Could not connect to server. Please try again.';
export const TIMEOUT_MESSAGE = 'The server took too long to respond. Please try again.';
export const SESSION_EXPIRED_MESSAGE = 'Session expired. Please log in again.';
const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again.';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Normalised error thrown by every API call. `status` 0 means no response (network/timeout). */
export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;
  /** Field-level validation messages from FastAPI 422s, keyed by field name (e.g. "password"). */
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(status: number, message: string, detail?: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON body. */
  body?: unknown;
  /** Multipart body (file uploads) — the browser sets the boundary header itself. */
  formData?: FormData;
  /** Login/register/refresh: send no token and never trigger a refresh. */
  skipAuth?: boolean;
  timeoutMs?: number;
  /** Upload progress as a 0–1 fraction. */
  onUploadProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

interface ValidationIssue {
  loc?: unknown[];
  msg?: string;
}

function humanizeValidationMessage(msg: string): string {
  return msg.replace(/^Value error, /, '').replace(/^String should/, 'Should');
}

/** Turn any thrown value into an ApiError with a message fit for a toast. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (!axios.isAxiosError(err)) {
    return new ApiError(0, err instanceof Error ? err.message : SERVER_ERROR_MESSAGE);
  }
  if (!err.response) {
    const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
    return new ApiError(0, timedOut ? TIMEOUT_MESSAGE : NETWORK_ERROR_MESSAGE, err.message);
  }

  const { status, data } = err.response;
  const detail: unknown = typeof data === 'object' && data !== null ? (data as { detail?: unknown }).detail : undefined;

  if (typeof detail === 'string') {
    return new ApiError(status, status >= 500 ? SERVER_ERROR_MESSAGE : detail, detail);
  }
  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of detail as ValidationIssue[]) {
      const field = issue.loc?.[issue.loc.length - 1];
      if (typeof field === 'string' && issue.msg && !fieldErrors[field]) {
        fieldErrors[field] = humanizeValidationMessage(issue.msg);
      }
    }
    const first = Object.entries(fieldErrors)[0];
    const message = first ? `${first[0]}: ${first[1]}` : 'Some of the information you entered is invalid.';
    return new ApiError(status, message, JSON.stringify(detail), fieldErrors);
  }
  // No FastAPI JSON body: a 5xx here usually means a proxy/gateway couldn't reach the backend.
  if (status >= 500) return new ApiError(status, status === 500 ? SERVER_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE);
  return new ApiError(status, `Request failed (${status}).`);
}

type RefreshOutcome = { token: string } | { rejected: true };

export class ApiClient {
  private readonly http: AxiosInstance;
  private refreshInFlight: Promise<RefreshOutcome> | null = null;

  constructor(config: CreateAxiosDefaults = {}) {
    this.http = axios.create({
      baseURL: import.meta.env.VITE_API_URL ?? '',
      timeout: DEFAULT_TIMEOUT_MS,
      ...config,
    });
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const send = async (token: string | null): Promise<T> => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (options.body !== undefined && !options.formData) headers['Content-Type'] = 'application/json';
      const config: AxiosRequestConfig = {
        url: endpoint,
        method: options.method ?? (options.body !== undefined || options.formData ? 'POST' : 'GET'),
        data: options.formData ?? options.body,
        headers,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal: options.signal,
        onUploadProgress: options.onUploadProgress
          ? (e) => options.onUploadProgress?.(e.total ? e.loaded / e.total : 0)
          : undefined,
      };
      const response = await this.http.request<T>(config);
      return response.data;
    };

    if (options.skipAuth) {
      try {
        return await send(null);
      } catch (err) {
        throw toApiError(err);
      }
    }

    const token = await this.usableAccessToken();
    try {
      return await send(token);
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) throw toApiError(err);
    }

    // 401: refresh once, retry once. No loops.
    const outcome = await this.refresh();
    if ('rejected' in outcome) throw this.expireSession();
    try {
      return await send(outcome.token);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) throw this.expireSession();
      throw toApiError(err);
    }
  }

  get<T>(endpoint: string, options: Omit<RequestOptions, 'method' | 'body' | 'formData'> = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body: body ?? {} });
  }

  upload<T>(endpoint: string, formData: FormData, options: Omit<RequestOptions, 'method' | 'formData'> = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', formData });
  }

  /** Current access token, refreshed first if it is missing/expired but a refresh token exists. */
  private async usableAccessToken(): Promise<string | null> {
    const access = getAccessToken();
    if (access && !isJwtExpired(access)) return access;
    if (!getRefreshToken()) return access; // let the server answer (→ 401 → session end)
    const outcome = await this.refresh();
    if ('rejected' in outcome) throw this.expireSession();
    return outcome.token;
  }

  /**
   * Exchange the refresh token for a new access token. Concurrent callers share
   * one in-flight request. A 401/422 from the server means the refresh token is
   * dead ("rejected"); network errors are thrown so they don't log anyone out.
   */
  private refresh(): Promise<RefreshOutcome> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = (async (): Promise<RefreshOutcome> => {
        const refreshToken = getRefreshToken();
        if (!refreshToken || isJwtExpired(refreshToken, 0)) return { rejected: true };
        try {
          const { data } = await this.http.post<AccessTokenResponse>(
            '/api/auth/refresh',
            { refresh_token: refreshToken },
            { headers: { 'Content-Type': 'application/json' } },
          );
          setAccessToken(data.access_token);
          return { token: data.access_token };
        } catch (err) {
          const status = axios.isAxiosError(err) ? err.response?.status : undefined;
          if (status === 401 || status === 422) return { rejected: true };
          throw toApiError(err);
        }
      })().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  /** Clear the session once, tell the user, and return the error to throw. */
  private expireSession(): ApiError {
    if (hasSession()) {
      endSession('expired');
      globalToast.error(SESSION_EXPIRED_MESSAGE);
    }
    return new ApiError(401, SESSION_EXPIRED_MESSAGE);
  }
}

export const apiClient = new ApiClient();
