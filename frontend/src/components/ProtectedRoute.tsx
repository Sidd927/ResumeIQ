import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

/** Location state used to send the user back where they were after logging in. */
export interface RedirectState {
  from?: string;
}

/**
 * Renders children (or the nested route) only when logged in.
 * Logged-out visitors go to /login, remembering where they were headed.
 * Right after an explicit logout they go to the landing page instead.
 */
export default function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { isLoggedIn, justLoggedOut } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    if (justLoggedOut) return <Navigate to="/" replace />;
    const state: RedirectState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return <>{children ?? <Outlet />}</>;
}

/**
 * Inverse guard for Landing / Login / Register: logged-in users are sent to
 * the page they originally requested, or the dashboard.
 *
 * Login pages don't navigate themselves — they just call login() and this
 * guard performs the single redirect, avoiding racing navigations.
 */
export function PublicOnlyRoute({ children }: { children?: ReactNode }) {
  const { isLoggedIn, justLoggedOut, clearLogoutFlag } = useAuth();
  const location = useLocation();

  // Once the user has landed on a public page, a later visit to a protected
  // URL should go to /login again rather than home.
  useEffect(() => {
    if (justLoggedOut) clearLogoutFlag();
  }, [justLoggedOut, clearLogoutFlag]);

  if (isLoggedIn) {
    const from = (location.state as RedirectState | null)?.from;
    return <Navigate to={from ?? '/dashboard'} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}
