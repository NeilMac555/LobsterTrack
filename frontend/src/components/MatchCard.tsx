import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import type { MatchSummary } from '../types';
import { LEAGUE_CONFIG } from '../types';
import { OddsDisplayWithMovement, calculateMovement, getBiggestMover } from './OddsWithMovement';
import LeagueLogo from './LeagueLogo';

interface MatchCardProps {
  match: MatchSummary;
}

export default function MatchCard({ match }: MatchCardProps) {
  const leagueConfig = LEAGUE_CONFIG[match.sport_key];
  const matchDate = new Date(match.commence_time);

  const homeMovement = calculateMovement(match.current_home_odds, match.opening_home_odds);
  const drawMovement = calculateMovement(match.current_draw_odds, match.opening_draw_odds);
  const awayMovement = calculateMovement(match.current_away_odds, match.opening_away_odds);
  const biggestMover = getBiggestMover(homeMovement, drawMovement, awayMovement);

  return (
    <Link
      to={`/match/${match.id}`}
      className="block bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-700/80 hover:border-blue-500/50 transition-all duration-200 ease-out hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1 active:scale-[0.98] overflow-hidden group card-shadow"
    >
      {/* League Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <LeagueLogo sportKey={match.sport_key} size="sm" />
          <span className="text-xs sm:text-sm text-slate-400 font-medium truncate">{leagueConfig?.shortName || match.league_name}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {biggestMover && (
            <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium ${
              biggestMover.direction === 'down'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            } ${Math.abs(biggestMover.percentage) >= 5 ? 'font-bold' : ''}`}>
              {biggestMover.outcome} {biggestMover.direction === 'up' ? '↑' : '↓'} {Math.abs(biggestMover.percentage).toFixed(1)}%
            </span>
          )}
          <div className="text-[10px] sm:text-xs text-slate-500 hidden xs:block">
            {match.odds_count} snap{match.odds_count !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Match Info */}
      <div className="p-3 sm:p-5">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0 pr-3">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 flex-shrink-0"></span>
              <span className="text-white font-semibold text-sm sm:text-base truncate">{match.home_team}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50 flex-shrink-0"></span>
              <span className="text-white font-semibold text-sm sm:text-base truncate">{match.away_team}</span>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-xs sm:text-sm text-slate-400 font-medium">
              {format(matchDate, 'EEE, MMM d')}
            </div>
            <div className="text-lg sm:text-xl font-bold text-white">
              {format(matchDate, 'HH:mm')}
            </div>
          </div>
        </div>

        {/* Odds with Movement */}
        <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-slate-700/50">
          <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider font-medium">1 X 2</div>
          <OddsDisplayWithMovement
            home={match.current_home_odds}
            draw={match.current_draw_odds}
            away={match.current_away_odds}
            openingHome={match.opening_home_odds}
            openingDraw={match.opening_draw_odds}
            openingAway={match.opening_away_odds}
            size="sm"
          />
        </div>
      </div>

      {/* Hover indicator */}
      <div className="h-0.5 sm:h-1 bg-gradient-to-r from-blue-500 to-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left"></div>
    </Link>
  );
}
