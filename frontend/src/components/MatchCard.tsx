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

  // Determine visual treatment based on movement
  const movementPercent = biggestMover ? Math.abs(biggestMover.percentage) : 0;
  const isSignificantMove = movementPercent >= 5;
  const isMinimalMove = movementPercent < 3;

  // Dynamic classes based on movement significance
  const cardClasses = `block bg-slate-800 rounded-2xl sm:rounded-3xl border transition-all duration-200 ease-out hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] overflow-hidden group card-shadow ${
    isSignificantMove
      ? 'border-emerald-500/40 hover:border-emerald-500/60 hover:shadow-emerald-500/15'
      : isMinimalMove
      ? 'border-slate-700/60 hover:border-blue-500/40 opacity-[0.85] hover:opacity-100'
      : 'border-slate-700/80 hover:border-blue-500/50 hover:shadow-blue-500/10'
  }`;

  // Glow effect for significant moves
  const cardStyle = isSignificantMove
    ? { boxShadow: '0 0 20px -5px rgba(16, 185, 129, 0.2)' }
    : {};

  return (
    <Link
      to={`/match/${match.id}`}
      className={cardClasses}
      style={cardStyle}
    >
      {/* League Header */}
      <div className="px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <LeagueLogo sportKey={match.sport_key} size="sm" />
          <span className="text-xs sm:text-sm text-slate-400 font-medium truncate">{leagueConfig?.shortName || match.league_name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {biggestMover && (
            <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-semibold bg-emerald-500/20 text-emerald-400 ${isSignificantMove ? 'text-xs sm:text-sm font-bold' : 'text-[10px] sm:text-xs'}`}>
              {biggestMover.outcome} ↓ {Math.abs(biggestMover.percentage).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Match Info */}
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 sm:mb-5">
          <div className="flex-1 space-y-2 sm:space-y-2.5 min-w-0 pr-4">
            <div className="flex items-center">
              <span className="text-white font-semibold text-sm sm:text-base truncate">{match.home_team}</span>
            </div>
            <div className="flex items-center">
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
        <div className="flex items-center justify-between pt-4 sm:pt-5 border-t border-slate-700/50">
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
      <div className={`h-0.5 sm:h-1 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left ${
        isSignificantMove
          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
          : 'bg-gradient-to-r from-blue-500 to-blue-600'
      }`}></div>
    </Link>
  );
}
