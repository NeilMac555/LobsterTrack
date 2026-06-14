import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { getInPlayJumps } from '../api';
import type { InPlayJumpsResponse, InPlayJump } from '../types';
import { countryFlagImgUrl } from '../utils/countryFlags';

type SortField = 'delta' | 'commence_time';

const OUTCOME_LABEL: Record<InPlayJump['biggest_outcome'], string> = {
  home: 'Home',
  draw: 'Draw',
  away: 'Away',
};

function deltaColor(pp: number | null): string {
  if (pp === null) return 'text-slate-500';
  // Positive pp = implied prob went UP = odds shortened (sharp money in)
  if (pp >= 0.05) return 'text-emerald-400';
  if (pp <= -0.05) return 'text-red-400';
  return 'text-slate-400';
}

function deltaArrow(pp: number | null): string {
  if (pp === null) return '—';
  if (pp >= 0.05) return '↓';
  if (pp <= -0.05) return '↑';
  return '·';
}

function fmtDelta(pp: number | null): string {
  if (pp === null) return '—';
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(2)}pp`;
}

function fmtOdds(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(2);
}

export default function InPlayJumpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const days = parseInt(searchParams.get('days') || '7', 10);
  const minDelta = parseFloat(searchParams.get('min') || '2');
  const includeEarly = searchParams.get('show_eg') === '1';
  const sortField = (searchParams.get('sort') as SortField) || 'delta';

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
      min_delta_pp: minDelta,
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
  }, [days, minDelta, includeEarly]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const sortedJumps = useMemo(() => {
    if (!data) return [];
    const arr = [...data.jumps];
    if (sortField === 'delta') {
      arr.sort((a, b) => Math.abs(b.biggest_delta_pp) - Math.abs(a.biggest_delta_pp));
    } else {
      arr.sort((a, b) => new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime());
    }
    return arr;
  }, [data, sortField]);

  return (
    <div>
      <Helmet>
        <title>In-Play Jumps — SteamWatch</title>
        <meta name="description" content="World Cup matches with the biggest implied-probability shifts in the first 5 minutes of in-play. Sharp money signals captured at kickoff." />
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
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">In-Play Jumps</h1>
            <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
              World Cup &middot; Closing line vs T+5 in-play &middot; Pinnacle
            </p>
          </div>
        </div>
      </div>

      {/* Free feature — no paywall on this one. Neil's call: the
          in-play jump signal is brand new and needs eyeballs to be
          discovered, so we want maximum traffic, not gated traffic. */}
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
                  For each World Cup match, we capture Pinnacle's <strong className="text-white">closing 1X2 line</strong> in the final seconds before kick-off, then again at <strong className="text-white">5 minutes into in-play</strong>. The delta between those two snapshots — in implied-probability terms — is the &ldquo;in-play jump&rdquo;.
                </p>
                <p>
                  A positive jump means the outcome's price <strong className="text-emerald-400">shortened</strong> (sharp money piled in). Negative means it <strong className="text-red-400">drifted</strong>. The biggest jump per match is what's shown here, with the per-outcome breakdown below.
                </p>
                <p>
                  <strong className="text-amber-300">Matches with early goals are filtered out by default.</strong> A goal in the first five minutes drags the price by tens of pp purely as reaction to obvious public info — it would dominate the list and tell you nothing. Toggle &ldquo;Show early-goal matches&rdquo; below to see them.
                </p>
                <p className="text-slate-500 text-[11px]">
                  Small sample. This is a new feature — the WC has 64 matches and we capture one jump per match. Treat single-match readings as anecdotal until we have ~20 data points.
                </p>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="mb-4 sm:mb-6 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
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
                Min delta: <span className="text-amber-300 tabular-nums">{minDelta.toFixed(1)}pp</span>
              </label>
              <input
                type="range"
                min={0}
                max={20}
                step={0.5}
                value={minDelta}
                onChange={(e) => setParam('min', e.target.value === '2' ? null : e.target.value)}
                className="w-full accent-amber-500"
              />
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

          {/* Coverage / status strip */}
          {data && (
            <div className="mb-4 sm:mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
                <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Matches seen</div>
                <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white leading-none mt-1.5">{data.matches_seen}</div>
                <div className="text-[10px] sm:text-xs text-slate-500 mt-1">in last {data.days_back}d</div>
              </div>
              <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
                <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">With closing</div>
                <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white leading-none mt-1.5">{data.matches_with_closing}</div>
                <div className="text-[10px] sm:text-xs text-slate-500 mt-1">have closing line</div>
              </div>
              <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
                <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">With T+5 snap</div>
                <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white leading-none mt-1.5">{data.matches_with_in_play_snap}</div>
                <div className="text-[10px] sm:text-xs text-slate-500 mt-1">have in-play data</div>
              </div>
              <div className="bg-slate-800/80 rounded-xl border border-amber-500/30 px-3 sm:px-4 py-2.5 sm:py-3">
                <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-amber-400/80 font-semibold">Above threshold</div>
                <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-amber-300 leading-none mt-1.5">{data.matches_with_jumps}</div>
                <div className="text-[10px] sm:text-xs text-slate-500 mt-1">≥ {minDelta.toFixed(1)}pp shift</div>
              </div>
            </div>
          )}

          {/* Sort toggle */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Sort:</span>
            <button
              onClick={() => setParam('sort', sortField === 'delta' ? null : null)}
              className={`px-2.5 py-1 rounded font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
                sortField === 'delta'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-800/60'
              }`}
            >
              Biggest jump
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

          {/* Loading / error / empty / table */}
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
                Matches need to kick off and reach T+5 for data to appear. {data && data.matches_with_in_play_snap > 0
                  ? `${data.matches_with_in_play_snap} matches have in-play snapshots so far but none cleared the ${minDelta.toFixed(1)}pp threshold.`
                  : 'No in-play snapshots captured yet — check back after the next matchday.'}
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
                      <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Match</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Kicked off</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Outcome</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Closing</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">T+5</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400">Jump</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {sortedJumps.map((j) => {
                      const ko = new Date(j.commence_time);
                      const out = j.biggest_outcome;
                      const closeOdds = j.closing[out];
                      const inOdds = j.in_play[out];
                      return (
                        <tr key={j.match_id} className="hover:bg-slate-700/15 transition-colors">
                          <td className="px-3 py-2.5">
                            <Link to={`/match/${j.match_id}`} className="flex items-center gap-2 font-semibold text-white hover:text-amber-300 transition-colors">
                              {(() => {
                                const f = countryFlagImgUrl(j.home_team, 20);
                                return f ? <img src={f} alt="" className="h-3.5 w-auto rounded-sm" loading="lazy" /> : null;
                              })()}
                              <span>{j.home_team}</span>
                              <span className="text-slate-500 font-normal text-[11px]">v</span>
                              {(() => {
                                const f = countryFlagImgUrl(j.away_team, 20);
                                return f ? <img src={f} alt="" className="h-3.5 w-auto rounded-sm" loading="lazy" /> : null;
                              })()}
                              <span>{j.away_team}</span>
                              {j.early_goal_minute !== null && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold uppercase tracking-wider">
                                  ⚠ early goal
                                </span>
                              )}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400 tabular-nums">
                            {format(ko, 'EEE d MMM HH:mm')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                            {OUTCOME_LABEL[out]}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">{fmtOdds(closeOdds)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white">{fmtOdds(inOdds)}</td>
                          <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-bold ${deltaColor(j.biggest_delta_pp)}`}>
                            {deltaArrow(j.biggest_delta_pp)} {fmtDelta(j.biggest_delta_pp)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-700/40">
                {sortedJumps.map((j) => {
                  const ko = new Date(j.commence_time);
                  const out = j.biggest_outcome;
                  return (
                    <Link key={j.match_id} to={`/match/${j.match_id}`} className="block p-3 hover:bg-slate-700/15 transition-colors">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-1.5 font-semibold text-white text-sm tracking-tight min-w-0">
                          {(() => {
                            const f = countryFlagImgUrl(j.home_team, 20);
                            return f ? <img src={f} alt="" className="h-3.5 w-auto rounded-sm flex-shrink-0" loading="lazy" /> : null;
                          })()}
                          <span className="truncate">{j.home_team}</span>
                          <span className="text-slate-500 font-normal text-[11px]">v</span>
                          {(() => {
                            const f = countryFlagImgUrl(j.away_team, 20);
                            return f ? <img src={f} alt="" className="h-3.5 w-auto rounded-sm flex-shrink-0" loading="lazy" /> : null;
                          })()}
                          <span className="truncate">{j.away_team}</span>
                        </div>
                        <span className={`font-mono tabular-nums font-bold text-sm whitespace-nowrap ${deltaColor(j.biggest_delta_pp)}`}>
                          {deltaArrow(j.biggest_delta_pp)} {fmtDelta(j.biggest_delta_pp)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                        <span>{format(ko, 'EEE d MMM HH:mm')}</span>
                        <span>
                          {OUTCOME_LABEL[out]} {fmtOdds(j.closing[out])} → {fmtOdds(j.in_play[out])}
                        </span>
                      </div>
                      {j.early_goal_minute !== null && (
                        <div className="mt-2 inline-block px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold uppercase tracking-wider">
                          ⚠ early goal
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-3 sm:px-4 py-2 border-t border-slate-700/40 bg-slate-900/40 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                {sortedJumps.length} match{sortedJumps.length === 1 ? '' : 'es'} · window: first {data?.minutes_window} min · {includeEarly ? 'including' : 'excluding'} early goals
              </div>
            </div>
          )}
    </div>
  );
}
