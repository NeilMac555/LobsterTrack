import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getXgClub } from '../api';
import type { XgTableRow } from '../types';

// One-line goals-vs-xG note for a match page: "Crystal Palace have scored
// 18.7 goals fewer than their expected goals over the last 12 months".
// Mirrors the sentence the backend puts into the server-rendered match
// page (services/match_page.py). Shown only for top-five-league clubs the
// data can name with confidence, and only when the gap is 3+ goals.

const MIN_GAP = 3;

export default function XgGapNote({ league, home, away }: { league: string; home: string; away: string }) {
  const [rows, setRows] = useState<Array<[string, XgTableRow]>>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([home, away].map((t) => getXgClub(league, t).then((r) => [t, r.row] as const).catch(() => [t, null] as const)))
      .then((res) => {
        if (cancelled) return;
        setRows(res.filter((x): x is readonly [string, XgTableRow] => !!x[1] && Math.abs(x[1].gap) >= MIN_GAP).map(([t, r]) => [t, r]));
      });
    return () => { cancelled = true; };
  }, [league, home, away]);

  if (!rows.length) return null;
  return (
    <p className="text-xs text-slate-400 px-4 sm:px-5 py-2 border-t border-slate-700/40">
      {rows.map(([t, r]) => (
        <span key={t}>
          {t} have scored {Math.abs(r.gap).toFixed(1)} goals {r.gap < 0 ? 'fewer' : 'more'} than their expected goals over the last 12 months ({r.matches} league matches).{' '}
        </span>
      ))}
      See <Link to="/goals-coming-soon" className="text-cyan-400 hover:underline">Goals Coming Soon</Link>.
    </p>
  );
}
