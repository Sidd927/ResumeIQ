import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JobDescriptionResponse, MatchResponse } from '../types';
import { getJobDescriptions, getMatch, getMatchHistory, loginUser, runMatch, uploadResume } from './api';
import { ApiError, apiClient } from './client';

const notFound = () => Promise.reject(new ApiError(404, 'Not found'));

function match(id: number, createdAt: string): MatchResponse {
  return {
    id,
    resume_id: 1,
    jd_id: 1,
    skill_score: 0.5,
    semantic_score: 0.5,
    recency_score: 0.5,
    completeness_score: 1,
    composite_score: 55,
    missing_skills: [],
    feedback_text: null,
    created_at: createdAt,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('real API layer', () => {
  it('login skips auth and allows a long timeout for a sleeping free-tier server', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ access_token: 'a', refresh_token: 'r' });
    await loginUser('ada@example.com', 'pw');
    expect(post).toHaveBeenCalledWith(
      '/api/auth/login',
      { email: 'ada@example.com', password: 'pw' },
      expect.objectContaining({ skipAuth: true, timeoutMs: expect.any(Number) }),
    );
    expect(post.mock.calls[0][2]?.timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('uploads the resume as multipart form data under the "file" field', async () => {
    const upload = vi.spyOn(apiClient, 'upload').mockResolvedValue({ id: 1 });
    const pdf = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' });
    await uploadResume(pdf);
    const [endpoint, form] = upload.mock.calls[0];
    expect(endpoint).toBe('/api/resumes');
    expect((form as FormData).get('file')).toBe(pdf);
  });

  it('never sends an unsupported file', async () => {
    const upload = vi.spyOn(apiClient, 'upload');
    await expect(uploadResume(new File(['x'], 'cv.exe'))).rejects.toMatchObject({ status: 415 });
    expect(upload).not.toHaveBeenCalled();
  });

  it('gives matching a long timeout (the model may be loading)', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(match(1, '2026-01-01T00:00:00Z'));
    await runMatch({ resume_id: 1, job_id: 2 });
    expect(post.mock.calls[0][2]?.timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('maps a 404 match to null but rethrows other errors', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementationOnce(notFound);
    await expect(getMatch(7)).resolves.toBeNull();
    get.mockImplementationOnce(() => Promise.reject(new ApiError(0, 'offline')));
    await expect(getMatch(7)).rejects.toMatchObject({ status: 0 });
  });

  it('does not call the API for impossible ids', async () => {
    const get = vi.spyOn(apiClient, 'get');
    await expect(getMatch(Number.NaN)).resolves.toBeNull();
    await expect(getMatch(-1)).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('fetches each job once and skips ones that 404', async () => {
    const job = { id: 1, parsed_json: null } as JobDescriptionResponse;
    const get = vi
      .spyOn(apiClient, 'get')
      .mockImplementation((url: string) => (url === '/api/jobs/1' ? Promise.resolve(job) : notFound()));
    await expect(getJobDescriptions([1, 1, 2, 1])).resolves.toEqual({ 1: job });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('returns history newest first', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([
      match(1, '2026-01-01T00:00:00Z'),
      match(3, '2026-03-01T00:00:00Z'),
      match(2, '2026-02-01T00:00:00Z'),
    ]);
    expect((await getMatchHistory()).map((m) => m.id)).toEqual([3, 2, 1]);
  });
});
