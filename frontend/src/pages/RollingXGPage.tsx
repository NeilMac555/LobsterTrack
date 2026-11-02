import EuropeanRollingXG from '../components/EuropeanRollingXG';
import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { getXGTeams, getXGData } from '../api';
import type { XGDataPoint, XGDataResponse } from '../types';
import { computeChartData } from '../utils/rollingXg';
import { LEAGUE_CONFIG } from '../types';
import { useAuth } from '../contexts/AuthContext';
import PaywallOverlay from '../components/PaywallOverlay';

type RollingWindow = 5 | 10;

const FREE_TEAMS: Record<string, string> = {
  soccer_epl: 'Arsenal',
  soccer_spain_la_liga: 'FC Barcelona',
  soccer_germany_bundesliga: 'FC Bayern München',
  soccer_italy_serie_a: 'Juventus',
  soccer_france_ligue_one: 'Paris Saint Germain',
};

const XG_LEAGUES = Object.entries(LEAGUE_CONFIG).filter(([key, cfg]) => !cfg.hidden && key in FREE_TEAMS);
const EMPTY_DATA: XGDataPoint[] = [];

// Terminal typography matching the rest of the charts on the site
const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const AXIS_TICK = {
  fill: '#94a3b8',
  fontSize: 10,
  fontFamily: MONO_STACK,
  letterSpacing: '-0.02em',
};
const COLOR_FOR = '#22d3ee';   // cyan-400
const COLOR_AGAINST = '#f87171'; // red-400

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // De-dupe: Area+Line overlays emit duplicate entries per series
  const seen = new Set<string>();
  const entries = (payload as any[]).filter((e) => {
    const k = e?.dataKey as string;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <div
      className="bg-slate-900/95 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-2xl overflow-hidden"
      style={{
        animation: 'fadeIn 0.15s ease-out',
        boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
      }}
    >
      <div className="px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/50">
        <p className="text-slate-300 text-[10px] font-mono uppercase tracking-[0.12em] font-semibold">
          {String(label).startsWith('L') ? `Game ${String(label).slice(1)} · last season` : `Game ${label}`}
        </p>
      </div>
      <div className="p-2 space-y-1 min-w-[160px]">
        {entries.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4 px-1">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}` }}
              />
              <span className="text-slate-300 text-xs font-medium">{entry.name}</span>
            </div>
            <span
              className="font-mono font-bold text-sm tabular-nums tracking-tight"
              style={{ color: entry.color }}
            >
              {entry.value?.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DomesticRollingXGPage() {
  const { isSubscribed } = useAuth();
  const [league, setLeague] = useState('soccer_epl');
  const [team, setTeam] = useState('');
  const [windowSize, setWindowSize] = useState<RollingWindow>(10);
  const [teams, setTeams] = useState<string[]>([]);
  const [response, setResponse] = useState<XGDataResponse | null>(null);
  const current = response?.league === league && response.team_name === team ? response : null;
  const rawData = current?.data ?? EMPTY_DATA;
  const [loading, setLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  // Gate team changes for free users (one free team per league)
  const handleLeagueChange = (newLeague: string) => {
    setShowPaywall(false);
    setLeague(newLeague);
  };

  const handleTeamChange = (newTeam: string) => {
    const freeTeam = FREE_TEAMS[league];
    if (!isSubscribed && newTeam !== freeTeam) {
      setShowPaywall(true);
      return;
    }
    setShowPaywall(false);
    setTeam(newTeam);
  };

  useEffect(() => {
    let active = true;
    setTeamsLoading(true);
    setTeam('');
    setResponse(null);
    setError(null);
    getXGTeams(league)
      .then((res) => {
        if (!active) return;
        setTeams(res.teams);
        const preview = FREE_TEAMS[league];
        setTeam(isSubscribed ? (res.teams[0] ?? '') : (res.teams.includes(preview) ? preview : ''));
      })
      .catch(() => { if (active) { setTeams([]); setError('Could not load Sportmonks teams'); } })
      .finally(() => { if (active) setTeamsLoading(false); });
    return () => { active = false; };
  }, [league, isSubscribed]);

  useEffect(() => {
    if (!team) return;
    let active = true;
    setLoading(true);
    setError(null);
    getXGData(league, team)
      .then((result) => { if (active) setResponse(result); })
      .catch(() => { if (active) setError('Failed to load xG data'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [league, team]);

  const chartData = useMemo(() => computeChartData(rawData, windowSize, current?.season ?? ''), [rawData, windowSize, current?.season]);

  // Where the current season starts within the (possibly two-season)
  // series — null when the chart is single-season. Drives the dashed
  // boundary marker.
  const seasonBoundaryLabel = useMemo(() => {
    if (!chartData.length) return null;
    const cur = current?.season;
    if (chartData[0].season === cur) return null;
    return chartData.find((p) => p.season === cur)?.label ?? null;
  }, [chartData, current?.season]);

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const last = chartData[chartData.length - 1];
    // The avg cards describe the LATEST rolling window (which may span
    // the season boundary — e.g. 1 game this season + 9 carried from
    // last). GAMES counts THIS SEASON only; the full plotted series
    // includes last season's carryover and would read misleadingly
    // large (Neil flagged "39 games" on matchday 1, 2026-08-23).
    const currentSeason = current?.season;
    const gamesThisSeason = rawData.filter((p) => p.season === currentSeason).length;
    return {
      avgFor: last.rollingFor,
      avgAgainst: last.rollingAgainst,
      diff: last.rollingFor === null || last.rollingAgainst === null ? null : last.rollingFor - last.rollingAgainst,
      gamesPlayed: gamesThisSeason,
    };
  }, [chartData, rawData, current?.season]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4 sm:space-y-6">
      <Helmet>
        <title>Rolling xG Tables: Football Team Form by Expected Goals | SteamWatch</title>
        <meta name="description" content="Track rolling expected goals (xG) trends for every team across Europe's top football leagues. Identify form changes and performance shifts." />
        <link rel="canonical" href="https://www.steamwatch.io/tools/rolling-xg" />
      </Helmet>

      {/* Header — accent bar + mono subtitle */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-10 sm:h-11 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600 flex-shrink-0" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Rolling xG</h1>
          <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
            Sportmonks &middot; Total expected goals · penalties included
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Which clubs are scoring above or below their chances? See <Link to="/goals-coming-soon" className="text-cyan-400 hover:underline">Goals Coming Soon</Link>.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* League */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-[0.12em] mb-1.5 font-semibold">
              League
            </label>
            <select
              value={league}
              onChange={(e) => handleLeagueChange(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-700/60 rounded-md px-3 py-2 text-white font-mono text-[12px] font-semibold focus:outline-none focus:border-cyan-500"
            >
              {XG_LEAGUES.map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.name}</option>
              ))}
            </select>
          </div>

          {/* Team */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-[0.12em] mb-1.5 font-semibold">
              Team
            </label>
            <select
              value={team}
              onChange={(e) => handleTeamChange(e.target.value)}
              disabled={teamsLoading || teams.length === 0}
              className="w-full bg-slate-900/60 border border-slate-700/60 rounded-md px-3 py-2 text-white font-mono text-[12px] font-semibold focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            >
              {teamsLoading ? (
                <option>Loading...</option>
              ) : teams.length === 0 ? (
                <option>No data available</option>
              ) : (
                teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))
              )}
            </select>
          </div>

          {/* Rolling Window — segmented control */}
          <div>
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-[0.12em] mb-1.5 font-semibold">
              Window
            </label>
            <div className="inline-flex bg-slate-900/60 border border-slate-700/60 rounded-md overflow-hidden">
              {([5, 10] as RollingWindow[]).map((w, i) => (
                <button
                  key={w}
                  onClick={() => setWindowSize(w)}
                  className={`px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                    i > 0 ? 'border-l border-slate-700/60' : ''
                  } ${
                    windowSize === w
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {w}-Game
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Paywall prompt */}
      {showPaywall && (
        <PaywallOverlay
          title="Unlock All Teams"
          description="Free preview includes one team per league. Upgrade to SteamWatch Pro for rolling xG on every team across all five leagues."
        />
      )}

      {current?.updated_at && (
        <p className="text-xs text-slate-400">
          Sportmonks · Last refreshed {new Date(current.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC · Updates daily at 06:45 UTC.
          {Date.now() - Date.parse(current.updated_at) > 36 * 3600_000 && ' The last successful refresh is over 36 hours old.'}
          {rawData.some(p => p.xg_for === null || p.xg_against === null) && ' A match is missing xG. Windows containing it are blank.'}
        </p>
      )}

      {/* Stat Cards — terminal style */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <StatCard label="Avg xG For" value={stats.avgFor?.toFixed(2) ?? '—'} color="text-cyan-400" borderColor="border-cyan-500/30" />
          <StatCard label="Avg xG Against" value={stats.avgAgainst?.toFixed(2) ?? '—'} color="text-red-400" borderColor="border-red-500/30" />
          <StatCard
            label="xG Diff"
            value={stats.diff === null ? '—' : `${stats.diff > 0 ? '+' : ''}${stats.diff.toFixed(2)}`}
            color={stats.diff !== null && stats.diff > 0 ? 'text-emerald-400' : stats.diff !== null && stats.diff < 0 ? 'text-red-400' : 'text-slate-400'}
            borderColor={stats.diff !== null && stats.diff > 0 ? 'border-emerald-500/30' : stats.diff !== null && stats.diff < 0 ? 'border-red-500/30' : 'border-slate-700/60'}
          />
          <StatCard label="Games This Season" value={String(stats.gamesPlayed)} color="text-white" borderColor="border-slate-700/60" />
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 p-8 text-center">
          <p className="text-slate-400">Loading xG data...</p>
        </div>
      ) : error ? (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 p-8 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : chartData.length === 0 ? (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 p-8 text-center">
          <p className="text-slate-400">
            {rawData.length > 0
              ? `Need at least ${windowSize} matches for rolling average (${rawData.length} available)`
              : 'No xG data available for this team'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-1 h-6 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600 flex-shrink-0" />
            <div>
              <h2 className="text-white font-bold text-base tracking-tight">
                Rolling {windowSize}-Game xG
              </h2>
              <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
                {team}
              </p>
            </div>
          </div>

          {/* Legend — mono style */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-3 text-[11px] font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-cyan-400 inline-block" />
              <span className="text-slate-300">xG For</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 border-t-2 border-dashed border-cyan-400/60 inline-block" />
              <span className="text-slate-400">Trend</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-red-400 inline-block" />
              <span className="text-slate-300">xGA</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 border-t-2 border-dashed border-red-400/60 inline-block" />
              <span className="text-slate-400">Trend</span>
            </span>
          </div>

          <div className="relative">
            {/* Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
              <span className="text-white/10 text-5xl sm:text-7xl font-black tracking-widest -rotate-12 whitespace-nowrap">
                steamwatch.io
              </span>
            </div>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="xgArea-for" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_FOR} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={COLOR_FOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="xgArea-against" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_AGAINST} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={COLOR_AGAINST} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="2 6" stroke="#475569" strokeOpacity={0.4} vertical={false} />
                {seasonBoundaryLabel && (
                  <ReferenceLine
                    x={seasonBoundaryLabel}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    label={{ value: 'new season', position: 'insideTopLeft', fill: '#94a3b8', fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
                  />
                )}
                <XAxis
                  dataKey="label"
                  stroke="#475569"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: '#334155', strokeWidth: 1 }}
                />
                <YAxis
                  stroke="#475569"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'auto']}
                  width={42}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.5 }}
                />
                <Legend content={() => null} />

                {/* Area fills under the primary series */}
                <Area
                  type="monotone"
                  dataKey="rollingFor"
                  stroke="none"
                  fill="url(#xgArea-for)"
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Area
                  type="monotone"
                  dataKey="rollingAgainst"
                  stroke="none"
                  fill="url(#xgArea-against)"
                  isAnimationActive={false}
                  activeDot={false}
                />

                {/* Trend lines (dashed, drawn underneath primary) */}
                <Line
                  type="monotone"
                  dataKey="trendFor"
                  name="xG For Trend"
                  stroke={COLOR_FOR}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  strokeOpacity={0.5}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="trendAgainst"
                  name="xGA Trend"
                  stroke={COLOR_AGAINST}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  strokeOpacity={0.5}
                  dot={false}
                  activeDot={false}
                />

                {/* Primary rolling lines — bold, no mid-point dots, glowing hover */}
                <Line
                  type="monotone"
                  dataKey="rollingFor"
                  name="xG For"
                  stroke={COLOR_FOR}
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 5, fill: COLOR_FOR, stroke: '#0f172a', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="rollingAgainst"
                  name="xGA"
                  stroke={COLOR_AGAINST}
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 5, fill: COLOR_AGAINST, stroke: '#0f172a', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, borderColor }: { label: string; value: string; color: string; borderColor: string }) {
  return (
    <div className={`bg-slate-800/80 rounded-xl border ${borderColor} px-3 sm:px-4 py-2.5 sm:py-3`}>
      <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">{label}</div>
      <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight leading-none mt-1.5 ${color}`}>
        {value}
      </div>
    </div>
  );
}


export default function RollingXGPage() {
  const [competition, setCompetition] = useState('domestic');
  return <div>
    <nav aria-label="xG competition" className="max-w-5xl mx-auto px-4 pt-5 flex flex-wrap gap-2">
      {[['domestic', 'Domestic | Sportmonks'], ['soccer_uefa_champs_league', 'Champions League'], ['soccer_uefa_europa_league', 'Europa League'], ['soccer_uefa_europa_conference_league', 'Conference League']].map(([key, name]) =>
        <button key={key} onClick={() => setCompetition(key)} className={`px-4 py-2 rounded-lg text-sm ${competition === key ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>{name}</button>)}
    </nav>
    {competition === 'domestic' ? <DomesticRollingXGPage/> : <EuropeanRollingXG league={competition}/>}
  </div>;
}
