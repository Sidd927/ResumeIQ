import { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { globalToast } from '../components/ui/toastContext';
import { makeUnsignedJwt } from '../lib/jwt';
import { getSnapshot, startSession, TOKEN_KEYS } from '../stores/authStore';
import { ApiClient, ApiError, NETWORK_ERROR_MESSAGE, SESSION_EXPIRED_MESSAGE, toApiError } from './client';

const now = () => Math.floor(Date.now() / 1000);
const token = (type: 'access' | 'refresh', expInSeconds: number, tag = '') =>
  makeUnsignedJwt({ sub: '7', email: `ada${tag}@example.com`, type, exp: now() + expInSeconds });

interface Call {
  url: string;
  method: string;
  auth: string | undefined;
  contentType: string | undefined;
  data: unknown;
}

/** A fake axios adapter: routes each request to a handler and records it. */
function fakeServer(handler: (call: Call) => { status: number; data?: unknown } | 'network-error') {
  const calls: Call[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const headers = AxiosHeaders.from(config.headers);
    const call: Call = {
      url: config.url ?? '',
      method: (config.method ?? 'get').toUpperCase(),
      auth: headers.get('Authorization')?.toString(),
      contentType: headers.get('Content-Type')?.toString(),
      data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    };
    calls.push(call);
    const result = handler(call);
    if (result === 'network-error') throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    const response: AxiosResponse = {
      status: result.status,
      statusText: String(result.status),
      data: result.data ?? {},
      headers: {},
      config,
    };
    if (result.status >= 400) throw new AxiosError('fail', 'ERR_BAD_RESPONSE', config, null, response);
    return response;
  };
  return { client: new ApiClient({ adapter, baseURL: '' }), calls };
}

beforeEach(() => {
  localStorage.clear();
});

describe('auth headers', () => {
  it('attaches the stored access token as a Bearer header', async () => {
    const access = token('access', 600);
    startSession(access, token('refresh', 3600));
    const { client, calls } = fakeServer(() => ({ status: 200, data: [] }));

    await client.get('/api/match/history');

    expect(calls[0].auth).toBe(`Bearer ${access}`);
  });

  it('sends no token for skipAuth requests (login/register)', async () => {
    startSession(token('access', 600), token('refresh', 3600));
    const { client, calls } = fakeServer(() => ({ status: 200, data: {} }));

    await client.post('/api/auth/login', { email: 'a@b.co', password: 'x' }, { skipAuth: true });

    expect(calls[0].auth).toBeUndefined();
    expect(calls[0].contentType).toBe('application/json');
  });

  it('does not force a JSON content type on multipart uploads', async () => {
    startSession(token('access', 600), token('refresh', 3600));
    const { client, calls } = fakeServer(() => ({ status: 201, data: {} }));
    const form = new FormData();
    form.append('file', new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }));

    await client.upload('/api/resumes', form);

    expect(calls[0].contentType).not.toBe('application/json');
    expect(calls[0].data).toBeInstanceOf(FormData);
  });
});

describe('token refresh', () => {
  it('on 401, refreshes once and retries the original request', async () => {
    startSession(token('access', 600, '-old'), token('refresh', 3600));
    const fresh = token('access', 600, '-new');
    const { client, calls } = fakeServer((call) => {
      if (call.url === '/api/auth/refresh') return { status: 200, data: { access_token: fresh, token_type: 'bearer' } };
      return call.auth === `Bearer ${fresh}` ? { status: 200, data: ['ok'] } : { status: 401, data: { detail: 'expired' } };
    });

    await expect(client.get<string[]>('/api/match/history')).resolves.toEqual(['ok']);

    expect(calls.map((c) => c.url)).toEqual(['/api/match/history', '/api/auth/refresh', '/api/match/history']);
    expect(localStorage.getItem(TOKEN_KEYS.access)).toBe(fresh);
  });

  it('refreshes BEFORE the request when the access token is already expired', async () => {
    startSession(token('access', -10), token('refresh', 3600));
    const fresh = token('access', 600, '-new');
    const { client, calls } = fakeServer((call) =>
      call.url === '/api/auth/refresh' ? { status: 200, data: { access_token: fresh } } : { status: 200, data: [] },
    );

    await client.get('/api/match/history');

    expect(calls.map((c) => c.url)).toEqual(['/api/auth/refresh', '/api/match/history']);
    expect(calls[1].auth).toBe(`Bearer ${fresh}`);
  });

  it('shares one refresh between concurrent 401s', async () => {
    startSession(token('access', 600, '-old'), token('refresh', 3600));
    const fresh = token('access', 600, '-new');
    const { client, calls } = fakeServer((call) => {
      if (call.url === '/api/auth/refresh') return { status: 200, data: { access_token: fresh } };
      return call.auth === `Bearer ${fresh}` ? { status: 200, data: {} } : { status: 401 };
    });

    await Promise.all([client.get('/api/jobs/1'), client.get('/api/jobs/2'), client.get('/api/jobs/3')]);

    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  it('when refresh is rejected: clears tokens, marks the session expired, toasts once, no retry loop', async () => {
    startSession(token('access', 600), token('refresh', 3600));
    const toast = vi.spyOn(globalToast, 'error');
    const { client, calls } = fakeServer((call) =>
      call.url === '/api/auth/refresh' ? { status: 401, data: { detail: 'Invalid token' } } : { status: 401 },
    );

    const error = await client.get('/api/match/history').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe(SESSION_EXPIRED_MESSAGE);
    expect(calls).toHaveLength(2); // original + one refresh attempt, nothing more
    expect(localStorage.getItem(TOKEN_KEYS.access)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBeNull();
    expect(getSnapshot()).toMatchObject({ user: null, logoutReason: 'expired' });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });

  it('a network error during refresh does NOT log the user out', async () => {
    startSession(token('access', -10), token('refresh', 3600));
    const { client } = fakeServer(() => 'network-error');

    const error = await client.get('/api/match/history').catch((e: unknown) => e);

    expect((error as ApiError).isNetworkError).toBe(true);
    expect(localStorage.getItem(TOKEN_KEYS.refresh)).not.toBeNull();
    expect(getSnapshot().user).not.toBeNull();
  });
});

describe('error normalisation', () => {
  it('maps a missing response to a friendly network message', async () => {
    const { client } = fakeServer(() => 'network-error');
    const error = await client.post('/api/auth/login', {}, { skipAuth: true }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, message: NETWORK_ERROR_MESSAGE });
  });

  it("uses FastAPI's string detail as the message", async () => {
    const { client } = fakeServer(() => ({ status: 409, data: { detail: 'An account with this email already exists' } }));
    const error = await client.post('/api/auth/register', {}, { skipAuth: true }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, message: 'An account with this email already exists' });
  });

  it('turns FastAPI 422 validation lists into per-field errors', async () => {
    const detail = [
      { loc: ['body', 'password'], msg: 'String should have at least 8 characters', type: 'string_too_short' },
      { loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'value_error' },
    ];
    const { client } = fakeServer(() => ({ status: 422, data: { detail } }));
    const error = (await client.post('/api/auth/register', {}, { skipAuth: true }).catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(422);
    expect(error.fieldErrors).toEqual({
      password: 'Should have at least 8 characters',
      email: 'value is not a valid email address',
    });
  });

  it('hides server internals on 5xx', () => {
    const response = { status: 500, statusText: '', data: { detail: 'Traceback …' }, headers: {}, config: {} } as AxiosResponse;
    const err = toApiError(new AxiosError('x', 'ERR_BAD_RESPONSE', undefined, null, response));
    expect(err.message).not.toContain('Traceback');
  });
});
