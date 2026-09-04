import { Link } from 'react-router-dom';
import type { MatchSummary } from '../types';
import { LEAGUE_CONFIG } from '../types';
import { OddsDisplayWithMovement, calculateMovement, getBiggestMover } from './OddsWithMovement';
import LeagueLogo from './LeagueLogo';
import Sparkline from './Sparkline';
import TeamBadge from './TeamBadge';
import { formatKickoff } from '../utils/time';
import { useTimePreference } from '../contexts/TimePreferenceContext';

interface MatchCardProps {
  match: MatchSummary;
}

export default function MatchCard({ match }: MatchCardProps) {
  const { mode: timeMode } = useTimePreference();
  const leagueConfig = LEAGUE_CONFIG[match.sport_key];

  const homeMovement = calculateMovement(match.current_home_odds, match.opening_home_odds);
  const drawMovement = calculateMovement(match.current_draw_odds, match.opening_draw_odds);
  const awayMovement = calculateMovement(match.current_away_odds, match.opening_away_odds);
  const biggestMover = getBiggestMover(homeMovement, drawMovement, awayMovement);

  const movementPercent = biggestMover ? Math.abs(biggestMover.percentage) : 0;
  const isSignificantMove = movementPercent >= 5;
  const isMinimalMove = movementPercent < 3;

  const cardClasses = `block bg-slate-800 rounded-2xl sm:rounded-3xl border transition-all duration-200 ease-out hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] overflow-hidden group card-shadow ${
    isSignificantMove
      ? 'border-emerald-500/40 hover:border-emerald-500/60 hover:shadow-emerald-500/15'
      : isMinimalMove
      ? 'border-slate-700/60 hover:border-blue-500/40 opacity-[0.85] hover:opacity-100'
      : 'border-slate-700/80 hover:border-blue-500/50 hover:shadow-blue-500/10'
  }`;

  const cardStyle = isSignificantMove
    ? { boxShadow: '0 0 20px -5px rgba(16, 185, 129, 0.2)' }
    : {};

  return (
    <Link
      to={`/match/${match.id}`}
      className={cardClasses}
      style={cardStyle}
    >
      {/* League Header — compact mono strip */}
      <div className="px-4 sm:px-5 py-2 sm:py-2.5 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <LeagueLogo sportKey={match.sport_key} size="sm" />
          <span className="text-[10px] sm:text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-slate-400 truncate">
            {leagueConfig?.shortName || match.league_name}
          </span>
          {match.current_odds_bookmaker === 'betfair_ex_eu' && (
            <span
              className="px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-[9px] font-mono uppercase tracking-[0.1em] text-amber-400 flex-shrink-0"
              title="Pinnacle doesn't carry this match — odds shown are from the Betfair Exchange instead"
            >
              Betfair
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {biggestMover && (
            <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-mono font-bold bg-red-500/20 text-red-400 tabular-nums tracking-tight ${
              isSignificantMove ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'
            }`}>
              {biggestMover.outcome} ↓{Math.abs(biggestMover.percentage).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Match body — team names stacked on left, kickoff on right */}
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 sm:mb-5">
          <div className="flex-1 space-y-2 sm:space-y-2.5 min-w-0 pr-4">
            {/* Flag prepended when the team is a country we recognise
                (e.g. WC nations). Falls through to plain name for
                club teams since they're not in the country map. */}
            <div className="flex items-center gap-2">
              <TeamBadge team={match.home_team} badgeUrl={match.home_badge_url} size="md" />
              <span className="text-white font-semibold text-sm sm:text-base tracking-tight truncate">{match.home_team}</span>
            </div>
            <div className="flex items-center gap-2">
              <TeamBadge team={match.away_team} badgeUrl={match.away_badge_url} size="md" />
              <span className="text-white font-semibold text-sm sm:text-base tracking-tight truncate">{match.away_team}</span>
            </div>
          </div>

          {/* Kickoff — mono for the terminal feel */}
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.12em] text-slate-500">
              {formatKickoff(match.commence_time, 'EEE, MMM d', timeMode)}
            </div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums tracking-tight leading-none mt-0.5">
              {formatKickoff(match.commence_time, 'HH:mm', timeMode)}
            </div>
          </div>
        </div>

        {/* Movement sparkline — between the teams and the odds. Full-width,
            makes the home implied-probability trajectory impossible to miss. */}
        {match.home_prob_spark && match.home_prob_spark.length >= 2 && (
          <div className="flex items-center gap-3 mb-3 sm:mb-4 py-2 px-3 rounded-lg bg-slate-900/60 border border-slate-700/40">
            <span className="text-[9px] sm:text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-slate-500 flex-shrink-0">Home Trend</span>
            <div className="flex-1 min-w-0 flex items-center justify-center">
              <Sparkline values={match.home_prob_spark} width={160} height={30} color="auto" />
            </div>
            <span className={`text-[10px] sm:text-xs font-mono font-bold tabular-nums flex-shrink-0 ${(() => {
              const d = match.home_prob_spark[match.home_prob_spark.length - 1] - match.home_prob_spark[0];
              if (d > 0.15) return 'text-red-400';      // shortening
              if (d < -0.15) return 'text-emerald-400'; // drifting
              return 'text-slate-400';
            })()}`}>
              {(() => {
                const d = match.home_prob_spark[match.home_prob_spark.length - 1] - match.home_prob_spark[0];
                const arrow = d > 0.15 ? '↑' : d < -0.15 ? '↓' : '·';
                return `${arrow} ${Math.abs(d).toFixed(1)}pp`;
              })()}
            </span>
          </div>
        )}

        {/* Odds footer */}
        <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-slate-700/50">
          <div className="text-[10px] sm:text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">1 · X · 2</div>
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
