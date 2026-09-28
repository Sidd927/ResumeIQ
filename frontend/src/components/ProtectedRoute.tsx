import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { safeRedirectPath } from '../lib/redirect';

/**
 * Renders children (or the nested route) only when logged in.
 * - Logged out → /login?redirect=<where they were going>
 * - Right after clicking Logout → the landing page instead
 *
 * "Logged in" means we hold an unexpired refresh token; a stale access token
 * is refreshed transparently by the API client on the next request.
 */
export default function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { isLoggedIn, logoutReason } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    if (logoutReason === 'manual') return <Navigate to="/" replace />;
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/**
 * Inverse guard for Landing / Login / Register: logged-in users go to the
 * validated ?redirect= target, or the dashboard.
 *
 * Login pages don't navigate themselves — they call login() and this guard
 * performs the single redirect, avoiding racing navigations.
 */
export function PublicOnlyRoute({ children }: { children?: ReactNode }) {
  const { isLoggedIn, logoutReason, clearLogoutReason } = useAuth();
  const [searchParams] = useSearchParams();

  // Once on a public page, a later visit to a protected URL should go to /login again.
  useEffect(() => {
    if (logoutReason) clearLogoutReason();
  }, [logoutReason, clearLogoutReason]);

  if (isLoggedIn) return <Navigate to={safeRedirectPath(searchParams.get('redirect'))} replace />;
  return <>{children ?? <Outlet />}</>;
}
