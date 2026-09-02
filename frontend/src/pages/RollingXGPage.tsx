import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
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
import type { XGDataPoint } from '../types';
import { LEAGUE_CONFIG } from '../types';
import { useAuth } from '../contexts/AuthContext';
import PaywallOverlay from '../components/PaywallOverlay';

type RollingWindow = 5 | 10;

const FREE_TEAMS: Record<string, string> = {
  soccer_epl: 'Arsenal',
  soccer_spain_la_liga: 'Barcelona',
  soccer_germany_bundesliga: 'Bayern Munich',
  soccer_italy_serie_a: 'Juventus',
  soccer_france_ligue_one: 'Paris Saint Germain',
};

// xG is club-only (Understat doesn't cover UEFA comps or internationals),
// so we drop those keys on top of the global `hidden` flag.
const XG_LEAGUES = Object.entries(LEAGUE_CONFIG).filter(
  ([key, cfg]) =>
    !cfg.hidden &&
    key !== 'soccer_uefa_champs_league' &&
    key !== 'soccer_uefa_europa_league' &&
    key !== 'soccer_uefa_europa_conference_league' &&
    key !== 'soccer_fifa_world_cup'
);

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

// Simple linear regression: returns [slope, intercept]
function linearRegression(ys: number[]): [number, number] {
  const n = ys.length;
  if (n < 2) return [0, ys[0] ?? 0];
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += ys[i];
    sumXY += i * ys[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return [slope, intercept];
}

interface ChartDataPoint {
  matchNumber: number;
  /** Category x-axis key — unique across the season boundary: last-season
   *  games render as "L34", current-season games as plain "5". */
  label: string;
  season: string;
  rollingFor: number | null;
  rollingAgainst: number | null;
  trendFor: number | null;
  trendAgainst: number | null;
}

function computeChartData(raw: XGDataPoint[], windowSize: RollingWindow): ChartDataPoint[] {
  if (raw.length < windowSize) return [];

  // The series may span two seasons (the API prepends last season's
  // final 10 matches so windows stay full from matchday 1). The
  // CURRENT season is whatever the final point belongs to.
  const currentSeason = raw[raw.length - 1].season;

  const rollingFor: number[] = [];
  const rollingAgainst: number[] = [];
  const points: ChartDataPoint[] = [];

  for (let i = windowSize - 1; i < raw.length; i++) {
    let sumFor = 0, sumAgainst = 0;
    for (let j = i - windowSize + 1; j <= i; j++) {
      sumFor += raw[j].npxg_for;
      sumAgainst += raw[j].npxg_against;
    }
    rollingFor.push(sumFor / windowSize);
    rollingAgainst.push(sumAgainst / windowSize);
    const isPrevSeason = raw[i].season !== currentSeason;
    points.push({
      matchNumber: raw[i].match_number,
      label: isPrevSeason ? `L${raw[i].match_number}` : String(raw[i].match_number),
      season: raw[i].season,
      rollingFor: Math.round((sumFor / windowSize) * 100) / 100,
      rollingAgainst: Math.round((sumAgainst / windowSize) * 100) / 100,
      trendFor: null,
      trendAgainst: null,
    });
  }

  // Compute trend lines via linear regression
  const [slopeF, intF] = linearRegression(rollingFor);
  const [slopeA, intA] = linearRegression(rollingAgainst);
  for (let i = 0; i < points.length; i++) {
    points[i].trendFor = Math.round((intF + slopeF * i) * 100) / 100;
    points[i].trendAgainst = Math.round((intA + slopeA * i) * 100) / 100;
  }

  return points;
}

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

export default function RollingXGPage() {
  const { isSubscribed } = useAuth();
  const [league, setLeague] = useState('soccer_epl');
  const [team, setTeam] = useState('');
  const [windowSize, setWindowSize] = useState<RollingWindow>(10);
  const [teams, setTeams] = useState<string[]>([]);
  const [rawData, setRawData] = useState<XGDataPoint[]>([]);
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

  // Fetch teams when league changes
  useEffect(() => {
    setTeamsLoading(true);
    setTeam('');
    setRawData([]);
    getXGTeams(league)
      .then((res) => {
        setTeams(res.teams);
        if (res.teams.length > 0) {
          const freeTeam = FREE_TEAMS[league];
          if (!isSubscribed && freeTeam && res.teams.includes(freeTeam)) {
            setTeam(freeTeam);
          } else {
            setTeam(res.teams[0]);
          }
        }
      })
      .catch(() => setTeams([]))
      .finally(() => setTeamsLoading(false));
  }, [league, isSubscribed]);

  // Fetch xG data when team changes
  useEffect(() => {
    if (!team) return;
    setLoading(true);
    setError(null);
    getXGData(league, team)
      .then((res) => setRawData(res.data))
      .catch(() => setError('Failed to load xG data'))
      .finally(() => setLoading(false));
  }, [league, team]);

  const chartData = useMemo(() => computeChartData(rawData, windowSize), [rawData, windowSize]);

  // Where the current season starts within the (possibly two-season)
  // series — null when the chart is single-season. Drives the dashed
  // boundary marker.
  const seasonBoundaryLabel = useMemo(() => {
    if (!chartData.length) return null;
    const cur = chartData[chartData.length - 1].season;
    if (chartData[0].season === cur) return null;
    return chartData.find((p) => p.season === cur)?.label ?? null;
  }, [chartData]);

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const last = chartData[chartData.length - 1];
    // The avg cards describe the LATEST rolling window (which may span
    // the season boundary — e.g. 1 game this season + 9 carried from
    // last). GAMES counts THIS SEASON only; the full plotted series
    // includes last season's carryover and would read misleadingly
    // large (Neil flagged "39 games" on matchday 1, 2026-08-23).
    const currentSeason = rawData.length ? rawData[rawData.length - 1].season : null;
    const gamesThisSeason = rawData.filter((p) => p.season === currentSeason).length;
    return {
      avgFor: last.rollingFor ?? 0,
      avgAgainst: last.rollingAgainst ?? 0,
      diff: (last.rollingFor ?? 0) - (last.rollingAgainst ?? 0),
      gamesPlayed: gamesThisSeason,
    };
  }, [chartData, rawData]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4 sm:space-y-6">
      <Helmet>
        <title>Rolling xG Tables: Football Team Form by Expected Goals — SteamWatch</title>
        <meta name="description" content="Track rolling expected goals (xG) trends for every team across Europe's top football leagues. Identify form changes and performance shifts." />
        <link rel="canonical" href="https://www.steamwatch.io/tools/rolling-xg" />
      </Helmet>

      {/* Header — accent bar + mono subtitle */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-10 sm:h-11 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600 flex-shrink-0" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Rolling xG</h1>
          <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
            Non-penalty Expected Goals &middot; Team Form Tracker
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

      {/* Stat Cards — terminal style */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <StatCard label="Avg xG For" value={stats.avgFor.toFixed(2)} color="text-cyan-400" borderColor="border-cyan-500/30" />
          <StatCard label="Avg xGA" value={stats.avgAgainst.toFixed(2)} color="text-red-400" borderColor="border-red-500/30" />
          <StatCard
            label="xG Diff"
            value={`${stats.diff > 0 ? '+' : ''}${stats.diff.toFixed(2)}`}
            color={stats.diff > 0 ? 'text-emerald-400' : stats.diff < 0 ? 'text-red-400' : 'text-slate-400'}
            borderColor={stats.diff > 0 ? 'border-emerald-500/30' : stats.diff < 0 ? 'border-red-500/30' : 'border-slate-700/60'}
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
