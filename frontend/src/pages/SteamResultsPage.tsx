import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSteamResults } from '../api';
import type { SteamResultsData } from '../types';
import { LEAGUE_CONFIG } from '../types';
import LeagueLogo from '../components/LeagueLogo';

export default function SteamResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const league = searchParams.get('league');

  const [data, setData] = useState<SteamResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await getSteamResults({
          league: league || undefined,
          limit: 200,
        });
        setData(result);
      } catch (err) {
        setError('Failed to load steam results. Is the backend running?');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [league]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400">Loading steam results...</span>
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

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Steam Results</h1>
            <p className="text-slate-400 text-sm sm:text-base mt-0.5">
              Teams backed by sharp money &mdash; odds shortened pre-KO
            </p>
          </div>
        </div>
      </div>

      {/* Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-white">{data.total_moves}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Matches</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-emerald-500/30 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-emerald-400">
            {data.win_rate !== null ? `${data.win_rate}%` : '-'}
          </div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Win Rate</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-white">
            <span className="text-emerald-400">{data.total_wins}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-yellow-400">{data.total_draws}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-red-400">{data.total_losses}</span>
          </div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">W / D / L</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-amber-400">
            {data.avg_movement_percent !== null ? `${data.avg_movement_percent}%` : '-'}
          </div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Avg Move</div>
        </div>
      </div>

      {/* Win Rate Bar */}
      {data.total_moves > 0 && (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400 font-medium">Result Distribution</span>
            <span className="text-xs text-slate-500">
              {data.total_wins}W &mdash; {data.total_draws}D &mdash; {data.total_losses}L
            </span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
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

      {/* League Filter */}
      <div className="flex flex-wrap gap-2 mb-6 sm:mb-8">
        <button
          onClick={() => setSearchParams({})}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
            !league
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
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
                ? 'bg-amber-600 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20'
                : 'bg-slate-700/80 hover:bg-slate-600 hover:scale-105'
            }`}
            title={config.name}
          >
            <LeagueLogo sportKey={key} size="sm" />
            <span className="text-sm text-white font-medium hidden sm:inline">{config.shortName}</span>
          </button>
        ))}
      </div>

      {/* Team Rankings */}
      {data.team_rankings.length > 0 && (
        <div className="bg-slate-800/80 rounded-2xl border border-amber-500/30 overflow-hidden card-shadow mb-6 sm:mb-8"
          style={{ boxShadow: '0 0 20px -5px rgba(245, 158, 11, 0.15)' }}
        >
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-700/50 bg-gradient-to-r from-amber-500/10 to-transparent">
            <h2 className="text-lg sm:text-xl font-bold text-white">Most Steamed Teams</h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">Top 20 &mdash; ranked by sharp money frequency</p>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider w-12">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Team
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    League
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-amber-400/80 uppercase tracking-wider">
                    Moves
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-emerald-400/80 uppercase tracking-wider">
                    W
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-yellow-400/80 uppercase tracking-wider">
                    D
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-red-400/80 uppercase tracking-wider">
                    L
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Win %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {data.team_rankings.slice(0, 20).map((team, index) => {
                  const leagueInfo = LEAGUE_CONFIG[team.sport_key];
                  return (
                    <tr key={team.team_name} className="hover:bg-slate-700/20 transition-colors duration-150">
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${
                          index === 0 ? 'text-amber-400 text-lg' :
                          index === 1 ? 'text-slate-300 text-base' :
                          index === 2 ? 'text-orange-400 text-base' :
                          'text-slate-500 text-sm'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-white font-semibold text-sm">{team.team_name}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <LeagueLogo sportKey={team.sport_key} size="sm" />
                          <span className="text-slate-400 text-xs hidden lg:inline">
                            {leagueInfo?.shortName || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono font-bold text-amber-400 text-sm">{team.total_moves}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono font-bold text-emerald-400 text-sm">{team.wins}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono font-bold text-yellow-400 text-sm">{team.draws}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono font-bold text-red-400 text-sm">{team.losses}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono font-bold text-sm ${
                          team.win_rate !== null && team.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {team.win_rate !== null ? `${team.win_rate}%` : '-'}
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
            {data.team_rankings.slice(0, 20).map((team, index) => {
              const leagueInfo = LEAGUE_CONFIG[team.sport_key];
              return (
                <div key={team.team_name} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`font-bold w-6 text-center ${
                        index === 0 ? 'text-amber-400 text-lg' :
                        index === 1 ? 'text-slate-300' :
                        index === 2 ? 'text-orange-400' :
                        'text-slate-500 text-sm'
                      }`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-white font-semibold text-sm truncate">{team.team_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <LeagueLogo sportKey={team.sport_key} size="sm" />
                          <span className="text-xs text-slate-500">{leagueInfo?.shortName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono font-bold text-amber-400">{team.total_moves} moves</div>
                      <div className="text-xs mt-0.5">
                        <span className="text-emerald-400 font-semibold">{team.wins}W</span>
                        <span className="text-slate-600 mx-1">/</span>
                        <span className="text-yellow-400 font-semibold">{team.draws}D</span>
                        <span className="text-slate-600 mx-1">/</span>
                        <span className="text-red-400 font-semibold">{team.losses}L</span>
                        <span className="text-slate-600 mx-1">&middot;</span>
                        <span className={`font-semibold ${
                          team.win_rate !== null && team.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {team.win_rate !== null ? `${team.win_rate}%` : '-'}
                        </span>
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
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-slate-400 text-base sm:text-lg">No completed steam moves yet</p>
          <p className="text-slate-500 text-sm mt-2">
            Rankings will appear here once matches with detected steam have finished
          </p>
        </div>
      )}
    </div>
  );
}
