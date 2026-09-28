/**
 * React binding for the auth store (src/stores/authStore.ts).
 *
 * login/register call the API (real or mock, via the barrel), store the token
 * pair, and return the user decoded from the JWT. Callers don't navigate —
 * PublicOnlyRoute performs the single post-login redirect.
 */
import { useCallback, useSyncExternalStore } from 'react';

import { loginUser, registerUser } from '../api';
import {
  clearLogoutReason,
  endSession,
  getSnapshot,
  startSession,
  subscribe,
  type AuthUser,
  type LogoutReason,
} from '../stores/authStore';

export interface UseAuth {
  isLoggedIn: boolean;
  user: AuthUser | null;
  logoutReason: LogoutReason;
  /** Throws ApiError (401 on bad credentials). */
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Creates the account, then logs in. Throws ApiError (409 if the email is taken, 422 on validation). */
  register: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  clearLogoutReason: () => void;
}

async function signIn(email: string, password: string): Promise<AuthUser> {
  const tokens = await loginUser(email, password);
  const user = startSession(tokens.access_token, tokens.refresh_token);
  if (!user) throw new Error('Received an unreadable session token.');
  return user;
}

export function useAuth(): UseAuth {
  const { user, logoutReason } = useSyncExternalStore(subscribe, getSnapshot);

  const login = useCallback((email: string, password: string) => signIn(email, password), []);

  const register = useCallback(async (email: string, password: string) => {
    await registerUser(email, password);
    return signIn(email, password); // the backend's register doesn't issue tokens
  }, []);

  // Clearing the session re-renders the current ProtectedRoute, which sends
  // the user home (logoutReason "manual"). No navigate() call needed.
  const logout = useCallback(() => endSession('manual'), []);

  return {
    isLoggedIn: user !== null,
    user,
    logoutReason,
    login,
    register,
    logout,
    clearLogoutReason,
  };
}
