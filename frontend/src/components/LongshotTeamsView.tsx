import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { getFavDogTeam, getFavDogTeams } from '../api';
import type { FavDogTeamData, FavDogTeamBlock, FavDogTeamListItem } from '../types';
import PaywallOverlay from './PaywallOverlay';

const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const AXIS_TICK = { fill: '#94a3b8', fontSize: 10, fontFamily: MONO_STACK };

// Leagues wired into the per-team view. Premier League first (Neil,
// 2026-09-02), La Liga the same day. The endpoints are league-aware, so
// adding a league is one entry here once its history is in
// historical_matches.
const TEAM_LEAGUES = [
  { key: 'soccer_epl', label: 'EPL', name: 'Premier League' },
  { key: 'soccer_spain_la_liga', label: 'LAL', name: 'La Liga' },
];
const FREE_LEAGUE = 'soccer_epl';      // same free rule as the overview
const FREE_SEASON = '2526';            // default landing (fuller sample)
const FREE_SEASONS = ['2526', '2627'];  // last season + the live one, per Neil 2026-09-02
const LATEST_SEASON = '2627';
const SEASON_LABELS: Record<string, string> = {
  '2122': '21/22', '2223': '22/23', '2324': '23/24', '2425': '24/25', '2526': '25/26', '2627': '26/27',
};

type Side = 'back' | 'fade';

function roiClass(v: number | null): string {
  if (v === null) return 'text-slate-400';
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-slate-400';
}

function fmtRoi(v: number | null): string {
  if (v === null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function StatCard({ title, block, side }: { title: string; block: FavDogTeamBlock; side: Side }) {
  const roi = side === 'back' ? block.back_roi_pct : block.fade_roi_pct;
  const empty = block.matches === 0;
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/80 px-4 py-3.5">
      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">{title}</div>
      <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight leading-none mt-2 ${empty ? 'text-slate-600' : roiClass(roi)}`}>
        {empty ? '—' : <>ROI {fmtRoi(roi)}</>}
      </div>
      <div className="text-xs text-slate-400 mt-2 font-mono tabular-nums">
        {empty ? 'no matches under these filters' : (
          <>
            {block.wins}–{block.draws}–{block.losses} · {block.win_rate !== null ? `${block.win_rate.toFixed(0)}% win` : '—'}
          </>
        )}
      </div>
      {!empty && (
        <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">median odds {block.median_odds.toFixed(2)}</div>
      )}
    </div>
  );
}

export default function LongshotTeamsView({
  isSubscribed,
  initialTeam,
  initialLeague,
  onTeamChange,
  onLeagueChange,
}: {
  isSubscribed: boolean;
  initialTeam: string | null;
  initialLeague: string | null;
  onTeamChange: (team: string | null) => void;
  onLeagueChange: (league: string) => void;
}) {
  const [league, setLeagueState] = useState<string>(
    TEAM_LEAGUES.some((l) => l.key === initialLeague) ? (initialLeague as string) : FREE_LEAGUE,
  );
  const leagueName = TEAM_LEAGUES.find((l) => l.key === league)?.name ?? '';
  const [teams, setTeams] = useState<FavDogTeamListItem[]>([]);
  const [query, setQuery] = useState(initialTeam ?? '');
  const [team, setTeam] = useState<string | null>(initialTeam);
  const [season, setSeason] = useState<string | null>(FREE_SEASON);
  const [venue, setVenue] = useState<'home' | 'away' | null>(null);
  const [side, setSide] = useState<Side>('back');
  const [data, setData] = useState<FavDogTeamData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getFavDogTeams(league).then((r) => setTeams(r.teams)).catch(() => setTeams([]));
  }, [league]);

  const locked = !isSubscribed && !(league === FREE_LEAGUE && season !== null && FREE_SEASONS.includes(season));

  useEffect(() => {
    if (!team || locked) return;
    setLoading(true);
    setError('');
    getFavDogTeam({ team, league, seasons: season ?? undefined, venue: venue ?? undefined })
      .then(setData)
      .catch(() => setError('Failed to load team data'))
      .finally(() => setLoading(false));
  }, [team, league, season, venue, locked]);

  const pickLeague = (key: string) => {
    if (key === league) return;
    setLeagueState(key);
    setTeam(null);
    setQuery('');
    setData(null);
    onTeamChange(null);
    onLeagueChange(key);
  };

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (team && q === team.toLowerCase())) return [];
    return teams.filter((t) => t.team.toLowerCase().includes(q)).slice(0, 8);
  }, [query, teams, team]);

  const pickTeam = (name: string) => {
    setTeam(name);
    setQuery(name);
    onTeamChange(name);
  };

  // Chart: split the cumulative line into win (green) and loss/draw (red)
  // segments. Each step i-1 -> i is assigned to one series; points that
  // end one segment and start the next carry both values so the line
  // stays continuous. Recharts draws nulls as gaps, which is the trick.
  const chart = useMemo(() => {
    if (!data) return { points: [] as Array<Record<string, number | string | null>>, seasonTicks: [] as number[] };
    const key = side === 'back' ? 'back_cum' : 'fade_cum';
    const pts: Array<Record<string, number | string | null>> = [
      { n: 0, win: 0, loss: 0, label: '', season: data.series[0]?.season ?? '' },
    ];
    for (let i = 0; i < data.series.length; i++) {
      const p = data.series[i];
      const stepWon = side === 'back' ? p.result === 'W' : p.result !== 'W';
      const prev = pts[pts.length - 1];
      const val = p[key] as number;
      const cur: Record<string, number | string | null> = {
        n: i + 1,
        win: null,
        loss: null,
        label: `${p.venue === 'home' ? 'v' : '@'} ${p.opponent} ${p.result} (${p.odds.toFixed(2)})`,
        season: p.season,
      };
      const prevVal = (prev.win ?? prev.loss) as number;
      if (stepWon) { prev.win = prevVal; cur.win = val; } else { prev.loss = prevVal; cur.loss = val; }
      pts.push(cur);
    }
    const seasonTicks: number[] = [];
    let last = '';
    for (const p of pts) {
      if (p.season !== last) { seasonTicks.push(p.n as number); last = p.season as string; }
    }
    return { points: pts, seasonTicks };
  }, [data, side]);

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-md font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors border ${
      active
        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
        : 'bg-slate-900/60 text-slate-400 border-slate-700/60 hover:text-white hover:bg-slate-800/60'
    }`;
  const lock = (isFree: boolean) => (!isSubscribed && !isFree ? ' 🔒' : '');

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (team && e.target.value !== team) { setTeam(null); onTeamChange(null); } }}
          placeholder={`Search ${leagueName} team…`}
          className="w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 shadow-xl overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.team}
                onClick={() => pickTeam(s.team)}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700/60 flex justify-between"
              >
                <span>{s.team}</span>
                <span className="text-slate-500 font-mono text-xs">{s.matches} matches</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-4">
        {leagueName} clubs with Pinnacle closing prices on record, 2021/22 onward, updated every Monday.
      </p>

      {/* Filters */}
      <div className="mb-4 sm:mb-6 rounded-xl border border-slate-700/60 bg-slate-800/80 p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold w-14">League</span>
          {TEAM_LEAGUES.map((l) => (
            <button key={l.key} className={chipClass(league === l.key)} onClick={() => pickLeague(l.key)}>
              {l.label}{lock(l.key === FREE_LEAGUE)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold w-14">Season</span>
          <button className={chipClass(season === null)} onClick={() => setSeason(null)}>All time{lock(false)}</button>
          {Object.entries(SEASON_LABELS).filter(([c]) => c <= LATEST_SEASON).map(([code, label]) => (
            <button key={code} className={chipClass(season === code)} onClick={() => setSeason(code)}>
              {label}{lock(league === FREE_LEAGUE && FREE_SEASONS.includes(code))}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold w-14">Venue</span>
          <button className={chipClass(venue === null)} onClick={() => setVenue(null)}>All</button>
          <button className={chipClass(venue === 'home')} onClick={() => setVenue('home')}>Home</button>
          <button className={chipClass(venue === 'away')} onClick={() => setVenue('away')}>Away</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold w-14">Side</span>
          <div className="inline-flex rounded-md border border-slate-700/60 overflow-hidden">
            <button
              onClick={() => setSide('back')}
              className={`px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${side === 'back' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-900/60 text-slate-400 hover:text-white'}`}
            >
              Backing them
            </button>
            <button
              onClick={() => setSide('fade')}
              className={`px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${side === 'fade' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-900/60 text-slate-400 hover:text-white'}`}
            >
              Fading them
            </button>
          </div>
          <span className="text-[10px] text-slate-500">
            {side === 'back' ? 'Back to win at the Pinnacle close, 1u flat.' : 'Fade = Double Chance against them at the combined Pinnacle close, 1u flat.'}
          </span>
        </div>
      </div>

      {locked && (
        <div className="mb-6">
          <PaywallOverlay
            title="Unlock every league and season"
            description="Premier League 25/26 and 26/27 are free per team — SteamWatch Pro opens La Liga, every season back to 2021/22 and the all-time view, for every club."
          />
        </div>
      )}

      {!locked && !team && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-8 text-center text-slate-500 text-sm">
          Pick a team to see how backing or fading them has paid, split by whether they were the favourite or the underdog.
        </div>
      )}

      {!locked && team && loading && (
        <div className="p-8 text-center text-slate-500 text-sm">Loading {team}…</div>
      )}
      {!locked && error && <div className="p-8 text-center text-red-400 text-sm">{error}</div>}

      {!locked && team && !loading && !error && data && (
        <>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-3">{data.team}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 sm:mb-6">
            <StatCard title="All matches" block={data.all} side={side} />
            <StatCard title="When favourite" block={data.as_favourite} side={side} />
            <StatCard title="When underdog" block={data.as_underdog} side={side} />
          </div>

          <div
            className="rounded-xl sm:rounded-2xl border border-slate-700/50 p-4 sm:p-5 card-shadow"
            style={{ background: 'linear-gradient(180deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)' }}
          >
            <div className="mb-3">
              <div className="text-sm font-bold text-white">All matches</div>
              <div className="text-xs text-slate-500">
                If you had {side === 'back' ? 'backed' : 'faded'} them in every match · green = winning bet, red = losing bet
              </div>
            </div>
            <div className="h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart.points} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis
                    dataKey="n"
                    type="number"
                    domain={[0, 'dataMax']}
                    ticks={chart.seasonTicks}
                    tickFormatter={(n: number) => {
                      const p = chart.points.find((q) => q.n === n);
                      return p ? (SEASON_LABELS[p.season as string] ?? '') : '';
                    }}
                    tick={AXIS_TICK}
                    stroke="#475569"
                  />
                  <YAxis tick={AXIS_TICK} stroke="#475569" width={54} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}u`} />
                  <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontFamily: MONO_STACK, fontSize: 12 }}
                    labelFormatter={(n) => {
                      const p = chart.points.find((q) => q.n === n);
                      return p && p.label ? String(p.label) : `Start`;
                    }}
                    formatter={(value?: number, name?: string) => (typeof value === 'number' ? [`${value.toFixed(2)}u`, name === 'win' ? 'after a winning bet' : 'after a losing bet'] : [value, name])}
                  />
                  <Line type="linear" dataKey="win" stroke="#34d399" strokeWidth={2} dot={{ r: 2, fill: '#34d399', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                  <Line type="linear" dataKey="loss" stroke="#f87171" strokeWidth={2} dot={{ r: 2, fill: '#f87171', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[11px] text-slate-500 mt-3 font-mono">
              {data.all.matches} matches{data.data_through ? ` · through ${data.data_through}` : ''} · favourite = shorter Pinnacle closing price
            </div>
          </div>
        </>
      )}
    </div>
  );
}
