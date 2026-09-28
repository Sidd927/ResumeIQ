import { describe, expect, it } from 'vitest';

import { decodeJwt, isJwtExpired, makeUnsignedJwt } from './jwt';
import { safeRedirectPath } from './redirect';

describe('decodeJwt', () => {
  it('reads the payload of a backend-shaped token (no signature check)', () => {
    // Header + payload exactly as the FastAPI backend issues them; the signature
    // is a placeholder — decoding must never depend on it.
    const backendToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc5MDU4NjYzMSwiZXhwIjoxNzkwNTg4NDMxfQ.not-a-real-signature';
    expect(decodeJwt(backendToken)).toMatchObject({
      sub: '1',
      email: 'user@example.com',
      type: 'access',
      exp: 1790588431,
    });
  });

  it('round-trips unicode through base64url', () => {
    const t = makeUnsignedJwt({ sub: '5', email: 'zoë@exämple.com' });
    expect(decodeJwt(t)?.email).toBe('zoë@exämple.com');
  });

  it.each(['', 'not-a-jwt', 'a.b', 'a.!!!.c', `x.${btoa('"just a string"')}.y`, `x.${btoa('{"email":"no-sub"}')}.y`])(
    'returns null for malformed input %j',
    (bad) => {
      expect(decodeJwt(bad)).toBeNull();
    },
  );
});

describe('isJwtExpired', () => {
  const now = 1_000_000_000_000;
  const at = (expSeconds: number) => makeUnsignedJwt({ sub: '1', exp: expSeconds });

  it('treats tokens inside the skew window as expired', () => {
    expect(isJwtExpired(at(now / 1000 + 10), 30, now)).toBe(true);
    expect(isJwtExpired(at(now / 1000 + 60), 30, now)).toBe(false);
  });

  it('treats missing tokens and missing exp as expired', () => {
    expect(isJwtExpired(null)).toBe(true);
    expect(isJwtExpired(makeUnsignedJwt({ sub: '1' }))).toBe(true);
  });
});

describe('safeRedirectPath', () => {
  it.each([
    ['/history', '/history'],
    ['/match/3?tab=skills', '/match/3?tab=skills'],
    [null, '/dashboard'],
    ['', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['/login', '/dashboard'],
    ['/register?redirect=/x', '/dashboard'],
  ])('%j → %j', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
