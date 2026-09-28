/**
 * Mock auth (Phase 1). State lives in localStorage and is exposed through
 * useSyncExternalStore, so every component calling useAuth() — navbar, route
 * guards, pages — re-renders together without a Context provider. Changes in
 * other tabs are picked up via the `storage` event.
 *
 * Phase 3 replaces login/logout bodies with real JWT calls; the hook's public
 * shape stays the same.
 */
import { useCallback, useSyncExternalStore } from 'react';

export interface MockUser {
  email: string;
}

interface AuthSnapshot {
  user: MockUser | null;
  /** True right after an explicit logout, so guards send the user home instead of to /login. */
  justLoggedOut: boolean;
}

const KEYS = { flag: 'isLoggedIn', email: 'resumeiq_user_email' } as const;
const DEFAULT_EMAIL = 'siddhant@example.com';

const listeners = new Set<() => void>();
let justLoggedOut = false;
let snapshot: AuthSnapshot = readSnapshot();

function readSnapshot(): AuthSnapshot {
  const loggedIn = localStorage.getItem(KEYS.flag) === 'true';
  const email = localStorage.getItem(KEYS.email) ?? DEFAULT_EMAIL;
  return { user: loggedIn ? { email } : null, justLoggedOut };
}

function emit(): void {
  snapshot = readSnapshot();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEYS.flag || e.key === KEYS.email) emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): AuthSnapshot {
  return snapshot;
}

export interface UseAuth {
  isLoggedIn: boolean;
  user: MockUser | null;
  justLoggedOut: boolean;
  login: (email: string) => MockUser;
  logout: () => void;
  clearLogoutFlag: () => void;
}

export function useAuth(): UseAuth {
  const { user, justLoggedOut: loggedOutFlag } = useSyncExternalStore(subscribe, getSnapshot);

  const login = useCallback((email: string): MockUser => {
    const normalized = email.trim().toLowerCase() || DEFAULT_EMAIL;
    localStorage.setItem(KEYS.flag, 'true');
    localStorage.setItem(KEYS.email, normalized);
    justLoggedOut = false;
    emit();
    return { email: normalized };
  }, []);

  // Clearing the flag re-renders the ProtectedRoute the user is on, which
  // redirects to the landing page (see justLoggedOut). No navigate() call is
  // needed here, which avoids two competing redirects.
  const logout = useCallback((): void => {
    localStorage.removeItem(KEYS.flag);
    localStorage.removeItem(KEYS.email);
    justLoggedOut = true;
    emit();
  }, []);

  const clearLogoutFlag = useCallback((): void => {
    if (!justLoggedOut) return;
    justLoggedOut = false;
    emit();
  }, []);

  return {
    isLoggedIn: user !== null,
    user,
    justLoggedOut: loggedOutFlag,
    login,
    logout,
    clearLogoutFlag,
  };
}
