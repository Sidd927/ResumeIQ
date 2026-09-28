import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeJwt } from '../lib/jwt';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('VITE_USE_MOCK toggle', () => {
  it('uses the mock implementation when VITE_USE_MOCK=true', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    const api = await import('./index');
    const mock = await import('./mockApi');

    expect(api.USE_MOCK).toBe(true);
    expect(api.getMatchHistory).toBe(mock.getMatchHistory);
    // Mock login needs no server and yields tokens the auth store can read.
    const tokens = await api.loginUser('Demo@Example.com', 'anything');
    expect(decodeJwt(tokens.access_token)).toMatchObject({ email: 'demo@example.com', type: 'access' });
  });

  it('uses the real implementation by default', async () => {
    vi.stubEnv('VITE_USE_MOCK', '');
    const api = await import('./index');
    const real = await import('./api');

    expect(api.USE_MOCK).toBe(false);
    expect(api.getMatchHistory).toBe(real.getMatchHistory);
  });

  it('rejects unsupported files before any upload (real implementation)', async () => {
    const real = await import('./api');
    const txt = new File(['hello'], 'resume.txt', { type: 'text/plain' });
    await expect(real.uploadResume(txt)).rejects.toMatchObject({ status: 415 });
  });
});
