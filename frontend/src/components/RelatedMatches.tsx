import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRelatedMatches } from '../api';
import type { RelatedMatches as Related } from '../types';

// "Other matches this round" plus the league hub link on a match page.
// Mirrors the links backend/app/services/match_page.py server-renders, so
// they survive once the app mounts. If this id is a duplicate record of a
// rescheduled fixture, move to the surviving record.

export default function RelatedMatches({ matchId }: { matchId: string }) {
  const [data, setData] = useState<Related | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getRelatedMatches(matchId)
      .then((d) => {
        if (cancelled) return;
        if (d.redirect_to) navigate(`/match/${d.redirect_to}`, { replace: true });
        else setData(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [matchId, navigate]);

  if (!data) return null;
  const a = 'text-cyan-400 hover:underline';
  return (
    <div className="mt-8">
      {data.matches.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-white mb-2">Other {data.league_name} matches this round</h2>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-300 mb-4">
            {data.matches.map((m) => (
              <li key={m.id}>
                <Link to={`/match/${m.id}`} className={a}>{m.home_team} vs {m.away_team}</Link>{' '}
                <span className="text-slate-500 text-xs">{new Date(`${m.commence_time}Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {data.league_slug && (
        <p className="text-sm">
          <Link to={`/league/${data.league_slug}`} className={a}>All {data.league_name} matches and closing prices</Link>
        </p>
      )}
    </div>
  );
}
