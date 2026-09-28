/**
 * Read-only JWT helpers. We decode the payload to learn who is logged in and
 * when the token expires; we NEVER verify the signature here — that is the
 * server's job, and a tampered token is simply rejected by the API.
 */

export interface JwtPayload {
  /** User id (a string per RFC 7519). */
  sub: string;
  email?: string;
  type?: 'access' | 'refresh';
  /** Expiry, seconds since epoch. */
  exp?: number;
  iat?: number;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a JWT's payload without verifying it. Returns null for anything malformed. */
export function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(base64UrlDecode(parts[1]));
    if (typeof payload !== 'object' || payload === null) return null;
    const { sub } = payload as { sub?: unknown };
    return typeof sub === 'string' ? (payload as JwtPayload) : null;
  } catch {
    return null;
  }
}

/**
 * True if the token is missing, malformed, or expires within `skewSeconds`.
 * The skew refreshes slightly early so a request never races the expiry.
 */
export function isJwtExpired(token: string | null | undefined, skewSeconds = 30, nowMs = Date.now()): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 - skewSeconds * 1000 <= nowMs;
}

/** Build an UNSIGNED token (mock mode only) so mock and real auth share one code path. */
export function makeUnsignedJwt(payload: JwtPayload): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  return `${header}.${base64UrlEncode(JSON.stringify(payload))}.mock`;
}
