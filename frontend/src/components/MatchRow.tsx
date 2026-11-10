import { Link } from 'react-router-dom';
import type { MatchSummary } from '../types';
import { LEAGUE_CONFIG } from '../types';
import { calculateMovement, getBiggestMover } from './OddsWithMovement';
import Sparkline from './Sparkline';
import TeamBadge from './TeamBadge';
import { formatKickoff } from '../utils/time';
import { formatOdds } from '../utils/odds';
import { useTimePreference } from '../contexts/TimePreferenceContext';
import { useOddsFormat } from '../contexts/OddsFormatContext';

// One fixture as a compact row: kickoff, teams, opening and current 1X2
// prices, home trend and the biggest shortener. Replaces the large match
// cards in fixture lists (a full list was about 60 phone screens of
// cards). Colour convention is the site's: red = price shortening,
// green = price drifting.
//
// Columns   phone: time | match | now
//           md:    time | match | now | trend | top move
//           lg:    time | match | open | now | trend | top move

const GRID =
  'grid items-center gap-x-3 sm:gap-x-4 lg:gap-x-6 px-3 sm:px-4 ' +
  'grid-cols-[3rem_minmax(0,1fr)_auto] ' +
  'md:grid-cols-[3.25rem_minmax(0,1fr)_auto_6rem_4.5rem] ' +
  'lg:grid-cols-[6.5rem_minmax(0,1fr)_auto_auto_6rem_6.5rem]';
const CELL = 'w-[3.1rem] sm:w-[3.6rem]';
const OPEN_CELL = 'w-[3rem]';
const SIDES = ['Home', 'Draw', 'Away'];
const TH = 'text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-slate-500';

export function MatchRowHeader() {
  return (
    <div className={`${GRID} py-1.5 bg-slate-900/50 border-b border-slate-700/50`} aria-hidden="true">
      <span className={TH}>Time</span>
      <span className={TH}>Match</span>
      <span className={`${TH} hidden lg:flex gap-1`}>
        {['Open 1', 'X', '2'].map((l) => <span key={l} className={`${OPEN_CELL} text-center whitespace-nowrap`}>{l}</span>)}
      </span>
      <span className={`${TH} flex gap-1`}>
        {['1', 'X', '2'].map((l, i) => (
          <span key={l} className={`${CELL} text-center whitespace-nowrap`}>
            {i === 0 && <span className="hidden lg:inline">Now </span>}{l}
          </span>
        ))}
      </span>
      <span className={`${TH} hidden md:block text-center`}>Home trend</span>
      <span className={`${TH} hidden md:block text-right`}>Top move</span>
    </div>
  );
}

export default function MatchRow({ match, showLeague = true }: { match: MatchSummary; showLeague?: boolean }) {
  const { mode: timeMode } = useTimePreference();
  const { format } = useOddsFormat();
  const league = LEAGUE_CONFIG[match.sport_key];

  const opening = [match.opening_home_odds, match.opening_draw_odds, match.opening_away_odds];
  const prices = [match.current_home_odds, match.current_draw_odds, match.current_away_odds];
  const moves = prices.map((p, i) => calculateMovement(p, opening[i]));
  const mover = getBiggestMover(moves[0], moves[1], moves[2]);
  const moverPct = mover ? Math.abs(mover.percentage) : 0;
  const big = moverPct >= 5;
  const moverName = mover ? SIDES['HDA'.indexOf(mover.outcome)] : '';
  const betfair = match.current_odds_bookmaker === 'betfair_ex_eu';

  return (
    <Link
      to={`/match/${match.id}`}
      className={`${GRID} relative py-2.5 lg:py-2 hover:bg-slate-700/30 focus-visible:bg-slate-700/30 focus-visible:outline-none group`}
    >
      {big && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-red-400" aria-hidden="true" />}

      <div className="min-w-0 lg:flex lg:items-baseline lg:gap-2">
        <div className="font-mono font-bold text-white text-[13px] sm:text-sm tabular-nums leading-tight">
          {formatKickoff(match.commence_time, 'HH:mm', timeMode)}
        </div>
        {(showLeague || betfair) && (
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 whitespace-nowrap mt-1 lg:mt-0">
            {showLeague && (league?.shortName || match.league_name)}
            {betfair && (
              <span
                className="text-amber-400"
                title="Pinnacle does not carry this match. Prices shown are from the Betfair Exchange."
              >
                {showLeague ? ' ' : ''}BF
              </span>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-2.5">
        {[
          [match.home_team, match.home_badge_url] as const,
          [match.away_team, match.away_badge_url] as const,
        ].map(([team, badge], i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            {i === 1 && <span className="hidden lg:inline text-[11px] text-slate-600 mr-0.5">v</span>}
            <TeamBadge team={team} badgeUrl={badge} size="sm" />
            <span className="text-[13px] sm:text-sm font-medium text-slate-100 group-hover:text-white truncate leading-tight">{team}</span>
          </div>
        ))}
      </div>

      <div className="hidden lg:flex gap-1">
        {opening.map((p, i) => (
          <span key={i} className={`${OPEN_CELL} text-center font-mono text-[12px] text-slate-500 tabular-nums`}>
            {formatOdds(p, format)}
          </span>
        ))}
      </div>

      <div className="flex gap-1">
        {prices.map((p, i) => {
          const m = moves[i];
          const tone = m.direction === 'down' ? 'bg-red-500/15 ring-1 ring-inset ring-red-500/20'
            : m.direction === 'up' ? 'bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/20'
            : 'bg-slate-700/40';
          return (
            <span
              key={i}
              title={SIDES[i]}
              className={`${CELL} ${tone} rounded-md py-1.5 font-mono font-semibold text-white text-[12px] sm:text-[13px] tabular-nums leading-none flex items-center justify-center gap-0.5`}
            >
              {formatOdds(p, format)}
              {m.direction === 'down' && <span className="text-red-400 text-[9px]">↓</span>}
              {m.direction === 'up' && <span className="text-emerald-400 text-[9px]">↑</span>}
            </span>
          );
        })}
      </div>

      <div className="hidden md:flex justify-center">
        {match.home_prob_spark && match.home_prob_spark.length >= 2
          ? <Sparkline values={match.home_prob_spark} width={88} height={24} color="auto" />
          : <span className="text-slate-600 text-xs">·</span>}
      </div>

      <div className="hidden md:block text-right">
        {mover && moverPct >= 0.5 ? (
          <span className={`inline-flex flex-col lg:flex-row-reverse lg:items-baseline lg:gap-1.5 items-end leading-tight font-mono tabular-nums ${big ? 'text-red-400' : 'text-slate-400'}`}>
            <span className={`font-bold ${big ? 'text-sm' : 'text-xs'}`}>↓{moverPct.toFixed(1)}%</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{moverName}</span>
          </span>
        ) : <span className="text-slate-600 text-xs">·</span>}
      </div>
    </Link>
  );
}
