import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { getMatchDetail } from '../api';
import type { MatchDetail } from '../types';
import { LEAGUE_CONFIG } from '../types';
import OddsChart from '../components/OddsChart';
import LeagueLogo from '../components/LeagueLogo';

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

  // Calculate odds movement
  const calcMovement = (current: number | null, initial: number | null) => {
    if (!current || !initial) return null;
    return current - initial;
  };

  const homeMovement = calcMovement(latestOdds?.home_odds, firstOdds?.home_odds);
  const drawMovement = calcMovement(latestOdds?.draw_odds, firstOdds?.draw_odds);
  const awayMovement = calcMovement(latestOdds?.away_odds, firstOdds?.away_odds);

  const MovementIndicator = ({ value }: { value: number | null }) => {
    if (value === null || Math.abs(value) < 0.01) return null;
    const isUp = value > 0;
    return (
      <span className={`text-xs ml-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
        {isUp ? '↑' : '↓'}{Math.abs(value).toFixed(2)}
      </span>
    );
  };

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

      {/* Current Odds */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
          <div className="text-slate-400 text-sm mb-2">Home</div>
          <div className="text-3xl font-bold text-emerald-400 font-mono">
            {latestOdds?.home_odds?.toFixed(2) ?? '-'}
          </div>
          <MovementIndicator value={homeMovement} />
          <div className="text-slate-500 text-xs mt-2">{match.home_team}</div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
          <div className="text-slate-400 text-sm mb-2">Draw</div>
          <div className="text-3xl font-bold text-yellow-400 font-mono">
            {latestOdds?.draw_odds?.toFixed(2) ?? '-'}
          </div>
          <MovementIndicator value={drawMovement} />
          <div className="text-slate-500 text-xs mt-2">X</div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
          <div className="text-slate-400 text-sm mb-2">Away</div>
          <div className="text-3xl font-bold text-red-400 font-mono">
            {latestOdds?.away_odds?.toFixed(2) ?? '-'}
          </div>
          <MovementIndicator value={awayMovement} />
          <div className="text-slate-500 text-xs mt-2">{match.away_team}</div>
        </div>
      </div>

      {/* Odds History Chart */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">Odds Movement</h2>
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
              {[...match.odds_history].reverse().map((point, index) => (
                <tr key={index} className="hover:bg-slate-700/30">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                    {format(new Date(point.timestamp), 'MMM d, yyyy HH:mm:ss')}
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
