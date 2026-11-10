import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getLeagueFixtures } from '../api';
import type { LeagueFixtures } from '../types';
import { LEAGUE_CONFIG, leagueKeyFromSlug, leaguePath, VISIBLE_LEAGUES } from '../types';
import HomePage from './HomePage';

// /league/:slug — the indexable league hub. Client twin of
// backend/app/services/league_page.py, which server-renders the same
// heading and match links for crawlers. It shows the usual live dashboard
// filtered to the league (HomePage), then every finished match of the
// season with its closing 1X2 price, each linking to its match page.

function when(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
const price = (v: number | null) => (v ? v.toFixed(2) : '—');

export default function LeaguePage() {
  const { slug } = useParams();
  const leagueKey = slug ? leagueKeyFromSlug(slug) : null;
  const [data, setData] = useState<LeagueFixtures | null>(null);

  useEffect(() => {
    if (!slug || !leagueKey) return;
    let cancelled = false;
    setData(null);
    getLeagueFixtures(slug).then((d) => { if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [slug, leagueKey]);

  if (!leagueKey) return <Navigate to="/" replace />;
  const name = LEAGUE_CONFIG[leagueKey].name;
  const a = 'text-cyan-400 hover:underline';

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs text-slate-500 font-mono mb-2"><Link to="/" className={a}>SteamWatch</Link> › {name}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">{name} odds movement</h1>
        <p className="text-slate-300 text-[15px] leading-relaxed max-w-[72ch]">
          Every {name} match SteamWatch has tracked this season{data ? `: ${data.upcoming.length} upcoming and ${data.finished.length} finished` : ''}.
          Each match links to its full Pinnacle price history for the 1X2, Asian handicap and totals markets, from the opening price to kickoff.
        </p>
      </div>

      <HomePage leagueKey={leagueKey} />

      <div className="pb-4">
        <h2 className="text-lg font-bold text-white mt-8 mb-1">{name} results and closing prices</h2>
        <p className="text-xs text-slate-500 mb-3">Home, Draw and Away are the Pinnacle closing 1X2 prices, the last snapshot before kickoff.</p>
        {data && data.finished.length === 0 && <p className="text-slate-400 text-sm">No finished matches recorded yet this season.</p>}
        {data && data.finished.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-slate-700/50">
            <table className="w-full text-[13px] font-mono">
              <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Kickoff (UTC)</th>
                  <th className="text-left px-3 py-2">Match</th>
                  <th className="text-right px-3 py-2">Home</th>
                  <th className="text-right px-3 py-2">Draw</th>
                  <th className="text-right px-3 py-2">Away</th>
                </tr>
              </thead>
              <tbody>
                {data.finished.map((m) => (
                  <tr key={m.id} className="border-t border-slate-700/40 text-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-400">{when(m.commence_time)}</td>
                    <td className="px-3 py-2"><Link to={`/match/${m.id}`} className={a}>{m.home_team} vs {m.away_team}</Link></td>
                    <td className="px-3 py-2 text-right tabular-nums">{price(m.close_home)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{price(m.close_draw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{price(m.close_away)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 className="text-lg font-bold text-white mt-8 mb-2">Other competitions</h2>
        <p className="text-sm text-slate-300">
          {VISIBLE_LEAGUES.filter(([k]) => k !== leagueKey).map(([k, c], i) => (
            <span key={k}>{i > 0 && ' · '}<Link to={leaguePath(k)} className={a}>{c.name}</Link></span>
          ))}
        </p>
      </div>
    </div>
  );
}
