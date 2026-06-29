import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { getInPlayJumps } from '../api';
import type { InPlayJump, InPlayJumpsResponse, InPlayJumpOutcome } from '../types';
import { countryFlagImgUrl } from '../utils/countryFlags';
import Bet105Button from '../components/Bet105Button';

type SortField = 'gap' | 'commence_time';

function gapColor(pp: number | null): string {
  if (pp === null) return 'text-slate-500';
  if (pp >= 3) return 'text-emerald-400';
  if (pp <= -3) return 'text-red-400';
  if (pp >= 1) return 'text-emerald-300/80';
  if (pp <= -1) return 'text-red-300/80';
  return 'text-slate-400';
}

function fmtPP(pp: number | null | undefined): string {
  if (pp === null || pp === undefined) return '—';
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(1)}pp`;
}

function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—';
  return `${(p * 100).toFixed(1)}%`;
}

function fmtOdds(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(2);
}

function outcomeLabel(outcome: InPlayJumpOutcome, m: InPlayJump): string {
  switch (outcome) {
    case 'home': return m.home_team;
    case 'away': return m.away_team;
    case 'draw': return 'Draw';
    default: return outcome;
  }
}

/** Plain-English narrative explaining the manipulation→correction
 *  pattern for a given match's biggest gap. */
function narrative(m: InPlayJump): string {
  const gap = m.biggest_gap_pp;
  const absGap = Math.abs(gap);
  const outcome = m.biggest_outcome;
  const sideLabel = outcomeLabel(outcome, m);
  const direction = gap > 0 ? 'higher' : 'lower';
  const pinPct = (() => {
    if (outcome === 'home') return m.pinnacle_close.home_implied;
    if (outcome === 'draw') return m.pinnacle_close.draw_implied;
    return m.pinnacle_close.away_implied;
  })();
  const pmPct = (() => {
    if (outcome === 'home') return m.polymarket_inplay.home_yes;
    if (outcome === 'draw') return m.polymarket_inplay.draw_yes;
    return m.polymarket_inplay.away_yes;
  })();

  const pinStr = pinPct != null ? `${(pinPct * 100).toFixed(1)}%` : '—';
  const pmStr = pmPct != null ? `${(pmPct * 100).toFixed(1)}%` : '—';
  const baseFact = `Pinnacle closed ${sideLabel} at ${pinStr} implied. Polymarket priced it ${direction} at ${pmStr} once trading opened at T+${m.anchor_minutes_in}min — a ${absGap.toFixed(1)}pp gap.`;

  // Calibrated tiers — below 3pp the gap is within Pinnacle's margin + Polymarket's
  // spread (combined ~2-3pp noise floor), so we don't claim a sharp footprint. Above
  // 6pp the gap is clearly outside noise and the manipulation read is confident.
  // Middle tier is honest about the slight lean without overclaiming.
  if (absGap < 3) {
    return `${baseFact} Within market noise — no clear sharp footprint.`;
  }
  if (absGap < 6) {
    const lean = gap > 0 ? `toward ${sideLabel}` : `against ${sideLabel}`;
    return `${baseFact} Modest in-play lean ${lean} — not conclusive, but real.`;
  }
  if (gap > 0) {
    return `${baseFact} Sharp money was on ${sideLabel}; Pinnacle's close was held off-true.`;
  }
  return `${baseFact} Sharp money was AGAINST ${sideLabel}; Pinnacle's close held it too short.`;
}

export default function InPlayJumpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const days = parseInt(searchParams.get('days') || '7', 10);
  const includeEarly = searchParams.get('show_eg') === '1';
  const sortField = (searchParams.get('sort') as SortField) || 'gap';

  const [data, setData] = useState<InPlayJumpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getInPlayJumps({
      league: 'soccer_fifa_world_cup',
      days,
      min_delta_pp: 0,
      include_early_goals: includeEarly,
      limit: 100,
    })
      .then((res) => {
        if (!alive) return;
        setData(res);
      })
      .catch(() => alive && setError('Failed to load in-play jumps.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days, includeEarly]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const sortedJumps = useMemo(() => {
    if (!data) return [];
    const arr = [...data.jumps];
    if (sortField === 'gap') {
      arr.sort((a, b) => Math.abs(b.biggest_gap_pp) - Math.abs(a.biggest_gap_pp));
    } else {
      arr.sort((a, b) => new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime());
    }
    return arr;
  }, [data, sortField]);

  return (
    <div>
      <Helmet>
        <title>In-Play Jumps — SteamWatch</title>
        <meta name="description" content="The gap between Pinnacle's closing line and Polymarket's first 5 minutes of in-play. Catches sharp-money manipulation of the close." />
        <link rel="canonical" href="https://www.steamwatch.io/in-play-jumps" />
      </Helmet>

      {/* Header */}
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
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">In-Play Jumps</h1>
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
              World Cup &middot; Pinnacle close &rarr; Polymarket T+5 in-play
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 sm:mb-6">
        <Bet105Button variant="full" location="in-play-jumps" />
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
              Sharps now manipulate Pinnacle's closing line to get better in-play fills. The closing
              line gets pushed off the true number (retail piles in on the wrong side), then sharps
              hammer <strong className="text-white">Polymarket</strong> in the first 5–10 minutes
              of in-play, where the price corrects. The gap between Pinnacle's close and
              Polymarket's first in-play price IS the signal.
            </p>
            <p>
              For each WC match we compare Pinnacle's closing implied probability against
              Polymarket's first in-play snapshot at <strong className="text-amber-300">T+5 min</strong>.
              Both expressed in pp on a 0–100 scale. Headline = the outcome with the biggest
              absolute gap.
            </p>
            <p>
              <strong className="text-amber-300">Matches with early goals are filtered out by default.</strong>
              The price reaction in those is to a goal, not to the manipulation→correction
              pattern we want. Anchors later than T+10 are also filtered — by then in-game
              state contaminates the signal.
            </p>
            <p className="text-slate-500 text-[11px]">
              Pinnacle implied prob is raw (1/decimal odds, includes book margin). Polymarket
              YES is the dollar-cent probability. Both are on the same 0–100 scale so the
              gap is meaningful even without de-vig — typical noise floor is ~2pp.
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 sm:mb-6 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
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
        <div>
          <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
            Early goals
          </label>
          <button
            onClick={() => setParam('show_eg', includeEarly ? null : '1')}
            className={`w-full px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
              includeEarly
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-700/60 hover:text-white'
            }`}
          >
            {includeEarly ? 'Showing' : 'Hidden'}
          </button>
        </div>
      </div>

      {/* Coverage strip */}
      {data && (
        <div className="mb-4 sm:mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <CoverageBox label="Matches seen" value={data.matches_seen} sub={`in last ${data.days_back}d`} />
          <CoverageBox label="With Pin close" value={data.matches_with_close} sub="closing line captured" />
          <CoverageBox label="With PM T+5" value={data.matches_with_inplay} sub="Polymarket anchor" />
          <CoverageBox label="With a gap" value={data.matches_with_jumps} sub="any movement" highlight />
        </div>
      )}

      {/* Sort toggle */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Sort:</span>
        <SortButton active={sortField === 'gap'} onClick={() => setParam('sort', null)}>Biggest gap</SortButton>
        <SortButton active={sortField === 'commence_time'} onClick={() => setParam('sort', 'commence_time')}>Most recent</SortButton>
      </div>

      {/* Body */}
      {loading && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
          <p className="text-slate-400">Loading in-play jumps…</p>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      )}
      {!loading && !error && sortedJumps.length === 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center space-y-2">
          <p className="text-slate-300 font-semibold">No jumps yet.</p>
          <p className="text-slate-500 text-sm">
            Each match needs both a Pinnacle closing line AND a Polymarket snapshot captured between T+5 and T+10 min after kickoff.
            {data && data.matches_with_inplay > 0
              ? ` ${data.matches_with_inplay} matches have both — but no gap data to display.`
              : ' First clean signal lands shortly after the next WC kickoff.'}
          </p>
        </div>
      )}
      {!loading && !error && sortedJumps.length > 0 && (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-900/60 border-b border-slate-700/60">
                <tr>
                  <Th>Match</Th>
                  <Th>Kicked off</Th>
                  <Th align="right">Pinnacle close</Th>
                  <Th align="right">Polymarket T+5</Th>
                  <Th align="right">Gap</Th>
                  <Th align="right">Biggest</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {sortedJumps.map((j) => <DesktopRow key={j.match_id} m={j} />)}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-700/40">
            {sortedJumps.map((j) => <MobileCard key={j.match_id} m={j} />)}
          </div>

          {/* Footer */}
          <div className="px-3 sm:px-4 py-2 border-t border-slate-700/40 bg-slate-900/40 text-[10px] font-mono uppercase tracking-wider text-slate-500">
            {sortedJumps.length} match{sortedJumps.length === 1 ? '' : 'es'} · anchor: first PM snap at T+{data?.inplay_anchor_min}…T+{data?.max_anchor_min} min · {includeEarly ? 'including' : 'excluding'} early goals
          </div>
        </div>
      )}
    </div>
  );
}

function CoverageBox({ label, value, sub, highlight }: { label: string; value: number; sub: string; highlight?: boolean }) {
  return (
    <div className={`bg-slate-800/80 rounded-xl border px-3 sm:px-4 py-2.5 sm:py-3 ${highlight ? 'border-amber-500/30' : 'border-slate-700/60'}`}>
      <div className={`text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] font-semibold ${highlight ? 'text-amber-400/80' : 'text-slate-500'}`}>{label}</div>
      <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums leading-none mt-1.5 ${highlight ? 'text-amber-300' : 'text-white'}`}>{value}</div>
      <div className="text-[10px] sm:text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function SortButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
        active
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-800/60'
      }`}
    >
      {children}
    </button>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2.5 text-${align} text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400`}>{children}</th>
  );
}

function MatchHeading({ m }: { m: InPlayJump }) {
  const hf = countryFlagImgUrl(m.home_team, 20);
  const af = countryFlagImgUrl(m.away_team, 20);
  return (
    <Link to={`/match/${m.match_id}`} className="flex items-center gap-2 font-semibold text-white hover:text-amber-300 transition-colors">
      {hf && <img src={hf} alt="" className="h-3.5 w-auto rounded-sm" loading="lazy" />}
      <span>{m.home_team}</span>
      <span className="text-slate-500 font-normal text-[11px]">v</span>
      {af && <img src={af} alt="" className="h-3.5 w-auto rounded-sm" loading="lazy" />}
      <span>{m.away_team}</span>
      {m.early_goal_minute !== null && (
        <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold uppercase tracking-wider">
          ⚠ early goal
        </span>
      )}
    </Link>
  );
}

function PinnacleColumn({ m }: { m: InPlayJump }) {
  const c = m.pinnacle_close;
  return (
    <div className="font-mono text-[11px] leading-tight text-slate-400 text-right tabular-nums">
      <div>H {fmtPct(c.home_implied)} <span className="text-slate-600">({fmtOdds(c.home_odds)})</span></div>
      <div>D {fmtPct(c.draw_implied)} <span className="text-slate-600">({fmtOdds(c.draw_odds)})</span></div>
      <div>A {fmtPct(c.away_implied)} <span className="text-slate-600">({fmtOdds(c.away_odds)})</span></div>
    </div>
  );
}

function PolymarketColumn({ m }: { m: InPlayJump }) {
  const p = m.polymarket_inplay;
  return (
    <div className="font-mono text-[11px] leading-tight text-slate-400 text-right tabular-nums">
      <div>H {fmtPct(p.home_yes)}</div>
      <div>D {fmtPct(p.draw_yes)}</div>
      <div>A {fmtPct(p.away_yes)}</div>
    </div>
  );
}

function GapColumn({ m }: { m: InPlayJump }) {
  const g = m.gaps_pp;
  return (
    <div className="font-mono text-[11px] leading-tight text-right tabular-nums">
      <div className={gapColor(g.home)}>{fmtPP(g.home)}</div>
      <div className={gapColor(g.draw)}>{fmtPP(g.draw)}</div>
      <div className={gapColor(g.away)}>{fmtPP(g.away)}</div>
    </div>
  );
}

function DesktopRow({ m }: { m: InPlayJump }) {
  const ko = new Date(m.commence_time);
  return (
    <>
      <tr className="hover:bg-slate-700/15 transition-colors align-top">
        <td className="px-3 pt-2.5 pb-1"><MatchHeading m={m} /></td>
        <td className="px-3 pt-2.5 pb-1 font-mono text-[11px] text-slate-400 tabular-nums">{format(ko, 'EEE d MMM HH:mm')}</td>
        <td className="px-3 pt-2.5 pb-1"><PinnacleColumn m={m} /></td>
        <td className="px-3 pt-2.5 pb-1"><PolymarketColumn m={m} /></td>
        <td className="px-3 pt-2.5 pb-1"><GapColumn m={m} /></td>
        <td className="px-3 pt-2.5 pb-1 text-right whitespace-nowrap">
          <div className={`font-mono tabular-nums font-bold ${gapColor(m.biggest_gap_pp)}`}>
            {fmtPP(m.biggest_gap_pp)}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">
            {outcomeLabel(m.biggest_outcome, m)}
          </div>
        </td>
      </tr>
      <tr className="hover:bg-slate-700/15 transition-colors">
        <td colSpan={6} className="px-3 pb-3 pt-1 text-[11px] sm:text-xs text-slate-400 italic leading-relaxed">
          {narrative(m)}
        </td>
      </tr>
    </>
  );
}

function MobileCard({ m }: { m: InPlayJump }) {
  const ko = new Date(m.commence_time);
  return (
    <Link to={`/match/${m.match_id}`} className="block p-3 hover:bg-slate-700/15 transition-colors">
      <div className="flex items-center justify-between gap-3 mb-2">
        <MatchHeading m={m} />
        <div className={`font-mono tabular-nums font-bold text-sm whitespace-nowrap ${gapColor(m.biggest_gap_pp)}`}>
          {fmtPP(m.biggest_gap_pp)}
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 text-right">
            {outcomeLabel(m.biggest_outcome, m)}
          </div>
        </div>
      </div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">{format(ko, 'EEE d MMM HH:mm')}</div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1">Pin close</div>
          <PinnacleColumn m={m} />
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1">PM T+5</div>
          <PolymarketColumn m={m} />
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1">Gap</div>
          <GapColumn m={m} />
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-slate-700/40 text-[11px] text-slate-400 italic leading-relaxed">
        {narrative(m)}
      </div>
    </Link>
  );
}
