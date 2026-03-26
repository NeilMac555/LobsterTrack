import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { getClosingLines } from '../api';
import type { ClosingLinesResponse, ClosingLine } from '../types';
import { LEAGUE_CONFIG } from '../types';
import LeagueLogo from '../components/LeagueLogo';

const MARKET_FILTERS = [
  { key: '', label: 'All' },
  { key: '1x2', label: '1X2' },
  { key: 'asian_handicap', label: 'AH' },
  { key: 'totals', label: 'Totals' },
];

function MarketBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    '1x2': { label: '1X2', bg: 'bg-blue-500/20', text: 'text-blue-400' },
    'asian_handicap': { label: 'AH', bg: 'bg-amber-500/20', text: 'text-amber-400' },
    'totals': { label: 'O/U', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  };
  const c = config[type] || { label: type, bg: 'bg-slate-500/20', text: 'text-slate-400' };
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function formatOdds(odds: number | null): string {
  if (odds === null) return '-';
  return odds.toFixed(2);
}

function formatLine(line: number | null): string {
  if (line === null) return '-';
  return line > 0 ? `+${line}` : String(line);
}

function ClosingOddsDisplay({ cl }: { cl: ClosingLine }) {
  if (cl.market_type === '1x2') {
    return (
      <div className="flex items-center gap-1.5 font-mono text-sm">
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-white">{formatOdds(cl.close_home)}</span>
        <span className="px-1.5 py-0.5 rounded bg-yellow-500/15 text-white">{formatOdds(cl.close_draw)}</span>
        <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-white">{formatOdds(cl.close_away)}</span>
      </div>
    );
  }

  if (cl.market_type === 'asian_handicap') {
    return (
      <div className="font-mono text-sm">
        <span className="text-amber-400 font-semibold mr-2">{formatLine(cl.close_line)}</span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-white">{formatOdds(cl.close_home_price)}</span>
        <span className="text-slate-600 mx-1">/</span>
        <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-white">{formatOdds(cl.close_away_price)}</span>
      </div>
    );
  }

  if (cl.market_type === 'totals') {
    return (
      <div className="font-mono text-sm">
        <span className="text-emerald-400 font-semibold mr-2">{cl.close_line !== null ? cl.close_line : '-'}</span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-white">{formatOdds(cl.close_over_price)}</span>
        <span className="text-slate-600 mx-1">/</span>
        <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-white">{formatOdds(cl.close_under_price)}</span>
      </div>
    );
  }

  return <span className="text-slate-500">-</span>;
}

export default function ClosingLinesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const league = searchParams.get('league');
  const marketType = searchParams.get('market') || '';

  const [data, setData] = useState<ClosingLinesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await getClosingLines({
          league: league || undefined,
          market_type: marketType || undefined,
          limit: 200,
        });
        setData(result);
      } catch (err) {
        setError('Failed to load closing lines. Is the backend running?');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [league, marketType]);

  const setMarketFilter = (market: string) => {
    const params: Record<string, string> = {};
    if (league) params.league = league;
    if (market) params.market = market;
    setSearchParams(params);
  };

  const setLeagueFilter = (key: string | null) => {
    const params: Record<string, string> = {};
    if (key) params.league = key;
    if (marketType) params.market = marketType;
    setSearchParams(params);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400">Loading closing lines...</span>
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

  const leagues = Object.entries(LEAGUE_CONFIG);

  // Count by market type
  const marketCounts = data.closing_lines.reduce((acc, cl) => {
    acc[cl.market_type] = (acc[cl.market_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <Helmet>
        <title>Closing Lines — SteamWatch</title>
        <meta name="description" content="Compare opening and closing odds across major European football leagues. Track closing line value and market efficiency." />
        <link rel="canonical" href="https://www.steamwatch.io/closing-lines" />
      </Helmet>
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Closing Lines</h1>
            <p className="text-slate-400 text-sm sm:text-base mt-0.5">
              Last Pinnacle odds before kickoff
            </p>
          </div>
        </div>
      </div>

      {/* Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-slate-800/80 rounded-xl border border-violet-500/30 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-violet-400">{data.total}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Total Lines</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-blue-400">{marketCounts['1x2'] || 0}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">1X2</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-amber-400">{marketCounts['asian_handicap'] || 0}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Asian HC</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-emerald-400">{marketCounts['totals'] || 0}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Totals</div>
        </div>
      </div>

      {/* League Filter */}
      <div className="flex flex-wrap gap-2 mb-4 sm:mb-5">
        <button
          onClick={() => setLeagueFilter(null)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
            !league
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
              : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white'
          }`}
        >
          All Leagues
        </button>
        {leagues.map(([key, config]) => (
          <button
            key={key}
            onClick={() => setLeagueFilter(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${
              league === key
                ? 'bg-violet-600 ring-2 ring-violet-400/50 shadow-lg shadow-violet-500/20'
                : 'bg-slate-700/80 hover:bg-slate-600 hover:scale-105'
            }`}
            title={config.name}
          >
            <LeagueLogo sportKey={key} size="sm" />
            <span className="text-sm text-white font-medium hidden sm:inline">{config.shortName}</span>
          </button>
        ))}
      </div>

      {/* Market Type Filter */}
      <div className="flex flex-wrap gap-2 mb-6 sm:mb-8">
        {MARKET_FILTERS.map((mf) => (
          <button
            key={mf.key}
            onClick={() => setMarketFilter(mf.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              marketType === mf.key
                ? 'bg-violet-500/30 text-violet-300 ring-1 ring-violet-400/50'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
            }`}
          >
            {mf.label}
          </button>
        ))}
      </div>

      {/* Data Table */}
      {data.closing_lines.length > 0 ? (
        <div className="bg-slate-800/80 rounded-2xl border border-violet-500/30 overflow-hidden card-shadow"
          style={{ boxShadow: '0 0 20px -5px rgba(139, 92, 246, 0.15)' }}
        >
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Match
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    League
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Market
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-violet-400/80 uppercase tracking-wider">
                    Closing Odds
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Captured
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {data.closing_lines.map((cl) => {
                  const leagueInfo = LEAGUE_CONFIG[cl.league];
                  const kickoff = new Date(cl.kickoff_time);
                  return (
                    <tr key={cl.id} className="hover:bg-slate-700/20 transition-colors duration-150">
                      <td className="px-4 py-3">
                        <Link to={`/match/${cl.match_id}`} className="hover:text-violet-400 transition-colors">
                          <div className="text-white font-semibold text-sm">{cl.home_team} vs {cl.away_team}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{format(kickoff, 'EEE, MMM d HH:mm')}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <LeagueLogo sportKey={cl.league} size="sm" />
                          <span className="text-slate-400 text-xs hidden lg:inline">
                            {leagueInfo?.shortName || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <MarketBadge type={cl.market_type} />
                      </td>
                      <td className="px-4 py-3">
                        <ClosingOddsDisplay cl={cl} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-slate-400">
                          {cl.minutes_before_kickoff}m before KO
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
            {data.closing_lines.map((cl) => {
              const leagueInfo = LEAGUE_CONFIG[cl.league];
              const kickoff = new Date(cl.kickoff_time);
              return (
                <Link key={cl.id} to={`/match/${cl.match_id}`} className="block p-4 hover:bg-slate-700/20 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <LeagueLogo sportKey={cl.league} size="sm" />
                      <span className="text-xs text-slate-500">{leagueInfo?.shortName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MarketBadge type={cl.market_type} />
                      <span className="text-[10px] text-slate-500">{cl.minutes_before_kickoff}m pre-KO</span>
                    </div>
                  </div>
                  <div className="text-white font-semibold text-sm mb-1">{cl.home_team} vs {cl.away_team}</div>
                  <div className="flex items-center justify-between">
                    <ClosingOddsDisplay cl={cl} />
                    <span className="text-xs text-slate-500">{format(kickoff, 'MMM d HH:mm')}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-8 sm:p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-violet-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-slate-400 text-base sm:text-lg">No closing lines captured yet</p>
          <p className="text-slate-500 text-sm mt-2">
            Lines are captured automatically after kickoff
          </p>
        </div>
      )}
    </div>
  );
}
