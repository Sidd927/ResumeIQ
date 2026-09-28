const DEFAULT_AFTER_LOGIN = '/dashboard';

/**
 * Validate a ?redirect= target: same-origin paths only. Rejects "//evil.com"
 * and "https://…" so the login page can't be used as an open redirect.
 */
export function safeRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_AFTER_LOGIN;
  if (raw === '/login' || raw === '/register' || raw.startsWith('/login?') || raw.startsWith('/register?')) {
    return DEFAULT_AFTER_LOGIN;
  }
  return raw;
}
