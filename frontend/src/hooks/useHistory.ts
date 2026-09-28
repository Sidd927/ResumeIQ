import { useCallback, useEffect, useState } from 'react';

import { getJobDescriptions, getMatchHistory } from '../api';
import type { JobDescriptionResponse, MatchResponse } from '../types';

interface HistoryState {
  matches: MatchResponse[];
  jobs: Record<number, JobDescriptionResponse>;
  loading: boolean;
  error: string | null;
}

interface UseHistory extends HistoryState {
  reload: () => void;
}

/** Loads the user's match history (most recent first) plus the JDs it references. */
export function useHistory(): UseHistory {
  const [state, setState] = useState<HistoryState>({ matches: [], jobs: {}, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const matches = await getMatchHistory();
        const jobs = await getJobDescriptions(matches.map((m) => m.jd_id));
        if (!cancelled) setState({ matches, jobs, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Could not load history.';
          setState({ matches: [], jobs: {}, loading: false, error: message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
