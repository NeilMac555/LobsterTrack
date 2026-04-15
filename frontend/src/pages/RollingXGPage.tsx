import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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

const XG_LEAGUES = Object.entries(LEAGUE_CONFIG).filter(
  ([key]) => key !== 'soccer_uefa_champs_league' && key !== 'soccer_uefa_europa_league'
);

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
  rollingFor: number | null;
  rollingAgainst: number | null;
  trendFor: number | null;
  trendAgainst: number | null;
}

function computeChartData(raw: XGDataPoint[], windowSize: RollingWindow): ChartDataPoint[] {
  if (raw.length < windowSize) return [];

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
    points.push({
      matchNumber: raw[i].match_number,
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
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 shadow-xl">
      <p className="text-slate-300 text-xs mb-2 font-medium">Game {label}</p>
      {payload.map((entry: { name: string; value: number; color: string }, i: number) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toFixed(2)}
        </p>
      ))}
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

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const last = chartData[chartData.length - 1];
    return {
      avgFor: last.rollingFor ?? 0,
      avgAgainst: last.rollingAgainst ?? 0,
      diff: (last.rollingFor ?? 0) - (last.rollingAgainst ?? 0),
      gamesPlayed: rawData.length,
    };
  }, [chartData, rawData]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <Helmet>
        <title>Rolling xG — SteamWatch</title>
        <meta name="description" content="Track rolling expected goals (xG) trends for every team across Europe's top football leagues. Identify form changes and performance shifts." />
        <link rel="canonical" href="https://www.steamwatch.io/tools/rolling-xg" />
      </Helmet>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Rolling xG</h1>
        <p className="text-slate-400 text-sm mt-1">
          Expected goals trends by team
        </p>
      </div>

      {/* Filters */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* League */}
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5 font-medium">
                  League
                </label>
                <select
                  value={league}
                  onChange={(e) => handleLeagueChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                >
                  {XG_LEAGUES.map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.name}</option>
                  ))}
                </select>
              </div>

              {/* Team */}
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5 font-medium">
                  Team
                </label>
                <select
                  value={team}
                  onChange={(e) => handleTeamChange(e.target.value)}
                  disabled={teamsLoading || teams.length === 0}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50"
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

              {/* Rolling Window */}
              <div>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5 font-medium">
                  Rolling Window
                </label>
                <div className="flex gap-1">
                  {([5, 10] as RollingWindow[]).map((w) => (
                    <button
                      key={w}
                      onClick={() => setWindowSize(w)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                        windowSize === w
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {w}
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

          {/* Stat Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Avg xG For" value={stats.avgFor.toFixed(2)} color="text-cyan-400" />
              <StatCard label="Avg xGA" value={stats.avgAgainst.toFixed(2)} color="text-red-400" />
              <StatCard
                label="xG Difference"
                value={`${stats.diff > 0 ? '+' : ''}${stats.diff.toFixed(2)}`}
                color={stats.diff > 0 ? 'text-emerald-400' : stats.diff < 0 ? 'text-red-400' : 'text-slate-400'}
              />
              <StatCard label="Games Played" value={String(stats.gamesPlayed)} color="text-white" />
            </div>
          )}

          {/* Chart */}
          {loading ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
              <p className="text-slate-400">Loading xG data...</p>
            </div>
          ) : error ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
              <p className="text-red-400">{error}</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
              <p className="text-slate-400">
                {rawData.length > 0
                  ? `Need at least ${windowSize} matches for rolling average (${rawData.length} available)`
                  : 'No xG data available for this team'}
              </p>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h2 className="text-base font-bold text-white">
                  Rolling {windowSize}-Game xG
                </h2>
                <span className="text-slate-400 text-sm">—</span>
                <span className="text-cyan-400 text-sm font-bold">{team}</span>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-5 gap-y-1 mb-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-0.5 bg-cyan-400 inline-block" />
                  <span className="text-slate-300">xG For</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-0.5 border-t-2 border-dashed border-cyan-400/60 inline-block" />
                  <span className="text-slate-300">Trend</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-0.5 bg-red-400 inline-block" />
                  <span className="text-slate-300">xGA</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-0.5 border-t-2 border-dashed border-red-400/60 inline-block" />
                  <span className="text-slate-300">Trend</span>
                </span>
              </div>

              <div className="relative">
                <div className="absolute top-2 right-3 pointer-events-none select-none text-slate-500/40 text-[11px] font-semibold tracking-wide z-10">
                  steamwatch.io
                </div>
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="matchNumber"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    label={{ value: 'Games Played', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    label={{ value: 'Rolling Avg xG', angle: -90, position: 'insideLeft', offset: 15, fill: '#64748b', fontSize: 12 }}
                    domain={[0, 'auto']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={() => null} />
                  <Line
                    type="monotone"
                    dataKey="rollingFor"
                    name="xG For"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#22d3ee' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trendFor"
                    name="xG For Trend"
                    stroke="#22d3ee"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    strokeOpacity={0.5}
                    dot={false}
                    activeDot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="rollingAgainst"
                    name="xGA"
                    stroke="#f87171"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#f87171', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#f87171' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trendAgainst"
                    name="xGA Trend"
                    stroke="#f87171"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    strokeOpacity={0.5}
                    dot={false}
                    activeDot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              </div>
            </div>
          )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
    </div>
  );
}
