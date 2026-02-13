import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { getClosingLines } from '../api';
import type { ClosingLine } from '../types';
import { LEAGUE_CONFIG } from '../types';
import LeagueLogo from '../components/LeagueLogo';

export default function ClosingLinesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const league = searchParams.get('league');

  const [closingLines, setClosingLines] = useState<ClosingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const data = await getClosingLines({
          league: league || undefined,
          limit: 50,
        });
        setClosingLines(data);
      } catch (err) {
        setError('Failed to load closing lines. Is the backend running?');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [league]);

  function formatLine(line: number | null): string {
    if (line === null) return '-';
    return line > 0 ? `+${line}` : String(line);
  }

  function getLineMovement(opening: number | null, closing: number | null): { moved: boolean; label: string } {
    if (opening === null || closing === null) return { moved: false, label: '' };
    if (opening === closing) return { moved: false, label: '' };
    return { moved: true, label: `${formatLine(opening)} -> ${formatLine(closing)}` };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
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

  const leagues = Object.entries(LEAGUE_CONFIG);

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Closing Lines</h1>
            <p className="text-slate-400 text-sm sm:text-base mt-0.5">
              Final Asian Handicap odds before kickoff — last 48 hours
            </p>
          </div>
        </div>
      </div>

      {/* League Filter */}
      <div className="flex flex-wrap gap-2 mb-6 sm:mb-8">
        <button
          onClick={() => setSearchParams({})}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
            !league
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
              : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white'
          }`}
        >
          All Leagues
        </button>
        {leagues.map(([key, config]) => (
          <button
            key={key}
            onClick={() => setSearchParams({ league: key })}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${
              league === key
                ? 'bg-purple-600 ring-2 ring-purple-400/50 shadow-lg shadow-purple-500/20'
                : 'bg-slate-700/80 hover:bg-slate-600 hover:scale-105'
            }`}
            title={config.name}
          >
            <LeagueLogo sportKey={key} size="sm" />
            <span className="text-sm text-white font-medium hidden sm:inline">{config.shortName}</span>
          </button>
        ))}
      </div>

      {/* Results */}
      {closingLines.length === 0 ? (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-8 sm:p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-400 text-base sm:text-lg">No closing lines available</p>
          <p className="text-slate-500 text-sm mt-2">
            Matches from the last 48 hours with Asian Handicap data will appear here
          </p>
        </div>
      ) : (
        <div className="bg-slate-800/80 rounded-2xl border border-purple-500/30 overflow-hidden card-shadow"
          style={{
            boxShadow: '0 0 20px -5px rgba(168, 85, 247, 0.15)'
          }}
        >
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-700/50 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-transparent">
            <div>
              <span className="text-slate-400 text-sm font-medium">
                {closingLines.length} match{closingLines.length !== 1 ? 'es' : ''}
              </span>
            </div>
            <span className="text-[10px] sm:text-xs text-purple-400/80 font-medium hidden sm:block">Asian Handicap closing odds</span>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Match
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    League
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Kickoff
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-purple-400/80 uppercase tracking-wider">
                    Line
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Home
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Away
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Line Move
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {closingLines.map((cl) => {
                  const matchDate = new Date(cl.commence_time);
                  const leagueInfo = LEAGUE_CONFIG[cl.sport_key];
                  const lineMove = getLineMovement(cl.opening_line, cl.handicap_line);

                  return (
                    <tr key={cl.match_id} className="hover:bg-slate-700/20 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <Link
                          to={`/match/${cl.match_id}`}
                          className="text-white hover:text-purple-400 transition-colors"
                        >
                          <div className="font-semibold text-base">
                            {cl.home_team} vs {cl.away_team}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <LeagueLogo sportKey={cl.sport_key} size="sm" />
                          <span className="text-slate-400 text-sm hidden lg:inline font-medium">
                            {leagueInfo?.shortName || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-slate-400 text-sm">
                          {format(matchDate, 'MMM d, HH:mm')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="px-2.5 py-1 rounded-lg text-sm font-bold bg-purple-500/20 text-purple-400">
                          {formatLine(cl.handicap_line)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono font-bold text-emerald-400">
                          {cl.home_odds?.toFixed(2) || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono font-bold text-red-400">
                          {cl.away_odds?.toFixed(2) || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {lineMove.moved ? (
                          <span className="text-xs text-yellow-400 font-medium">
                            {lineMove.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-700/50">
            {closingLines.map((cl) => {
              const matchDate = new Date(cl.commence_time);
              const leagueInfo = LEAGUE_CONFIG[cl.sport_key];
              const lineMove = getLineMovement(cl.opening_line, cl.handicap_line);

              return (
                <Link
                  key={cl.match_id}
                  to={`/match/${cl.match_id}`}
                  className="block p-4 hover:bg-slate-700/20 active:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <LeagueLogo sportKey={cl.sport_key} size="sm" />
                        <span className="text-xs text-slate-500">{leagueInfo?.shortName}</span>
                        <span className="text-xs text-slate-600">-</span>
                        <span className="text-xs text-slate-500">{format(matchDate, 'MMM d, HH:mm')}</span>
                      </div>
                      <div className="text-white font-semibold text-sm truncate">
                        {cl.home_team} vs {cl.away_team}
                      </div>
                      {lineMove.moved && (
                        <div className="text-xs text-yellow-400 mt-1">
                          Line: {lineMove.label}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="px-2.5 py-1 rounded-lg text-sm font-bold bg-purple-500/20 text-purple-400 mb-1">
                        {formatLine(cl.handicap_line)}
                      </div>
                      <div className="text-xs space-y-0.5">
                        <div>
                          <span className="text-slate-500">H </span>
                          <span className="font-mono font-semibold text-emerald-400">{cl.home_odds?.toFixed(2) || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">A </span>
                          <span className="font-mono font-semibold text-red-400">{cl.away_odds?.toFixed(2) || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
