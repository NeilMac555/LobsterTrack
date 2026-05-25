import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import type { MatchSummary } from '../types';
import { countryFlagImgUrl } from '../utils/countryFlags';
import Sparkline from './Sparkline';

/**
 * Tournament-shaped match card used for FIFA World Cup '26 fixtures.
 * Distinct from the league MatchCard because:
 *   • Two big flags flank a centred "vs" — the country IS the team
 *     identity in international football.
 *   • Opening / current odds sit directly under each flag so the
 *     reader can see "where the market priced this nation" without
 *     hunting through a row of pills.
 *   • The 'Home Trend' sparkline only appears within ~24h of KO,
 *     because pre-tournament cards otherwise show a flat 0.0pp line
 *     across every match for weeks.
 *   • Header surfaces a T-minus countdown instead of a redundant
 *     "WC" tag (the whole page is WC).
 */

interface Props {
  match: MatchSummary;
}

function formatCountdown(kickoff: Date): string {
  const ms = kickoff.getTime() - Date.now();
  if (ms < -2 * 60 * 60 * 1000) return 'FT';        // > 2h after KO — call it full-time
  if (ms < 0) return 'LIVE';
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `T-${Math.max(0, Math.floor(ms / 60_000))}m`;
  if (hours < 24) return `T-${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  return `T-${days}d`;
}

export default function WorldCupMatchCard({ match }: Props) {
  const kickoff = new Date(match.commence_time);
  const homeFlag = countryFlagImgUrl(match.home_team, 60);
  const awayFlag = countryFlagImgUrl(match.away_team, 60);

  const hoursToKO = (kickoff.getTime() - Date.now()) / (1000 * 60 * 60);
  // Sparkline shown whenever we have at least 2 data points. Even
  // pre-tournament Pinnacle moves the price subtly day-to-day, and
  // the sparkline anchors the card visually whether the move is
  // big or flat.
  const showSparkline =
    !!match.home_prob_spark && match.home_prob_spark.length >= 2;

  const countdown = formatCountdown(kickoff);
  const isImminent = hoursToKO < 6 && hoursToKO > -2;

  // Movement direction for accent border
  const home = match.current_home_odds;
  const openHome = match.opening_home_odds;
  const significantMove =
    home && openHome && Math.abs((home - openHome) / openHome) >= 0.05;

  return (
    <Link
      to={`/match/${match.id}`}
      className={`block bg-slate-800/80 rounded-xl border transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.99] p-4 sm:p-5 group ${
        isImminent
          ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10 hover:border-emerald-400/70'
          : significantMove
            ? 'border-amber-500/40 hover:border-amber-400/60'
            : 'border-slate-700/60 hover:border-amber-500/40'
      }`}
    >
      {/* Top strip — competition tag left, countdown right */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.14em] text-amber-400/70 font-semibold">
          FIFA World Cup &middot; {format(kickoff, 'd MMM')}
        </span>
        <span
          className={`text-[10px] font-mono font-bold tabular-nums px-2 py-0.5 rounded border ${
            isImminent
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          }`}
        >
          {countdown}
        </span>
      </div>

      {/* Matchup — three-column grid: home flag/name/odds, vs+draw, away flag/name/odds */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 mb-4">
        {/* HOME */}
        <div className="flex flex-col items-center text-center min-w-0">
          {homeFlag ? (
            <img
              src={homeFlag}
              alt=""
              className="h-10 sm:h-11 w-auto rounded-sm shadow-md mb-2"
              loading="lazy"
            />
          ) : (
            <div className="h-10 sm:h-11 w-14 rounded-sm bg-slate-700/50 mb-2" />
          )}
          <span className="text-white font-bold text-xs sm:text-sm tracking-tight truncate w-full px-1">
            {match.home_team}
          </span>
          <span className="text-xl sm:text-2xl font-mono font-bold tabular-nums text-emerald-400 mt-1">
            {match.current_home_odds?.toFixed(2) ?? '—'}
          </span>
        </div>

        {/* CENTRE — vs + kickoff time + draw price */}
        <div className="flex flex-col items-center text-center min-w-[64px]">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 font-semibold">
            vs
          </span>
          <span className="text-base sm:text-lg font-mono font-bold tabular-nums text-white mt-1">
            {format(kickoff, 'HH:mm')}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">
            UTC
          </span>
          <div className="mt-3 px-2 py-1 rounded bg-slate-900/60 border border-slate-700/50">
            <span className="text-[9px] font-mono uppercase tracking-wider text-amber-400/80 block">
              draw
            </span>
            <span className="text-sm font-mono font-bold tabular-nums text-amber-300">
              {match.current_draw_odds?.toFixed(2) ?? '—'}
            </span>
          </div>
        </div>

        {/* AWAY */}
        <div className="flex flex-col items-center text-center min-w-0">
          {awayFlag ? (
            <img
              src={awayFlag}
              alt=""
              className="h-10 sm:h-11 w-auto rounded-sm shadow-md mb-2"
              loading="lazy"
            />
          ) : (
            <div className="h-10 sm:h-11 w-14 rounded-sm bg-slate-700/50 mb-2" />
          )}
          <span className="text-white font-bold text-xs sm:text-sm tracking-tight truncate w-full px-1">
            {match.away_team}
          </span>
          <span className="text-xl sm:text-2xl font-mono font-bold tabular-nums text-red-400 mt-1">
            {match.current_away_odds?.toFixed(2) ?? '—'}
          </span>
        </div>
      </div>

      {/* Optional sparkline — only when KO is close and we have data */}
      {showSparkline && (
        <div className="flex items-center gap-3 pt-3 border-t border-slate-700/40">
          <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">
            Home Trend
          </span>
          <div className="flex-1 min-w-0 flex items-center">
            <Sparkline
              values={match.home_prob_spark!}
              width={140}
              height={26}
              color="auto"
            />
          </div>
          <span
            className={`text-[10px] font-mono font-bold tabular-nums ${(() => {
              const d =
                match.home_prob_spark![match.home_prob_spark!.length - 1] -
                match.home_prob_spark![0];
              if (d > 0.15) return 'text-emerald-400';
              if (d < -0.15) return 'text-red-400';
              return 'text-slate-400';
            })()}`}
          >
            {(() => {
              const d =
                match.home_prob_spark![match.home_prob_spark!.length - 1] -
                match.home_prob_spark![0];
              const arrow = d > 0.15 ? '↑' : d < -0.15 ? '↓' : '·';
              return `${arrow} ${Math.abs(d).toFixed(1)}pp`;
            })()}
          </span>
        </div>
      )}
    </Link>
  );
}
