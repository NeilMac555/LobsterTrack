import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { getBiggestMovers, getSteamResults } from '../api';
import type { BiggestMover } from '../types';

// /dropping-odds — the client-rendered twin of
// backend/app/services/dropping_odds_page.py, which server-renders the same
// intro and table into the document for crawlers. Keep the copy identical
// in both places.

const TITLE = 'Dropping Odds Today: Football Odds Tracker | SteamWatch';
const DESCRIPTION =
  'Football fixtures whose Pinnacle odds dropped most in the last 48 hours: opening price, current price and implied-probability change, every 15 minutes.';

const MARKET_LABEL: Record<string, string> = { '1x2': '1X2', totals: 'Totals', spreads: 'Asian handicap' };

function impliedChange(open: number, now: number): number | null {
  if (!open || !now) return null;
  return 100 / now - 100 / open;
}

function kickoffUtc(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  const day = d.getUTCDate();
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${hh}:${mm} UTC`;
}

export default function DroppingOddsPage() {
  const [movers, setMovers] = useState<BiggestMover[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<string>("The season's record of every logged steam move is on Steam Results.");

  useEffect(() => {
    let cancelled = false;
    getBiggestMovers(50)
      .then((rows) => {
        if (cancelled) return;
        // Largest implied-probability drop first, matching the server-rendered table.
        setMovers([...rows].sort((a, b) => (impliedChange(b.opening_odds, b.current_odds) ?? 0) - (impliedChange(a.opening_odds, a.current_odds) ?? 0)));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); });
    getSteamResults({ limit: 1 })
      .then((r) => {
        if (cancelled || !r.total_moves) return;
        const roi = r.roi_percent ?? 0;
        setRecord(`So far in ${r.season_label ?? 'this season'} SteamWatch has logged ${r.total_moves} steam moves: ${(r.win_rate ?? 0).toFixed(1)}% won, and backing every one with 1 unit at the post-move price returned ${roi > 0 ? '+' : ''}${roi.toFixed(1)}%.`);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://www.steamwatch.io/dropping-odds" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content="https://www.steamwatch.io/dropping-odds" />
      </Helmet>

      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">Dropping Odds Today</h1>
      <p className="text-xs text-slate-500 font-mono mb-4">
        {movers ? `${movers.length} fixtures with a shortening price` : 'Loading'} · Pinnacle prices via The Odds API
      </p>

      <div className="prose-sw max-w-[72ch] text-slate-300 text-[15px] leading-relaxed space-y-3">
        <p className="text-slate-200">
          Dropping odds are prices that have shortened since they opened. The table below lists the upcoming fixtures whose
          Pinnacle price has dropped most over the last 48 hours, with the opening price, the current price and the change in
          implied probability.
        </p>
        <h2 className="text-lg font-bold text-white pt-3">How SteamWatch measures a drop</h2>
        <p>
          SteamWatch records Pinnacle's 1X2, Asian handicap and totals prices every 15 minutes, and more often close to
          kickoff. For each upcoming match it compares the current price with the price 48 hours earlier, or with the opening
          price for matches listed more recently, and shows the selection that shortened most across the 1X2 and totals
          markets. The change is given in implied-probability points: 100 divided by the price, now minus then. A move from
          2.00 to 1.80 is a drop of 5.6 points.
        </p>
        <h2 className="text-lg font-bold text-white pt-3">Steamers and drifters</h2>
        <p>
          SteamWatch logs a drop of 3 percentage points or more before kickoff as a steamer and follows it to the result on{' '}
          <Link to="/steam-results" className="text-cyan-400 hover:underline">Steam Results</Link>.
          The opposite move, a price that lengthens, is a drifter, and those are tracked on <Link to="/drifters" className="text-cyan-400 hover:underline">Drifters</Link>.
          {' '}{record}
        </p>
        <p>
          Background: <Link to="/blog/what-are-steam-moves-in-football-betting" className="text-cyan-400 hover:underline">what steam moves are</Link>,{' '}
          <Link to="/blog/what-is-a-drifter-in-football-betting" className="text-cyan-400 hover:underline">what a drifter is</Link> and{' '}
          <Link to="/blog/how-to-read-closing-lines-in-football-betting" className="text-cyan-400 hover:underline">how to read closing lines</Link>.
        </p>
      </div>

      <h2 className="text-lg font-bold text-white mt-8 mb-3">Biggest drops in the last 48 hours</h2>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {movers && movers.length === 0 && (
        <p className="text-slate-400 text-sm">
          No price has dropped by more than a fraction of a point in the last 48 hours. The table fills as fixtures are listed and prices move.
        </p>
      )}
      {movers && movers.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-700/50">
          <table className="w-full text-[13px] font-mono">
            <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Kickoff</th>
                <th className="text-left px-3 py-2">Match</th>
                <th className="text-left px-3 py-2">Competition</th>
                <th className="text-left px-3 py-2">Selection</th>
                <th className="text-right px-3 py-2">From</th>
                <th className="text-right px-3 py-2">Now</th>
                <th className="text-right px-3 py-2">Implied change</th>
              </tr>
            </thead>
            <tbody>
              {movers.map((m) => {
                const pp = impliedChange(m.opening_odds, m.current_odds);
                return (
                  <tr key={m.match_id} className="border-t border-slate-700/40 text-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{kickoffUtc(m.commence_time)}</td>
                    <td className="px-3 py-2">
                      <Link to={`/match/${m.match_id}`} className="text-cyan-400 hover:underline">
                        {m.home_team} v {m.away_team}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{m.league_name}</td>
                    <td className="px-3 py-2">
                      {m.outcome_name} <span className="text-slate-500">({MARKET_LABEL[m.market] ?? m.market})</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.opening_odds.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.current_odds.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${pp !== null && pp > 0.05 ? 'text-red-400' : ''}`}>
                      {pp === null ? '—' : `${pp > 0 ? '+' : ''}${pp.toFixed(1)}pp`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500 mt-3 max-w-[72ch]">
        From is the opening price, or the price 48 hours ago for matches listed earlier than that.
      </p>
      <p className="text-xs text-slate-500 mt-1 max-w-[72ch]">
        Implied change is in percentage points, largest first; positive means the price shortened. Each match links to its full open-to-kickoff price history.
      </p>

      <h2 className="text-lg font-bold text-white mt-8 mb-2">More on SteamWatch</h2>
      <ul className="list-disc pl-5 text-slate-300 text-sm space-y-1">
        <li><Link to="/" className="text-cyan-400 hover:underline">Live odds and biggest movers by league</Link></li>
        <li><Link to="/steam-results" className="text-cyan-400 hover:underline">Steam Results: how detected steam moves have performed</Link></li>
        <li><Link to="/drifters" className="text-cyan-400 hover:underline">Drifters: prices that lengthened before kickoff</Link></li>
        <li><Link to="/closing-lines" className="text-cyan-400 hover:underline">Closing Lines: the Pinnacle close for every finished match</Link></li>
      </ul>
    </div>
  );
}
