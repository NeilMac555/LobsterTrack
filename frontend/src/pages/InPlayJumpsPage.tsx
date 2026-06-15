import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { getLateSteam } from '../api';
import type { LateSteamResponse, LateSteamMove, LateSteamSide } from '../types';
import { countryFlagImgUrl } from '../utils/countryFlags';

type SortField = 'pp' | 'commence_time';

function ppColor(pp: number | null): string {
  if (pp === null) return 'text-slate-500';
  if (pp >= 1) return 'text-emerald-400';
  if (pp <= -1) return 'text-red-400';
  return 'text-slate-400';
}

function fmtPP(pp: number | null): string {
  if (pp === null || pp === undefined) return '—';
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(2)}pp`;
}

function fmtOdds(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(2);
}

function fmtLine(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v}`;
}

function fmtLineMove(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return '';
  const sign = v > 0 ? '+' : '';
  return ` (${sign}${v})`;
}

/** A market-level read on what the sharps actually did. When the line
 *  shifted, the direction of the line shift is the true sharp side —
 *  the price-pp delta becomes a measurement artifact because we're
 *  comparing two different markets (e.g. Under 2.0 vs Under 2.25 are
 *  different bets). Pinnacle's convention is to move TOWARD the sharp
 *  side: line UP on totals = sharps backed Over; AH line moving toward
 *  home (more negative for home favourite, smaller for home dog) =
 *  sharps backed home. */
type SharpRead = {
  market: 'AH' | 'TOT';
  side: LateSteamSide;
  /** Magnitude of the move, in pp. Always positive. */
  magnitude: number;
  /** True when the line itself shifted ≥0.25 — the strongest signal. */
  lineShifted: boolean;
};

const LINE_THRESHOLD = 0.25;

function sharpReadAH(m: LateSteamMove): SharpRead | null {
  const ah = m.asian_handicap;
  if (!ah) return null;
  const lineMove = ah.line_move ?? 0;
  if (Math.abs(lineMove) >= LINE_THRESHOLD) {
    // Negative line move = handicap shifted toward home (e.g. -2 → -2.25
    // OR +2 → +1.75 both = lineMove of -0.25). Positive = toward away.
    const side: LateSteamSide = lineMove < 0 ? 'ah_home' : 'ah_away';
    // Use the bigger absolute price-pp delta as the magnitude proxy so
    // matches stay sortable.
    const mag = Math.max(Math.abs(ah.home_pp ?? 0), Math.abs(ah.away_pp ?? 0));
    return { market: 'AH', side, magnitude: mag, lineShifted: true };
  }
  // No line shift — pp delta sign tells the story directly.
  const home = ah.home_pp ?? 0;
  const away = ah.away_pp ?? 0;
  // Positive pp = price shortened = sharps backed that side.
  const homeStrength = home;
  const awayStrength = away;
  if (homeStrength >= awayStrength) {
    if (homeStrength <= 0) return null;
    return { market: 'AH', side: 'ah_home', magnitude: homeStrength, lineShifted: false };
  }
  if (awayStrength <= 0) return null;
  return { market: 'AH', side: 'ah_away', magnitude: awayStrength, lineShifted: false };
}

function sharpReadTotals(m: LateSteamMove): SharpRead | null {
  const to = m.totals;
  if (!to) return null;
  const lineMove = to.line_move ?? 0;
  if (Math.abs(lineMove) >= LINE_THRESHOLD) {
    // Line UP = sharps on Over. Line DOWN = sharps on Under.
    const side: LateSteamSide = lineMove > 0 ? 'totals_over' : 'totals_under';
    const mag = Math.max(Math.abs(to.over_pp ?? 0), Math.abs(to.under_pp ?? 0));
    return { market: 'TOT', side, magnitude: mag, lineShifted: true };
  }
  const over = to.over_pp ?? 0;
  const under = to.under_pp ?? 0;
  if (over >= under) {
    if (over <= 0) return null;
    return { market: 'TOT', side: 'totals_over', magnitude: over, lineShifted: false };
  }
  if (under <= 0) return null;
  return { market: 'TOT', side: 'totals_under', magnitude: under, lineShifted: false };
}

/** The strongest sharp read across both markets, line-shift aware. */
function biggestSharpRead(m: LateSteamMove): SharpRead | null {
  const ah = sharpReadAH(m);
  const to = sharpReadTotals(m);
  if (!ah && !to) return null;
  if (!ah) return to;
  if (!to) return ah;
  // Line shifts always win over price-only moves regardless of magnitude.
  if (ah.lineShifted && !to.lineShifted) return ah;
  if (to.lineShifted && !ah.lineShifted) return to;
  return ah.magnitude >= to.magnitude ? ah : to;
}

function sideLabelWithLine(side: LateSteamSide, m: LateSteamMove): string {
  if (side === 'ah_home') {
    const line = m.asian_handicap?.close_line;
    return `${m.home_team} ${line != null ? fmtLine(line) : ''}`.trim();
  }
  if (side === 'ah_away') {
    const line = m.asian_handicap?.close_line;
    // Away line is the inverse of home's line.
    const awayLine = line != null ? -line : null;
    return `${m.away_team} ${awayLine != null ? fmtLine(awayLine) : ''}`.trim();
  }
  if (side === 'totals_over') {
    const line = m.totals?.close_line;
    return `Over ${line ?? ''}`.trim();
  }
  // totals_under
  const line = m.totals?.close_line;
  return `Under ${line ?? ''}`.trim();
}

/** Plain-English explanation of what the market did in the run-up to
 *  kick-off. Tells the user which side the sharp money was on and
 *  whether Pinnacle had to move the line to keep up. */
function narrative(m: LateSteamMove, windowMinutes: number): string {
  const ahRead = sharpReadAH(m);
  const toRead = sharpReadTotals(m);
  const parts: string[] = [];

  if (ahRead) {
    const ah = m.asian_handicap!;
    if (ahRead.lineShifted) {
      const team = ahRead.side === 'ah_home' ? m.home_team : m.away_team;
      parts.push(
        `Sharps backed ${team} on the handicap — Pinnacle shifted the line from ${fmtLine(ah.early_line)} to ${fmtLine(ah.close_line)}.`
      );
    } else {
      const team = ahRead.side === 'ah_home' ? m.home_team : m.away_team;
      const line = ah.close_line;
      parts.push(
        `Money came in on ${team} ${line != null ? fmtLine(line) : ''} — price shortened ${ahRead.magnitude.toFixed(1)}pp with no line change.`
      );
    }
  }

  if (toRead) {
    const to = m.totals!;
    if (toRead.lineShifted) {
      const sideWord = toRead.side === 'totals_over' ? 'Over' : 'Under';
      parts.push(
        `Sharps hammered ${sideWord} — Pinnacle pushed the totals line from ${to.early_line} to ${to.close_line}.`
      );
    } else {
      const sideWord = toRead.side === 'totals_over' ? 'Over' : 'Under';
      parts.push(
        `Money came in on ${sideWord} ${to.close_line} — price shortened ${toRead.magnitude.toFixed(1)}pp with no line change.`
      );
    }
  }

  if (parts.length === 0) {
    return `Quiet market — no significant sharp action in the final ${windowMinutes} minutes before kick-off.`;
  }

  return parts.join(' ');
}

export default function InPlayJumpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const days = parseInt(searchParams.get('days') || '7', 10);
  const windowMinutes = parseInt(searchParams.get('window') || '30', 10);
  const minPP = parseFloat(searchParams.get('min') || '1.5');
  const upcoming = searchParams.get('upcoming') === '1';
  const sortField = (searchParams.get('sort') as SortField) || 'pp';

  const [data, setData] = useState<LateSteamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getLateSteam({
      league: 'soccer_fifa_world_cup',
      days,
      window_minutes: windowMinutes,
      min_delta_pp: minPP,
      upcoming,
      limit: 100,
    })
      .then((res) => {
        if (!alive) return;
        setData(res);
      })
      .catch(() => alive && setError('Failed to load late steam moves.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days, windowMinutes, minPP, upcoming]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const sortedMoves = useMemo(() => {
    if (!data) return [];
    const arr = [...data.moves];
    if (sortField === 'pp') {
      // Sort by line-shift-aware magnitude — matches with line shifts
      // float to the top above price-only moves of equal size.
      arr.sort((a, b) => {
        const ra = biggestSharpRead(a);
        const rb = biggestSharpRead(b);
        const aShift = ra?.lineShifted ? 1 : 0;
        const bShift = rb?.lineShifted ? 1 : 0;
        if (aShift !== bShift) return bShift - aShift;
        return (rb?.magnitude ?? 0) - (ra?.magnitude ?? 0);
      });
    } else {
      arr.sort((a, b) => new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime());
    }
    return arr;
  }, [data, sortField]);

  return (
    <div>
      <Helmet>
        <title>Late Pinnacle Steam — SteamWatch</title>
        <meta name="description" content="World Cup Asian Handicap and Totals moves on Pinnacle in the final 30 minutes before kick-off. Sharp money signals that move the closing line." />
        <link rel="canonical" href="https://www.steamwatch.io/in-play-jumps" />
      </Helmet>

      {/* Page header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-8 sm:h-10 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 flex-shrink-0" />
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Late Pinnacle Steam</h1>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber-400/50 bg-amber-500/15 text-amber-300 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.16em] font-bold animate-pulse"
                title="This feature is in beta — signal under evaluation, sample sizes are small."
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-300" />
                </span>
                Beta
              </span>
            </div>
            <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
              World Cup &middot; Final {windowMinutes} min pre-KO &middot; Asian Handicap + Totals &middot; Pinnacle
            </p>
          </div>
        </div>
      </div>

      {/* Methodology */}
      <div className="mb-4 sm:mb-6 bg-slate-800/60 rounded-xl border border-slate-700/60 overflow-hidden">
        <button
          onClick={() => setMethodologyOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-slate-700/20 transition-colors text-left"
          aria-expanded={methodologyOpen}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">i</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-slate-300 font-semibold">
              How this works
            </span>
          </div>
          <svg className={`w-4 h-4 text-slate-500 transition-transform ${methodologyOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {methodologyOpen && (
          <div className="border-t border-slate-700/50 px-4 sm:px-5 py-3 sm:py-4 text-[12px] sm:text-sm text-slate-300 leading-relaxed space-y-2">
            <p>
              Pinnacle's <strong className="text-white">Asian Handicap</strong> and <strong className="text-white">Totals</strong> closing lines are universally treated as the true line in soccer. Anything that moves them in the last half-hour before kick-off is sharp money — recreational bettors have long since locked in.
            </p>
            <p>
              For each World Cup match, we compare Pinnacle's snapshot at T-{windowMinutes} min against the final snapshot just before kick-off. We surface both <strong className="text-amber-300">price moves</strong> (implied-prob shift on either side, in pp) and <strong className="text-amber-300">line moves</strong> (e.g. AH -2.5 → -2.75, Totals 3.5 → 3.25).
            </p>
            <p>
              A line move is the stronger signal — Pinnacle won't reshape the line itself without one side getting hammered. Matches with a line move are flagged with <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono font-bold uppercase tracking-wider align-middle">LINE</span>.
            </p>
            <p className="text-slate-500 text-[11px]">
              Why pre-KO not in-play? The Odds API drops matches from the pre-game feed at T+0, so genuine in-play Asian markets aren't on our current data plan. The final pre-KO window is where the sharp action lives anyway — and it's still actionable on soft books that hold their lines longer.
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 sm:mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div>
          <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
            Window
          </label>
          <select
            value={windowMinutes}
            onChange={(e) => setParam('window', e.target.value === '30' ? null : e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-md px-2.5 py-1.5 text-xs sm:text-sm text-white font-mono"
          >
            <option value="10">Last 10 min</option>
            <option value="15">Last 15 min</option>
            <option value="30">Last 30 min</option>
            <option value="60">Last 60 min</option>
            <option value="120">Last 2 h</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
            Days back
          </label>
          <select
            value={days}
            onChange={(e) => setParam('days', e.target.value === '7' ? null : e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-md px-2.5 py-1.5 text-xs sm:text-sm text-white font-mono"
          >
            <option value="1">Last 24h</option>
            <option value="3">Last 3 days</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
            Min move: <span className="text-amber-300 tabular-nums">{minPP.toFixed(1)}pp</span>
          </label>
          <input
            type="range"
            min={0}
            max={10}
            step={0.25}
            value={minPP}
            onChange={(e) => setParam('min', e.target.value === '1.5' ? null : e.target.value)}
            className="w-full accent-amber-500"
          />
        </div>
        <div>
          <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
            Mode
          </label>
          <button
            onClick={() => setParam('upcoming', upcoming ? null : '1')}
            className={`w-full px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
              upcoming
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-700/60 hover:text-white'
            }`}
            title={upcoming ? 'Showing in-progress moves on matches about to kick off' : 'Showing finished matches'}
          >
            {upcoming ? 'Live now' : 'Past'}
          </button>
        </div>
      </div>

      {/* Coverage strip */}
      {data && (
        <div className="mb-4 sm:mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Matches seen</div>
            <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white leading-none mt-1.5">{data.matches_seen}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-1">{upcoming ? 'about to kick off' : `in last ${data.days_back}d`}</div>
          </div>
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">With AH data</div>
            <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white leading-none mt-1.5">{data.matches_with_ah}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-1">2+ AH snapshots in window</div>
          </div>
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">With Totals data</div>
            <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white leading-none mt-1.5">{data.matches_with_totals}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-1">2+ Totals snapshots in window</div>
          </div>
          <div className="bg-slate-800/80 rounded-xl border border-amber-500/30 px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-amber-400/80 font-semibold">Above threshold</div>
            <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-amber-300 leading-none mt-1.5">{data.matches_with_steam}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-1">≥ {minPP.toFixed(1)}pp move</div>
          </div>
        </div>
      )}

      {/* Sort toggle */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Sort:</span>
        <button
          onClick={() => setParam('sort', null)}
          className={`px-2.5 py-1 rounded font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
            sortField === 'pp'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-800/60'
          }`}
        >
          Biggest move
        </button>
        <button
          onClick={() => setParam('sort', 'commence_time')}
          className={`px-2.5 py-1 rounded font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
            sortField === 'commence_time'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-800/60'
          }`}
        >
          Most recent
        </button>
      </div>

      {/* Body */}
      {loading && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
          <p className="text-slate-400">Loading late steam…</p>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      )}
      {!loading && !error && sortedMoves.length === 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center space-y-2">
          <p className="text-slate-300 font-semibold">No late steam yet.</p>
          <p className="text-slate-500 text-sm">
            {upcoming
              ? 'No matches kicking off within the next window. Switch to Past to see finished matches.'
              : `Need at least 2 snapshots in the final ${windowMinutes} min for a match to qualify, and a move of ≥${minPP.toFixed(1)}pp on either side of AH or Totals. Try widening the window or lowering the threshold.`}
          </p>
        </div>
      )}
      {!loading && !error && sortedMoves.length > 0 && (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-900/60 border-b border-slate-700/60">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Match</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">{upcoming ? 'KO in' : 'Kicked off'}</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Asian Handicap</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Totals</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Biggest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {sortedMoves.map((m) => <DesktopRow key={m.match_id} m={m} upcoming={upcoming} windowMinutes={windowMinutes} />)}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-700/40">
            {sortedMoves.map((m) => <MobileCard key={m.match_id} m={m} upcoming={upcoming} windowMinutes={windowMinutes} />)}
          </div>

          {/* Footer */}
          <div className="px-3 sm:px-4 py-2 border-t border-slate-700/40 bg-slate-900/40 text-[10px] font-mono uppercase tracking-wider text-slate-500">
            {sortedMoves.length} match{sortedMoves.length === 1 ? '' : 'es'} · window: final {data?.window_minutes} min pre-KO · Pinnacle
          </div>
        </div>
      )}
    </div>
  );
}

function MatchHeading({ m }: { m: LateSteamMove }) {
  const hf = countryFlagImgUrl(m.home_team, 20);
  const af = countryFlagImgUrl(m.away_team, 20);
  return (
    <Link to={`/match/${m.match_id}`} className="flex items-center gap-2 font-semibold text-white hover:text-amber-300 transition-colors">
      {hf && <img src={hf} alt="" className="h-3.5 w-auto rounded-sm" loading="lazy" />}
      <span>{m.home_team}</span>
      <span className="text-slate-500 font-normal text-[11px]">v</span>
      {af && <img src={af} alt="" className="h-3.5 w-auto rounded-sm" loading="lazy" />}
      <span>{m.away_team}</span>
      {m.line_moved && (
        <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono font-bold uppercase tracking-wider">
          line
        </span>
      )}
    </Link>
  );
}

function AHCell({ m }: { m: LateSteamMove }) {
  const ah = m.asian_handicap;
  if (!ah) return <span className="text-slate-600 text-xs">—</span>;
  return (
    <div className="font-mono text-[11px] leading-tight">
      <div className="text-slate-300">
        Home {fmtLine(ah.close_line)}<span className="text-slate-500">{fmtLineMove(ah.line_move)}</span>
      </div>
      <div className="flex gap-2 mt-0.5">
        <span className="text-slate-400">
          H {fmtOdds(ah.early_home_odds)} <span className="text-slate-600">→</span> {fmtOdds(ah.close_home_odds)}
          <span className={`ml-1 ${ppColor(ah.home_pp)}`}>{fmtPP(ah.home_pp)}</span>
        </span>
      </div>
      <div className="flex gap-2">
        <span className="text-slate-400">
          A {fmtOdds(ah.early_away_odds)} <span className="text-slate-600">→</span> {fmtOdds(ah.close_away_odds)}
          <span className={`ml-1 ${ppColor(ah.away_pp)}`}>{fmtPP(ah.away_pp)}</span>
        </span>
      </div>
    </div>
  );
}

function TotalsCell({ m }: { m: LateSteamMove }) {
  const to = m.totals;
  if (!to) return <span className="text-slate-600 text-xs">—</span>;
  return (
    <div className="font-mono text-[11px] leading-tight">
      <div className="text-slate-300">
        Total {to.close_line}<span className="text-slate-500">{fmtLineMove(to.line_move)}</span>
      </div>
      <div className="flex gap-2 mt-0.5">
        <span className="text-slate-400">
          O {fmtOdds(to.early_over_odds)} <span className="text-slate-600">→</span> {fmtOdds(to.close_over_odds)}
          <span className={`ml-1 ${ppColor(to.over_pp)}`}>{fmtPP(to.over_pp)}</span>
        </span>
      </div>
      <div className="flex gap-2">
        <span className="text-slate-400">
          U {fmtOdds(to.early_under_odds)} <span className="text-slate-600">→</span> {fmtOdds(to.close_under_odds)}
          <span className={`ml-1 ${ppColor(to.under_pp)}`}>{fmtPP(to.under_pp)}</span>
        </span>
      </div>
    </div>
  );
}

function DesktopRow({ m, upcoming, windowMinutes }: { m: LateSteamMove; upcoming: boolean; windowMinutes: number }) {
  const ko = new Date(m.commence_time);
  const koLabel = upcoming
    ? formatKOIn(ko)
    : format(ko, 'EEE d MMM HH:mm');
  const read = biggestSharpRead(m);
  const story = narrative(m, windowMinutes);
  return (
    <>
      <tr className="hover:bg-slate-700/15 transition-colors align-top">
        <td className="px-3 pt-2.5 pb-1"><MatchHeading m={m} /></td>
        <td className="px-3 pt-2.5 pb-1 font-mono text-[11px] text-slate-400 tabular-nums">{koLabel}</td>
        <td className="px-3 pt-2.5 pb-1"><AHCell m={m} /></td>
        <td className="px-3 pt-2.5 pb-1"><TotalsCell m={m} /></td>
        <td className="px-3 pt-2.5 pb-1 text-right whitespace-nowrap">
          {read ? (
            <>
              <div className="font-mono tabular-nums font-bold text-emerald-400">
                {read.magnitude.toFixed(1)}pp{read.lineShifted ? ' ⚡' : ''}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">
                {sideLabelWithLine(read.side, m)}
              </div>
            </>
          ) : (
            <div className="text-slate-600 text-xs">—</div>
          )}
        </td>
      </tr>
      <tr className="hover:bg-slate-700/15 transition-colors">
        <td colSpan={5} className="px-3 pb-3 pt-1 text-[11px] sm:text-xs text-slate-400 italic leading-relaxed">
          {story}
        </td>
      </tr>
    </>
  );
}

function MobileCard({ m, upcoming, windowMinutes }: { m: LateSteamMove; upcoming: boolean; windowMinutes: number }) {
  const ko = new Date(m.commence_time);
  const koLabel = upcoming ? formatKOIn(ko) : format(ko, 'EEE d MMM HH:mm');
  const read = biggestSharpRead(m);
  const story = narrative(m, windowMinutes);
  return (
    <Link to={`/match/${m.match_id}`} className="block p-3 hover:bg-slate-700/15 transition-colors">
      <div className="flex items-center justify-between gap-3 mb-2">
        <MatchHeading m={m} />
        {read && (
          <div className="font-mono tabular-nums font-bold text-sm whitespace-nowrap text-emerald-400">
            {read.magnitude.toFixed(1)}pp{read.lineShifted ? ' ⚡' : ''}
            <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 text-right">
              {sideLabelWithLine(read.side, m)}
            </div>
          </div>
        )}
      </div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">{koLabel}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1">AH</div>
          <AHCell m={m} />
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1">Totals</div>
          <TotalsCell m={m} />
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-slate-700/40 text-[11px] text-slate-400 italic leading-relaxed">
        {story}
      </div>
    </Link>
  );
}

function formatKOIn(ko: Date): string {
  const mins = Math.round((ko.getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `in ${hrs}h` : `in ${hrs}h ${rem}m`;
}
