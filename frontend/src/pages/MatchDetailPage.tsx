import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { getMatchDetail } from '../api';
import type { MatchDetail } from '../types';
import { LEAGUE_CONFIG } from '../types';
import OddsChart from '../components/OddsChart';
import LeagueLogo from '../components/LeagueLogo';
import OddsWithMovement from '../components/OddsWithMovement';

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMatch() {
      if (!matchId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getMatchDetail(matchId);
        setMatch(data);
      } catch (err) {
        setError('Failed to load match details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchMatch();
  }, [matchId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400">Loading match...</span>
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400">{error || 'Match not found'}</p>
        <Link to="/" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
          ← Back to matches
        </Link>
      </div>
    );
  }

  const leagueConfig = LEAGUE_CONFIG[match.sport_key];
  const matchDate = new Date(match.commence_time);
  const latestOdds = match.odds_history[match.odds_history.length - 1];
  const firstOdds = match.odds_history[0];

  return (
    <div>
      {/* Back Button */}
      <Link
        to={`/?league=${match.sport_key}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to {leagueConfig?.name || 'matches'}
      </Link>

      {/* Match Header */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden mb-6">
        {/* League Bar */}
        <div className="px-6 py-3 bg-slate-700/50 border-b border-slate-700 flex items-center gap-3">
          <LeagueLogo sportKey={match.sport_key} size="md" />
          <span className="text-slate-300 font-medium">{leagueConfig?.name || match.league_name}</span>
        </div>

        {/* Teams and Date */}
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <h1 className="text-3xl font-bold text-white">{match.home_team}</h1>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <h1 className="text-3xl font-bold text-white">{match.away_team}</h1>
              </div>
            </div>

            <div className="text-center md:text-right">
              <div className="text-slate-400 mb-1">{format(matchDate, 'EEEE, MMMM d, yyyy')}</div>
              <div className="text-4xl font-bold text-white">{format(matchDate, 'HH:mm')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Current Odds with Movement */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <OddsWithMovement
          current={latestOdds?.home_odds ?? null}
          opening={firstOdds?.home_odds ?? null}
          label="Home"
          colorClass="text-emerald-400"
          bgClass="bg-slate-800 border border-slate-700 rounded-xl"
        />
        <OddsWithMovement
          current={latestOdds?.draw_odds ?? null}
          opening={firstOdds?.draw_odds ?? null}
          label="Draw"
          colorClass="text-yellow-400"
          bgClass="bg-slate-800 border border-slate-700 rounded-xl"
        />
        <OddsWithMovement
          current={latestOdds?.away_odds ?? null}
          opening={firstOdds?.away_odds ?? null}
          label="Away"
          colorClass="text-red-400"
          bgClass="bg-slate-800 border border-slate-700 rounded-xl"
        />
      </div>

      {/* Opening Odds Reference */}
      {firstOdds && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">Opening Odds</span>
            <div className="flex gap-4 text-sm font-mono">
              <span className="text-emerald-400/70">{firstOdds.home_odds?.toFixed(2) ?? '-'}</span>
              <span className="text-yellow-400/70">{firstOdds.draw_odds?.toFixed(2) ?? '-'}</span>
              <span className="text-red-400/70">{firstOdds.away_odds?.toFixed(2) ?? '-'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Odds History Chart */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Odds Movement</h2>
          <span className="text-xs text-slate-500">Dotted lines = opening prices</span>
        </div>
        <OddsChart
          data={match.odds_history}
          homeTeam={match.home_team}
          awayTeam={match.away_team}
        />
      </div>

      {/* Odds History Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Odds History</h2>
          <p className="text-slate-400 text-sm">{match.odds_history.length} snapshots recorded</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50">
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Home
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Draw
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Away
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {[...match.odds_history].reverse().map((point, index) => {
                const isFirst = index === match.odds_history.length - 1;
                return (
                  <tr key={index} className={`hover:bg-slate-700/30 ${isFirst ? 'bg-slate-700/20' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {format(new Date(point.timestamp), 'MMM d, yyyy HH:mm:ss')}
                      {isFirst && <span className="ml-2 text-xs text-slate-500">(Opening)</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-mono text-emerald-400">
                        {point.home_odds?.toFixed(2) ?? '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-mono text-yellow-400">
                        {point.draw_odds?.toFixed(2) ?? '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-mono text-red-400">
                        {point.away_odds?.toFixed(2) ?? '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
