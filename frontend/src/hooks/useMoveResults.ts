import { useEffect, useState } from 'react';
import { getDrifterResults, getSteamResults } from '../api';
import type { SteamResultsData } from '../types';

export function useMoveResults(kind: 'steam' | 'drift', league: string | null, days: number | null) {
  const [data, setData] = useState<SteamResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let hasData = false;
    setLoading(true);
    setError(null);
    setData(null);
    setCheckedAt(null);

    async function refresh() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const fetchResults = kind === 'steam' ? getSteamResults : getDrifterResults;
        const result = await fetchResults({ league: league || undefined, days: days || undefined, limit: 200 });
        if (cancelled) return;
        hasData = true;
        setData(result);
        setCheckedAt(new Date());
        setError(null);
      } catch {
        if (!cancelled) setError(hasData
          ? 'Refresh failed. Showing the last successful update; retrying automatically.'
          : 'Could not load results. Retrying automatically.');
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const timer = window.setInterval(refreshVisible, 60_000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [kind, league, days, retry]);

  return { data, loading, error, checkedAt, retry: () => setRetry(n => n + 1) };
}
