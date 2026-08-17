import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBiggestMovers } from '../api';
import type { BiggestMover } from '../types';
import { LEAGUE_CONFIG } from '../types';
import { countryFlagImgUrl } from '../utils/countryFlags';
import { useOddsFormat } from '../contexts/OddsFormatContext';
import { formatOdds } from '../utils/odds';

/**
 * Live ticker — a thin, always-scrolling horizontal bar showing the
 * biggest odds movers across all tracked leagues. Sits just under the
 * main navigation. Pauses on hover so users can read a move before
 * it scrolls off. Completely self-contained — if the API is down or
 * returns nothing, the ticker hides itself rather than rendering an
 * empty bar.
 */
export default function LiveTicker() {
  const { format } = useOddsFormat();
  const [movers, setMovers] = useState<BiggestMover[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await getBiggestMovers(40);
        if (alive) setMovers(data);
      } catch {
        if (alive) setMovers([]);
      }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (movers.length === 0) return null;

  const outcomeLabel = (m: BiggestMover): string => {
    if (m.market === '1x2') {
      return m.outcome === 'home' ? '1' : m.outcome === 'draw' ? 'X' : '2';
    }
    if (m.market === 'totals') return m.outcome === 'over' ? 'O' : 'U';
    return 'AH';
  };

  const teamAbbr = (name: string): string => {
    // Fallback abbreviator for countries we haven't flag-mapped yet.
    // Three-letter ISO-style: take first letters of 2-3 biggest words,
    // otherwise first 3 chars. Keeps the ticker compact.
    const words = name.split(/\s+/).filter(w => w.length > 1);
    if (words.length >= 2) {
      return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
    }
    return name.slice(0, 3).toUpperCase();
  };

  // Render a country flag image if we have one mapped, otherwise a
  // three-letter abbreviation. Images come from flagcdn.com which
  // renders reliably across every browser including Windows Chrome
  // (where Unicode flag emoji don't render).
  const renderTeamLabel = (name: string) => {
    const url = countryFlagImgUrl(name, 20);
    if (url) {
      return (
        <img
          src={url}
          alt={name}
          className="h-3.5 w-auto rounded-sm inline-block align-middle"
          loading="lazy"
        />
      );
    }
    return (
      <span className="text-xs font-semibold text-slate-200">
        {teamAbbr(name)}
      </span>
    );
  };

  // Duplicate the list so the CSS animation can loop seamlessly.
  const loop = [...movers, ...movers];

  return (
    <div className="w-full bg-slate-900/95 border-b border-slate-700/60 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-3">
        {/* Static "LIVE" pill on the left */}
        <div className="flex items-center gap-1.5 flex-shrink-0 py-1.5 pr-3 border-r border-slate-700/60">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-slate-400">
            Live
          </span>
        </div>

        {/* Scrolling track — fades at both edges via mask-image */}
        <div
          className="flex-1 overflow-hidden"
          style={{
            maskImage: 'linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%)',
          }}
        >
          <div className="ticker-track flex items-center gap-8 py-1.5 whitespace-nowrap will-change-transform">
            {loop.map((m, i) => {
              const isShortening = m.direction === 'down';
              const moveColor = isShortening ? 'text-emerald-400' : 'text-red-400';
              const arrow = isShortening ? '↓' : '↑';
              const leagueInfo = LEAGUE_CONFIG[m.sport_key];
              return (
                <Link
                  key={`${m.match_id}-${m.outcome}-${i}`}
                  to={`/match/${m.match_id}`}
                  className="inline-flex items-center gap-2 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
                  title={`${m.home_team} vs ${m.away_team} — ${m.outcome_name}`}
                >
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                    {leagueInfo?.shortName || ''}
                  </span>
                  {/* Country flags for the two nations (img tags from
                      flagcdn.com so they render on Windows). Falls
                      back to 3-letter abbreviation for any country
                      not yet in the flag map. */}
                  {renderTeamLabel(m.home_team)}
                  <span className="text-slate-500 text-xs">v</span>
                  {renderTeamLabel(m.away_team)}
                  <span className="text-[10px] font-mono font-bold text-slate-400 px-1 rounded bg-slate-800 border border-slate-700">
                    {outcomeLabel(m)}
                  </span>
                  <span className="text-xs font-mono font-bold tabular-nums text-white">
                    {formatOdds(m.current_odds, format)}
                  </span>
                  <span className={`text-xs font-mono font-bold tabular-nums ${moveColor}`}>
                    {arrow}
                    {Math.abs(m.movement_percent).toFixed(1)}%
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
