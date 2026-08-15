import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { getPowerRankings, getPowerRankingHistory } from '../api';
import type { PowerRatingItem, PowerRatingHistoryPoint } from '../types';
import { LEAGUE_CONFIG } from '../types';
import LeagueLogo from '../components/LeagueLogo';

const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const AXIS_TICK = { fill: '#94a3b8', fontSize: 10, fontFamily: MONO_STACK };

// Distinct line colors for up to 4 teams compared at once.
const CHART_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#f87171'];

const MAX_COMPARE = 4;

export default function PowerRankingsPage() {
  const [ratings, setRatings] = useState<PowerRatingItem[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [histories, setHistories] = useState<Record<string, PowerRatingHistoryPoint[]>>({});

  useEffect(() => {
    getPowerRankings()
      .then((r) => {
        setRatings(r.ratings);
        setComputedAt(r.computed_at);
        // Seed the chart with the top 3 teams so it isn't empty on first load.
        setSelected(r.ratings.slice(0, 3).map((t) => t.team));
      })
      .catch(() => setError('Failed to load power rankings'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    selected.forEach((team) => {
      if (histories[team]) return;
      getPowerRankingHistory(team)
        .then((r) => setHistories((prev) => ({ ...prev, [team]: r.history })))
        .catch(() => {});
    });
  }, [selected, histories]);

  const toggleTeam = (team: string) => {
    setSelected((prev) => {
      if (prev.includes(team)) return prev.filter((t) => t !== team);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, team];
    });
  };

  // Merge each selected team's weekly history into one array of rows
  // keyed by computed_at, the shape recharts wants for multiple <Line>s
  // sharing one X axis.
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    selected.forEach((team) => {
      (histories[team] || []).forEach((point) => {
        const key = point.computed_at;
        const row = byDate.get(key) || { computed_at: key };
        row[team] = point.rating;
        byDate.set(key, row);
      });
    });
    return Array.from(byDate.values()).sort(
      (a, b) => new Date(a.computed_at as string).getTime() - new Date(b.computed_at as string).getTime()
    );
  }, [selected, histories]);

  return (
    <div className="max-w-5xl mx-auto">
      <Helmet>
        <title>Power Rankings — SteamWatch</title>
        <meta name="description" content="Cross-league team power ratings derived from Pinnacle Asian Handicap closing lines, bridged across leagues via Champions League and Europa League fixtures." />
        <meta property="og:title" content="Power Rankings — SteamWatch" />
        <meta property="og:description" content="Cross-league team power ratings derived from Pinnacle Asian Handicap closing lines." />
        <meta property="og:url" content="https://www.steamwatch.io/power-rankings" />
        <link rel="canonical" href="https://www.steamwatch.io/power-rankings" />
      </Helmet>

      {/* Page Header */}
      <div className="mb-4 sm:mb-6 flex items-center gap-3">
        <div className="w-1 h-9 sm:h-10 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600 flex-shrink-0" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Power Rankings</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            One shared strength scale across every league — derived from Pinnacle Asian Handicap
            closing lines, bridged across leagues via Champions League &amp; Europa League fixtures.
          </p>
        </div>
      </div>

      <div
        className="rounded-xl sm:rounded-2xl border border-slate-700/50 overflow-hidden card-shadow mb-4 sm:mb-6"
        style={{ background: 'linear-gradient(180deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)' }}
      >
        <div className="px-4 sm:px-5 py-3 border-b border-slate-700/50 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-slate-500">
            Sorted by rating · highest first
          </p>
          <p className="text-[10px] sm:text-xs font-mono text-slate-500">
            {computedAt ? `Updated ${format(new Date(computedAt), 'MMM d, yyyy')}` : ''}
          </p>
        </div>

        {loading && (
          <div className="p-8 text-center text-slate-500 text-sm">Loading rankings…</div>
        )}
        {error && (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/40 text-left">
                  <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">#</th>
                  <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">League</th>
                  <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">Team</th>
                  <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 text-right">Rating</th>
                  <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 text-right hidden sm:table-cell">Matches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {ratings.map((r, i) => {
                  const isSelected = selected.includes(r.team);
                  const leagueInfo = LEAGUE_CONFIG[r.league];
                  return (
                    <tr
                      key={r.team}
                      onClick={() => toggleTeam(r.team)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'}`}
                    >
                      <td className="px-3 sm:px-4 py-2 text-slate-500 font-mono text-xs">{i + 1}</td>
                      <td className="px-3 sm:px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <LeagueLogo sportKey={r.league} size="sm" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 hidden sm:inline">
                            {leagueInfo?.shortName || r.league}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-2">
                        <span className={`font-medium ${isSelected ? 'text-cyan-300' : 'text-white'}`}>{r.team}</span>
                      </td>
                      <td className="px-3 sm:px-4 py-2 text-right font-mono font-bold text-white tabular-nums">
                        {r.rating >= 0 ? '+' : ''}{r.rating.toFixed(3)}
                      </td>
                      <td className="px-3 sm:px-4 py-2 text-right font-mono text-slate-500 tabular-nums hidden sm:table-cell">
                        {r.weighted_matches.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ratings History */}
      <div
        className="rounded-xl sm:rounded-2xl border border-slate-700/50 p-4 sm:p-5 card-shadow"
        style={{ background: 'linear-gradient(180deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs sm:text-sm font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Ratings History
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-500">
            Click up to {MAX_COMPARE} teams in the table to compare
          </p>
        </div>

        {selected.length === 0 ? (
          <p className="text-slate-500 text-sm py-8 text-center">Select a team above to see its rating trend.</p>
        ) : (
          <div className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                <XAxis
                  dataKey="computed_at"
                  tickFormatter={(v) => format(new Date(v), 'MMM d')}
                  tick={AXIS_TICK}
                  stroke="#475569"
                />
                <YAxis tick={AXIS_TICK} stroke="#475569" width={48} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontFamily: MONO_STACK, fontSize: 12 }}
                  labelFormatter={(v) => format(new Date(v as string), 'MMM d, yyyy')}
                  formatter={(value?: number) => (typeof value === 'number' ? value.toFixed(3) : value)}
                />
                <Legend wrapperStyle={{ fontFamily: MONO_STACK, fontSize: 11 }} />
                {selected.map((team, i) => (
                  <Line
                    key={team}
                    type="monotone"
                    dataKey={team}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="mt-4 sm:mt-6 bg-slate-800/50 rounded-xl sm:rounded-2xl border border-slate-700/50 p-4 sm:p-5">
        <h3 className="text-xs sm:text-sm font-semibold text-slate-300 mb-2 sm:mb-3">How it works</h3>
        <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 mt-0.5">•</span>
            <span>Each rating is derived from Pinnacle's closing Asian Handicap line for every finished match — not goals, not table position — so it reflects what the market actually priced, not noisy short-term results.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 mt-0.5">•</span>
            <span>Ratings are fitted independently within each domestic league, then bridged onto one shared scale using Champions League and Europa League fixtures — the only matches where teams from different leagues actually meet.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 mt-0.5">•</span>
            <span>Tracking started February 2026, so early ratings carry a thinner sample than a mature system — shown as "Matches" in the table. They'll firm up as more matchdays are captured automatically each week.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 mt-0.5">•</span>
            <span>Each rating is also nudged toward a ClubElo prior (a separate, results-based Elo system) to steady it while our own sample is thin — that nudge fades out automatically as a team accumulates more tracked matches, so it never overrides what the market lines themselves say.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
