import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDrifterResults } from '../api';
import type { SteamResultsData } from '../types';
import { LEAGUE_CONFIG, VISIBLE_LEAGUES } from '../types';
import LeagueLogo from '../components/LeagueLogo';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import PaywallOverlay from '../components/PaywallOverlay';

type SortField = 'profit_loss' | 'total_moves' | 'wins' | 'win_rate' | 'avg_move_size';
type SortDir = 'asc' | 'desc';
type MinMoves = 3 | 5 | 10;

function winRateColor(rate: number | null): string {
  if (rate === null) return 'text-slate-400';
  if (rate >= 60) return 'text-emerald-400';
  if (rate >= 40) return 'text-red-400';
  return 'text-red-400';
}

function plColor(pl: number | null): string {
  if (pl === null) return 'text-slate-400';
  if (pl > 0) return 'text-emerald-400';
  if (pl < 0) return 'text-red-400';
  return 'text-slate-400';
}

function formatPL(pl: number | null): string {
  if (pl === null) return '-';
  const sign = pl > 0 ? '+' : '';
  return `${sign}${pl.toFixed(2)}u`;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDir }) {
  if (!active) return <span className="text-slate-600 ml-1">&#8597;</span>;
  return (
    <span className="text-red-400 ml-1">
      {direction === 'desc' ? '\u25BC' : '\u25B2'}
    </span>
  );
}

export default function DriftersPage() {
  const { isSubscribed } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const league = searchParams.get('league');

  // A league that's since been marked `hidden` in LEAGUE_CONFIG (season
  // or tournament ended) has no fresh drift data — an old bookmark or
  // shared link would otherwise dead-end. Bounce back to unfiltered.
  useEffect(() => {
    if (league && LEAGUE_CONFIG[league]?.hidden) {
      setSearchParams({}, { replace: true });
    }
  }, [league, setSearchParams]);

  const [data, setData] = useState<SteamResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField>('profit_loss');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [minMoves, setMinMoves] = useState<MinMoves>(5);
  const [daysFilter, setDaysFilter] = useState<number | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await getDrifterResults({
          league: league || undefined,
          limit: 200,
          days: daysFilter || undefined,
        });
        setData(result);
      } catch (err) {
        setError('Failed to load drifter results. Is the backend running?');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [league, daysFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filteredRankings = useMemo(() => {
    if (!data) return [];
    return data.team_rankings
      .filter(t => t.total_moves >= minMoves)
      .sort((a, b) => {
        const aVal = a[sortField] ?? -Infinity;
        const bVal = b[sortField] ?? -Infinity;
        return sortDir === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
      });
  }, [data, minMoves, sortField, sortDir]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400">Loading drifter results...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <p className="text-slate-500 mt-2 text-sm">
          Make sure the backend is running at http://localhost:8000
        </p>
      </div>
    );
  }

  if (!data) return null;

  const leagues = VISIBLE_LEAGUES;

  const sortLabels: Record<SortField, string> = {
    profit_loss: 'P/L',
    total_moves: 'drift frequency',
    wins: 'wins',
    win_rate: 'win rate',
    avg_move_size: 'avg move size',
  };

  return (
    <div>
      <Helmet>
        <title>Biggest Drifters — SteamWatch</title>
        <meta name="description" content="Football teams whose 1X2 odds consistently drift (lengthen) in the 3 hours before kickoff. Historical performance, win rates, and P/L." />
        <meta property="og:title" content="Biggest Drifters — SteamWatch" />
        <meta property="og:description" content="Football teams whose 1X2 odds consistently drift (lengthen) in the 3 hours before kickoff. Historical performance, win rates, and P/L." />
        <meta property="og:url" content="https://www.steamwatch.io/drifters" />
        <link rel="canonical" href="https://www.steamwatch.io/drifters" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Dataset",
          "name": "SteamWatch Football Drifter Results",
          "description": "Historical performance data for teams whose 1X2 odds consistently drift pre-kickoff. Win rates and P/L tracking.",
          "url": "https://www.steamwatch.io/drifters",
          "temporalCoverage": "2025/..",
          "creator": { "@type": "Organization", "name": "SteamWatch", "url": "https://www.steamwatch.io" },
          "keywords": ["drifters", "fade", "football betting", "line movement", "odds drift"]
        })}</script>
      </Helmet>

      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          {/* Vertical red accent bar — matches the terminal rhythm */}
          <div className="w-1 h-8 sm:h-10 rounded-full bg-gradient-to-b from-red-400 to-red-600 flex-shrink-0" />
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
            {/* Up-arrow icon — odds drifting up */}
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Biggest Drifters</h1>
            <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
              Teams the market fades &middot; odds drifted pre-KO
            </p>
          </div>
        </div>
      </div>

      {/* Full-page paywall for non-Pro users — Drifters is Pro-only.
          We deliberately don't show stats / win-rate / league filter
          to free users either; they're meaningful only with the team
          rankings underneath. */}
      {!isSubscribed && (
        <div className="mb-6 sm:mb-8">
          <PaywallOverlay
            title="Unlock Biggest Drifters"
            description="See which teams the market consistently fades pre-kickoff, win rates, P/L tracking, and full team rankings with SteamWatch Pro."
          />
        </div>
      )}

      {isSubscribed && <>

      {/* Stats Banner — terminal stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Matches</div>
          <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-1.5">
            {data.total_moves}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-1">completed drifter moves</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-emerald-500/30 px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-emerald-400/80 font-semibold">Win Rate</div>
          <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-emerald-400 leading-none mt-1.5">
            {data.win_rate !== null ? `${data.win_rate}%` : '—'}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-1">hit rate vs. close</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">W / D / L</div>
          <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight leading-none mt-1.5">
            <span className="text-emerald-400">{data.total_wins}</span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-yellow-400">{data.total_draws}</span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-red-400">{data.total_losses}</span>
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-1">wins · draws · losses</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-red-400/80 font-semibold">Avg Move</div>
          <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-red-400 leading-none mt-1.5">
            {data.avg_movement_percent !== null ? `${data.avg_movement_percent}%` : '—'}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-1">drift size</div>
        </div>
      </div>

      {/* Win Rate Bar — terminal distribution readout */}
      {data.total_moves > 0 && (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 p-4 mb-4 sm:mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">
              Result Distribution
            </span>
            <span className="text-[10px] font-mono tabular-nums text-slate-400">
              <span className="text-emerald-400 font-bold">{((data.total_wins / data.total_moves) * 100).toFixed(0)}%</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-yellow-400 font-bold">{((data.total_draws / data.total_moves) * 100).toFixed(0)}%</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-red-400 font-bold">{((data.total_losses / data.total_moves) * 100).toFixed(0)}%</span>
            </span>
          </div>
          <div className="h-2.5 bg-slate-900/80 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 rounded-l-full transition-all duration-500"
              style={{ width: `${(data.total_wins / data.total_moves) * 100}%` }}
            />
            <div
              className="bg-yellow-500 transition-all duration-500"
              style={{ width: `${(data.total_draws / data.total_moves) * 100}%` }}
            />
            <div
              className="bg-red-500 rounded-r-full transition-all duration-500"
              style={{ width: `${(data.total_losses / data.total_moves) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* League Filter — mono chip row */}
      <div className="flex flex-wrap gap-1.5 mb-4 sm:mb-6">
        <button
          onClick={() => setSearchParams({})}
          className={`px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
            !league
              ? 'bg-red-500/20 text-red-300 border-red-500/40'
              : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-700/60 hover:text-white'
          }`}
        >
          All
        </button>
        {leagues.map(([key, config]) => (
          <button
            key={key}
            onClick={() => setSearchParams({ league: key })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors border ${
              league === key
                ? 'bg-red-500/20 border-red-500/40'
                : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-700/60'
            }`}
            title={config.name}
          >
            <LeagueLogo sportKey={key} size="sm" />
            <span className={`font-mono text-[11px] uppercase tracking-[0.1em] font-semibold hidden sm:inline ${
              league === key ? 'text-red-300' : 'text-slate-300'
            }`}>
              {config.shortName}
            </span>
          </button>
        ))}
      </div>

      {/* Team Rankings — only when subscribed (page-level gate above
          already short-circuits non-Pro users into the paywall). */}
      {data.team_rankings.length > 0 && (
        <div className="bg-slate-800/80 rounded-2xl border border-red-500/30 overflow-hidden card-shadow mb-6 sm:mb-8"
          style={{ boxShadow: '0 0 20px -5px rgba(245, 158, 11, 0.15)' }}
        >
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-700/50 bg-gradient-to-r from-red-500/10 to-transparent flex items-center gap-3">
            <div className="w-1 h-6 sm:h-7 rounded-full bg-gradient-to-b from-red-400 to-red-600 flex-shrink-0" />
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Most Drifted Teams</h2>
              <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
                Sorted by {sortLabels[sortField]} &middot; {sortDir === 'desc' ? 'highest first' : 'lowest first'}
              </p>
            </div>
          </div>

          {/* Filter Controls — segmented mono row */}
          <div className="px-4 sm:px-6 py-3 border-b border-slate-700/50 flex flex-wrap items-center gap-3 sm:gap-4 bg-slate-900/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Min moves</span>
              <div className="inline-flex bg-slate-900/60 border border-slate-700/60 rounded-md overflow-hidden">
                {([3, 5, 10] as MinMoves[]).map((n, i) => (
                  <button
                    key={n}
                    onClick={() => setMinMoves(n)}
                    className={`px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                      i > 0 ? 'border-l border-slate-700/60' : ''
                    } ${
                      minMoves === n
                        ? 'bg-red-500/20 text-red-300'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    {n}+
                  </button>
                ))}
              </div>
            </div>
            <div className="w-px h-5 bg-slate-700 hidden sm:block"></div>
            <button
              onClick={() => setDaysFilter(d => d === 30 ? null : 30)}
              className={`px-3 py-1 rounded-md font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors border ${
                daysFilter === 30
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-slate-900/60 text-slate-400 border-slate-700/60 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Last 30d
            </button>
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 ml-auto tabular-nums">
              {filteredRankings.length} {filteredRankings.length === 1 ? 'team' : 'teams'}
            </span>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-900/40">
                  <th className="px-4 py-2.5 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em] w-12">
                    #
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    Team
                  </th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    Lg
                  </th>
                  <th
                    className="px-3 py-2.5 text-center text-[10px] font-mono font-semibold text-red-400/80 uppercase tracking-[0.12em] cursor-pointer hover:text-red-300 select-none"
                    onClick={() => handleSort('total_moves')}
                  >
                    Moves<SortIcon active={sortField === 'total_moves'} direction={sortDir} />
                  </th>
                  <th
                    className="px-3 py-2.5 text-center text-[10px] font-mono font-semibold text-emerald-400/80 uppercase tracking-[0.12em] cursor-pointer hover:text-emerald-300 select-none"
                    onClick={() => handleSort('wins')}
                  >
                    W<SortIcon active={sortField === 'wins'} direction={sortDir} />
                  </th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-mono font-semibold text-yellow-400/80 uppercase tracking-[0.12em]">
                    D
                  </th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-mono font-semibold text-red-400/80 uppercase tracking-[0.12em]">
                    L
                  </th>
                  <th
                    className="px-3 py-2.5 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em] cursor-pointer hover:text-slate-300 select-none"
                    onClick={() => handleSort('win_rate')}
                  >
                    Win%<SortIcon active={sortField === 'win_rate'} direction={sortDir} />
                  </th>
                  <th
                    className="px-3 py-2.5 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em] cursor-pointer hover:text-slate-300 select-none"
                    onClick={() => handleSort('avg_move_size')}
                  >
                    Avg Move<SortIcon active={sortField === 'avg_move_size'} direction={sortDir} />
                  </th>
                  <th
                    className="px-3 py-2.5 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em] cursor-pointer hover:text-slate-300 select-none"
                    onClick={() => handleSort('profit_loss')}
                  >
                    P/L<SortIcon active={sortField === 'profit_loss'} direction={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredRankings.map((team, index) => {
                  const leagueInfo = LEAGUE_CONFIG[team.sport_key];
                  return (
                    <tr key={team.team_name} className="hover:bg-slate-700/20 transition-colors duration-150">
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-mono font-bold tabular-nums ${
                          index === 0 ? 'text-red-400 text-lg' :
                          index === 1 ? 'text-slate-300 text-base' :
                          index === 2 ? 'text-orange-400 text-base' :
                          'text-slate-500 text-sm'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-white font-semibold text-sm tracking-tight">{team.team_name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <LeagueLogo sportKey={team.sport_key} size="sm" />
                          <span className="text-slate-500 text-[11px] font-mono uppercase tracking-wider hidden lg:inline">
                            {leagueInfo?.shortName || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono font-bold text-red-400 text-sm tabular-nums">{team.total_moves}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono font-bold text-emerald-400 text-sm tabular-nums">{team.wins}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono font-bold text-yellow-400 text-sm tabular-nums">{team.draws}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono font-bold text-red-400 text-sm tabular-nums">{team.losses}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`font-mono font-bold text-sm tabular-nums ${winRateColor(team.win_rate)}`}>
                          {team.win_rate !== null ? `${team.win_rate}%` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono font-bold text-sm tabular-nums text-slate-300">
                          {team.avg_move_size !== null ? `${team.avg_move_size}%` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`font-mono font-bold text-base tabular-nums tracking-tight ${plColor(team.profit_loss)}`}>
                          {formatPL(team.profit_loss)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-700/50">
            {filteredRankings.map((team, index) => {
              const leagueInfo = LEAGUE_CONFIG[team.sport_key];
              return (
                <div key={team.team_name} className="p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`font-mono font-bold tabular-nums w-6 text-center ${
                        index === 0 ? 'text-red-400 text-lg' :
                        index === 1 ? 'text-slate-300' :
                        index === 2 ? 'text-orange-400' :
                        'text-slate-500 text-sm'
                      }`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-white font-semibold text-sm truncate tracking-tight">{team.team_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <LeagueLogo sportKey={team.sport_key} size="sm" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{leagueInfo?.shortName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {/* P/L hero */}
                      <div className={`font-mono font-bold text-lg tabular-nums leading-none tracking-tight ${plColor(team.profit_loss)}`}>
                        {formatPL(team.profit_loss)}
                      </div>
                      <div className="text-[10px] font-mono tabular-nums mt-1">
                        <span className="text-red-400 font-bold">{team.total_moves}</span>
                        <span className="text-slate-500 mx-0.5">moves</span>
                        <span className="text-slate-600 mx-1">·</span>
                        <span className="text-emerald-400 font-bold">{team.wins}</span>
                        <span className="text-slate-600 mx-0.5">·</span>
                        <span className="text-yellow-400 font-bold">{team.draws}</span>
                        <span className="text-slate-600 mx-0.5">·</span>
                        <span className="text-red-400 font-bold">{team.losses}</span>
                      </div>
                      <div className="text-[10px] font-mono tabular-nums mt-0.5">
                        <span className={`font-bold ${winRateColor(team.win_rate)}`}>
                          {team.win_rate !== null ? `${team.win_rate}%` : '—'}
                        </span>
                        <span className="text-slate-500 mx-1">win</span>
                        <span className="text-slate-600 mx-1">·</span>
                        <span className="text-slate-300 font-bold">
                          {team.avg_move_size !== null ? `${team.avg_move_size}%` : '—'}
                        </span>
                        <span className="text-slate-500 mx-1">move</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state when no data at all */}
      {data.team_rankings.length === 0 && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-8 sm:p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </div>
          <p className="text-slate-400 text-base sm:text-lg">No completed drifter moves yet</p>
          <p className="text-slate-500 text-sm mt-2">
            Rankings will appear here once matches with detected drifters have finished
          </p>
        </div>
      )}

      </>}
    </div>
  );
}
