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
  const [showChangesOnly, setShowChangesOnly] = useState(true);

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
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
        <p className="text-red-400 text-lg">{error || 'Match not found'}</p>
        <Link to="/" className="text-blue-400 hover:text-blue-300 mt-4 inline-block font-medium">
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
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors duration-200 font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to {leagueConfig?.name || 'matches'}
      </Link>

      {/* Match Header */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 overflow-hidden mb-8 card-shadow">
        {/* League Bar */}
        <div className="px-6 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center gap-3">
          <LeagueLogo sportKey={match.sport_key} size="md" />
          <span className="text-slate-300 font-semibold">{leagueConfig?.name || match.league_name}</span>
        </div>

        {/* Teams and Date */}
        <div className="p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30"></div>
                <h1 className="text-3xl font-bold text-white">{match.home_team}</h1>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-4 h-4 rounded-full bg-red-500 shadow-lg shadow-red-500/30"></div>
                <h1 className="text-3xl font-bold text-white">{match.away_team}</h1>
              </div>
            </div>

            <div className="text-center md:text-right">
              <div className="text-slate-400 mb-2 font-medium">{format(matchDate, 'EEEE, MMMM d, yyyy')}</div>
              <div className="text-5xl font-bold text-white">{format(matchDate, 'HH:mm')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Current Odds with Movement */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        <OddsWithMovement
          current={latestOdds?.home_odds ?? null}
          opening={firstOdds?.home_odds ?? null}
          label="Home"
          colorClass="text-emerald-400"
          bgClass="bg-slate-800/80 border border-slate-700/50 rounded-2xl card-shadow"
        />
        <OddsWithMovement
          current={latestOdds?.draw_odds ?? null}
          opening={firstOdds?.draw_odds ?? null}
          label="Draw"
          colorClass="text-yellow-400"
          bgClass="bg-slate-800/80 border border-slate-700/50 rounded-2xl card-shadow"
        />
        <OddsWithMovement
          current={latestOdds?.away_odds ?? null}
          opening={firstOdds?.away_odds ?? null}
          label="Away"
          colorClass="text-red-400"
          bgClass="bg-slate-800/80 border border-slate-700/50 rounded-2xl card-shadow"
        />
      </div>

      {/* Opening Odds Reference */}
      {firstOdds && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5 mb-8">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm font-medium">Opening Odds</span>
            <div className="flex gap-6 text-sm font-mono font-semibold">
              <span className="text-slate-300">{firstOdds.home_odds?.toFixed(2) ?? '-'}</span>
              <span className="text-slate-300">{firstOdds.draw_odds?.toFixed(2) ?? '-'}</span>
              <span className="text-slate-300">{firstOdds.away_odds?.toFixed(2) ?? '-'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Odds History Chart */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-6 mb-8 card-shadow">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-white">Odds Movement</h2>
          <span className="text-xs text-slate-500 font-medium">Dotted lines = opening prices</span>
        </div>
        <OddsChart
          data={match.odds_history}
          homeTeam={match.home_team}
          awayTeam={match.away_team}
        />
      </div>

      {/* Odds History Table */}
      <OddsHistoryTable
        oddsHistory={match.odds_history}
        showChangesOnly={showChangesOnly}
        onToggleShowChanges={() => setShowChangesOnly(!showChangesOnly)}
      />
    </div>
  );
}

interface OddsHistoryTableProps {
  oddsHistory: MatchDetail['odds_history'];
  showChangesOnly: boolean;
  onToggleShowChanges: () => void;
}

function OddsHistoryTable({ oddsHistory, showChangesOnly, onToggleShowChanges }: OddsHistoryTableProps) {
  // Filter to only rows where odds changed from previous
  const filteredHistory = showChangesOnly
    ? oddsHistory.filter((point, index) => {
        if (index === 0) return true; // Always show opening
        const prev = oddsHistory[index - 1];
        return (
          point.home_odds !== prev.home_odds ||
          point.draw_odds !== prev.draw_odds ||
          point.away_odds !== prev.away_odds
        );
      })
    : oddsHistory;

  // Reverse for display (newest first)
  const displayHistory = [...filteredHistory].reverse();

  return (
    <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 overflow-hidden card-shadow">
      <div className="px-6 py-5 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Odds History</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {showChangesOnly
              ? `${filteredHistory.length} changes out of ${oddsHistory.length} snapshots`
              : `${oddsHistory.length} snapshots recorded`}
          </p>
        </div>
        <button
          onClick={onToggleShowChanges}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
            showChangesOnly
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <svg
            className={`w-4 h-4 transition-transform ${showChangesOnly ? 'rotate-0' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {showChangesOnly ? 'Changes Only' : 'Show All'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-700/30">
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Home
              </th>
              <th className="px-6 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Draw
              </th>
              <th className="px-6 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Away
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {displayHistory.map((point, displayIndex) => {
              // Find original index for comparison
              const originalIndex = oddsHistory.findIndex(p => p.timestamp === point.timestamp);
              const isOpening = originalIndex === 0;
              const prevPoint = originalIndex > 0 ? oddsHistory[originalIndex - 1] : null;

              const homeChanged = prevPoint && point.home_odds !== prevPoint.home_odds;
              const drawChanged = prevPoint && point.draw_odds !== prevPoint.draw_odds;
              const awayChanged = prevPoint && point.away_odds !== prevPoint.away_odds;

              return (
                <tr
                  key={displayIndex}
                  className={`hover:bg-slate-700/20 transition-colors duration-150 ${isOpening ? 'bg-slate-700/20' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-medium">
                    {format(new Date(point.timestamp), 'MMM d, yyyy HH:mm:ss')}
                    {isOpening && <span className="ml-2 text-xs text-slate-500 font-semibold">(Opening)</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`font-mono font-bold ${homeChanged ? 'text-white bg-slate-600/40 px-2 py-0.5 rounded' : 'text-white'}`}>
                      {point.home_odds?.toFixed(2) ?? '-'}
                    </span>
                    {homeChanged && prevPoint?.home_odds && (
                      <span className={`ml-2 text-xs ${point.home_odds! < prevPoint.home_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.home_odds! > prevPoint.home_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`font-mono font-bold ${drawChanged ? 'text-white bg-slate-600/40 px-2 py-0.5 rounded' : 'text-white'}`}>
                      {point.draw_odds?.toFixed(2) ?? '-'}
                    </span>
                    {drawChanged && prevPoint?.draw_odds && (
                      <span className={`ml-2 text-xs ${point.draw_odds! < prevPoint.draw_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.draw_odds! > prevPoint.draw_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`font-mono font-bold ${awayChanged ? 'text-white bg-slate-600/40 px-2 py-0.5 rounded' : 'text-white'}`}>
                      {point.away_odds?.toFixed(2) ?? '-'}
                    </span>
                    {awayChanged && prevPoint?.away_odds && (
                      <span className={`ml-2 text-xs ${point.away_odds! < prevPoint.away_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.away_odds! > prevPoint.away_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filteredHistory.length === 0 && (
        <div className="px-6 py-8 text-center text-slate-500">
          No odds changes recorded yet
        </div>
      )}
    </div>
  );
}
