/**
 * Auth store — the single owner of the JWTs.
 *
 * State is DERIVED from the tokens in localStorage, so a browser refresh (or
 * another tab) restores exactly the same session with no /me request:
 *   - user        ← decoded from the access token's payload (sub, email)
 *   - isLoggedIn  ← we hold a refresh token that hasn't expired (an expired
 *                   ACCESS token is fine: the API client refreshes it before
 *                   the next request)
 *
 * Exposed to React through useSyncExternalStore (see hooks/useAuth.ts), so the
 * navbar and route guards re-render together without a Context provider.
 * Non-React code (the API client) calls the plain functions below.
 */
import { decodeJwt, isJwtExpired } from '../lib/jwt';

export interface AuthUser {
  id: number;
  email: string;
}

/** Why the user was logged out — guards route "manual" home and "expired" to /login. */
export type LogoutReason = 'manual' | 'expired' | null;

export interface AuthSnapshot {
  user: AuthUser | null;
  logoutReason: LogoutReason;
}

export const TOKEN_KEYS = {
  access: 'resumeiq_access_token',
  refresh: 'resumeiq_refresh_token',
} as const;

const listeners = new Set<() => void>();
let logoutReason: LogoutReason = null;
let snapshot: AuthSnapshot = computeSnapshot();

function computeSnapshot(): AuthSnapshot {
  const access = localStorage.getItem(TOKEN_KEYS.access);
  const refresh = localStorage.getItem(TOKEN_KEYS.refresh);
  const sessionAlive = !isJwtExpired(refresh, 0) || !isJwtExpired(access, 0);
  const claims = decodeJwt(access) ?? decodeJwt(refresh);
  const id = Number(claims?.sub);
  const user = sessionAlive && claims && Number.isFinite(id) ? { id, email: claims.email ?? '' } : null;
  return { user, logoutReason };
}

function emit(): void {
  snapshot = computeSnapshot();
  listeners.forEach((listener) => listener());
}

// Keep tabs in sync: logging out in one tab logs out the others.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === TOKEN_KEYS.access || e.key === TOKEN_KEYS.refresh) emit();
  });
}

// ── React binding ────────────────────────────────────────────────────────────

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): AuthSnapshot {
  return snapshot;
}

// ── Token access (used by the API client) ────────────────────────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.access);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.refresh);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEYS.access, token);
  emit();
}

// ── Session transitions ──────────────────────────────────────────────────────

/** Store a fresh token pair after login/register. Returns the user they identify. */
export function startSession(accessToken: string, refreshToken: string): AuthUser | null {
  localStorage.setItem(TOKEN_KEYS.access, accessToken);
  localStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
  logoutReason = null;
  emit();
  return snapshot.user;
}

/** Clear the tokens. "manual" = user clicked Logout; "expired" = refresh failed. */
export function endSession(reason: Exclude<LogoutReason, null>): void {
  localStorage.removeItem(TOKEN_KEYS.access);
  localStorage.removeItem(TOKEN_KEYS.refresh);
  logoutReason = reason;
  emit();
}

/** Forget why we logged out (once the user has landed on a public page). */
export function clearLogoutReason(): void {
  if (logoutReason === null) return;
  logoutReason = null;
  emit();
}

/** True if a session exists right now (non-React callers). */
export function hasSession(): boolean {
  return snapshot.user !== null;
}
