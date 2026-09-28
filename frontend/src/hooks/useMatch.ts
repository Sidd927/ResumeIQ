import { useEffect, useState } from 'react';

import { getJobDescriptions, getMatch, getResume } from '../api';
import type { JobDescriptionResponse, MatchResponse, ResumeResponse } from '../types';

export interface MatchReport {
  match: MatchResponse;
  job: JobDescriptionResponse | null;
  resume: ResumeResponse | null;
}

interface MatchState {
  report: MatchReport | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
}

interface Loaded {
  id: number;
  report: MatchReport | null;
  error: string | null;
}

/** Loads one match result with the JD and resume it was computed from. 404 → notFound. */
export function useMatch(id: number): MatchState {
  // Results are tagged with the id they were loaded for, so "loading" is
  // derived during render instead of being reset inside the effect.
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const match = await getMatch(id);
        if (!match) {
          if (!cancelled) setLoaded({ id, report: null, error: null });
          return;
        }
        const [jobs, resume] = await Promise.all([getJobDescriptions([match.jd_id]), getResume(match.resume_id)]);
        if (!cancelled) setLoaded({ id, report: { match, job: jobs[match.jd_id] ?? null, resume }, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load this match.';
        if (!cancelled) setLoaded({ id, report: null, error: message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const current = loaded?.id === id ? loaded : null;
  return {
    report: current?.report ?? null,
    loading: current === null,
    notFound: current !== null && current.report === null && current.error === null,
    error: current?.error ?? null,
  };
}
