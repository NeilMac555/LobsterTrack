import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import type { MatchSummary } from '../types';
import { LEAGUE_CONFIG } from '../types';
import OddsDisplay from './OddsDisplay';
import LeagueLogo from './LeagueLogo';

interface MatchCardProps {
  match: MatchSummary;
}

export default function MatchCard({ match }: MatchCardProps) {
  const leagueConfig = LEAGUE_CONFIG[match.sport_key];
  const matchDate = new Date(match.commence_time);

  return (
    <Link
      to={`/match/${match.id}`}
      className="block bg-slate-800 rounded-xl border border-slate-700 hover:border-blue-500/50 transition-all hover:shadow-lg hover:shadow-blue-500/10 overflow-hidden group"
    >
      {/* League Header */}
      <div className="px-4 py-2 bg-slate-700/50 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LeagueLogo sportKey={match.sport_key} size="sm" />
          <span className="text-sm text-slate-400">{leagueConfig?.name || match.league_name}</span>
        </div>
        <div className="text-xs text-slate-500">
          {match.odds_count} snapshot{match.odds_count !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Match Info */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-white font-medium">{match.home_team}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span className="text-white font-medium">{match.away_team}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-slate-400">
              {format(matchDate, 'EEE, MMM d')}
            </div>
            <div className="text-lg font-semibold text-white">
              {format(matchDate, 'HH:mm')}
            </div>
          </div>
        </div>

        {/* Odds */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-700">
          <div className="text-xs text-slate-500 uppercase tracking-wide">1 X 2</div>
          <OddsDisplay
            home={match.current_home_odds}
            draw={match.current_draw_odds}
            away={match.current_away_odds}
          />
        </div>
      </div>

      {/* Hover indicator */}
      <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
    </Link>
  );
}
