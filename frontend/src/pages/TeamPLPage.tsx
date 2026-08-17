import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { getTeamPnL } from '../api';
import type { TeamPLResponse, TeamPLRow, TeamPLViewStats } from '../types';

// Leagues we currently have data for. The disabled entries below are
// architectural placeholders — switch them on once the importer +
// team_name_normalizer cover that league.
const LEAGUE_OPTIONS = [
  { value: 'soccer_epl', label: 'Premier League', disabled: false },
  { value: 'soccer_italy_serie_a', label: 'Serie A', disabled: false },
  { value: 'soccer_spain_la_liga', label: 'La Liga', disabled: false },
  { value: 'soccer_germany_bundesliga', label: 'Bundesliga', disabled: false },
  { value: 'soccer_france_ligue_one', label: 'Ligue 1', disabled: false },
];

// Hard-locked to the current season per Neil's request — historical
// seasons sit in the historical_matches table but are hidden from the
// UI for now. If we want to bring them back later, swap this for a
// season selector and stop filtering on the row predicate below.
// Bump at each August switchover (also bump the importer/scheduler —
// see backend/app/services/football_data_importer.py DEFAULT_SEASONS).
const CURRENT_SEASON = '2627';

type Venue = 'overall' | 'home' | 'away';
type Side = 'back' | 'fade';
type Opponents = 'all' | 'top';
type SortField = 'team' | 'matches' | 'wins' | 'pl' | 'roi';
type SortDir = 'asc' | 'desc';

// Which leagues currently have a hardcoded 'Top N' opponent group on
// the backend. Other leagues hide the Opponents filter to avoid
// offering a control that does nothing.
const LEAGUES_WITH_TOP: Record<string, { label: string }> = {
  soccer_epl: { label: 'Top 6' },
  soccer_spain_la_liga: { label: 'Top 3' },
  soccer_italy_serie_a: { label: 'Top 4' },
  soccer_germany_bundesliga: { label: 'Top 4' },
  soccer_france_ligue_one: { label: 'Top 6' },
};

// Format football-data.co.uk season codes ('2122') as the human '2021/22'.
function formatSeason(code: string): string {
  if (code === 'all') return 'All seasons';
  if (code.length !== 4) return code;
  const start = `20${code.slice(0, 2)}`;
  const end = code.slice(2);
  return `${start}/${end}`;
}

function plColor(pl: number, muted: boolean): string {
  if (muted) return 'text-slate-500';
  if (pl > 0.005) return 'text-emerald-400';
  if (pl < -0.005) return 'text-red-400';
  return 'text-slate-400';
}

function roiColor(roi: number | null, muted: boolean): string {
  if (muted) return 'text-slate-500';
  if (roi === null) return 'text-slate-500';
  if (roi > 0.05) return 'text-emerald-400';
  if (roi < -0.05) return 'text-red-400';
  return 'text-slate-400';
}

function formatPL(pl: number): string {
  const sign = pl > 0 ? '+' : pl < 0 ? '−' : '';
  return `${sign}£${Math.abs(pl).toFixed(0)}`;
}

function formatROI(roi: number | null): string {
  if (roi === null) return '—';
  const sign = roi > 0 ? '+' : '';
  return `${sign}${roi.toFixed(1)}%`;
}

function SortHeader({
  label,
  field,
  active,
  direction,
  onClick,
  align = 'right',
}: {
  label: string;
  field: SortField;
  active: SortField;
  direction: SortDir;
  onClick: (f: SortField) => void;
  align?: 'left' | 'right';
}) {
  const isActive = active === field;
  return (
    <th
      onClick={() => onClick(field)}
      className={`px-2 sm:px-3 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.1em] font-semibold cursor-pointer select-none hover:text-white transition-colors ${
        isActive ? 'text-indigo-300' : 'text-slate-400'
      } ${align === 'left' ? 'text-left' : 'text-right'}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={isActive ? 'text-indigo-400' : 'text-slate-600'}>
          {isActive ? (direction === 'desc' ? '▼' : '▲') : '↕'}
        </span>
      </span>
    </th>
  );
}

export default function TeamPLPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Filter state. Persisted to URL so links are shareable.
  const league = searchParams.get('league') || 'soccer_epl';
  const venueParam = (searchParams.get('venue') as Venue) || 'overall';
  const sideParam = (searchParams.get('side') as Side) || 'back';
  const opponentsParam = (searchParams.get('opponents') as Opponents) || 'all';
  const leagueHasTop = league in LEAGUES_WITH_TOP;
  // If a user switches to a league with no top group while ?opponents=top
  // is in the URL, treat it as 'all' so we don't send a request that
  // silently falls back.
  const effectiveOpponents: Opponents = leagueHasTop ? opponentsParam : 'all';

  const [data, setData] = useState<TeamPLResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  const [sortField, setSortField] = useState<SortField>('roi');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);  // clear stale data immediately when switching leagues
    getTeamPnL({
      league,
      opponents: effectiveOpponents === 'top' ? 'top' : undefined,
    })
      .then((res) => {
        if (!alive) return;
        setData(res);
      })
      .catch(() => alive && setError('Failed to load team P/L. The data import may not have run yet for this league — try again in a minute.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [league, effectiveOpponents]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      // Numerical columns default desc; team name defaults asc.
      setSortDir(field === 'team' ? 'asc' : 'desc');
    }
  };

  // Pull the right side (back/fade) and venue (home/away/overall)
  // off each row. Two filters compose into one stat block.
  const view = (r: TeamPLRow): TeamPLViewStats => r[sideParam][venueParam];

  // Show only the current season per Neil's request. The aggregator
  // also emits an 'all' aggregate row per team — we drop that since
  // it's redundant when only one season is visible.
  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => r.season === CURRENT_SEASON);
  }, [data]);

  // Sort + sample-size flagging.
  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      const va = view(a);
      const vb = view(b);
      let aVal: number | string;
      let bVal: number | string;
      switch (sortField) {
        case 'team':    aVal = a.team; bVal = b.team; break;
        case 'matches': aVal = va.matches; bVal = vb.matches; break;
        case 'wins':    aVal = va.wins; bVal = vb.wins; break;
        case 'pl':      aVal = va.pl; bVal = vb.pl; break;
        case 'roi':     aVal = va.roi ?? -Infinity; bVal = vb.roi ?? -Infinity; break;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return sortDir === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, sortField, sortDir, venueParam, sideParam]);

  // Show the current-season label in place of a season selector. We
  // dropped the dropdown but still want users to see which season the
  // numbers cover.
  const currentSeasonLabel = formatSeason(CURRENT_SEASON);
  const leagueLabel = LEAGUE_OPTIONS.find((o) => o.value === league)?.label ?? 'Premier League';

  return (
    <div>
      <Helmet>
        <title>Team P/L — SteamWatch</title>
        <meta
          name="description"
          content="Backward-looking 1X2 profit/loss per Premier League team at Pinnacle closing prices, season-by-season. Flat £50 stake."
        />
        <link rel="canonical" href="https://www.steamwatch.io/team-pnl" />
      </Helmet>

      {/* Page header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-8 sm:h-10 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 flex-shrink-0" />
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 4 4 5-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Team P/L</h1>
            <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
              {currentSeasonLabel} {leagueLabel} &middot; £{data?.stake?.toFixed(0) ?? '50'} per match &middot; {sideParam === 'back' ? 'Bet ON each team to win' : 'Bet AGAINST each team'}
              {effectiveOpponents === 'top' && leagueHasTop && (
                <> &middot; vs {LEAGUES_WITH_TOP[league].label}</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Methodology note (collapsible, permanent) */}
      <div className="mb-4 sm:mb-6 bg-slate-800/60 rounded-xl border border-slate-700/60 overflow-hidden">
        <button
          onClick={() => setMethodologyOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-slate-700/20 transition-colors text-left"
          aria-expanded={methodologyOpen}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">i</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-slate-300 font-semibold">
              How to read this table
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${methodologyOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {methodologyOpen && (
          <div className="border-t border-slate-700/50 px-4 sm:px-5 py-3 sm:py-4 text-[12px] sm:text-sm text-slate-300 leading-relaxed space-y-3">
            <p>
              Imagine you put a £{data?.stake?.toFixed(0) ?? '50'} bet on the same team every single time they played in the {currentSeasonLabel} {leagueLabel} season — no skipping, no judgement, just the same bet every match. The table tells you what your bank balance would look like at the end.
            </p>
            <div>
              <p className="text-emerald-300 font-semibold mb-1">Bet ON team wins</p>
              <p className="text-slate-400">
                You stake £{data?.stake?.toFixed(0) ?? '50'} on the team to win the match. If they win, you collect at the bookmaker's price. If they draw or lose, you lose your stake.
                A positive return means the market consistently under-priced this team — they were better than the odds suggested.
              </p>
            </div>
            <div>
              <p className="text-red-300 font-semibold mb-1">Bet AGAINST team</p>
              <p className="text-slate-400">
                You stake £{data?.stake?.toFixed(0) ?? '50'} on the team <em>not</em> winning — you collect if the match ends in a draw <em>or</em> if the opposing team wins. You only lose your stake when the team you're betting against actually wins.
                A positive return means the market consistently over-priced this team — people backed them more than they deserved.
              </p>
            </div>
            <p className="text-slate-500 text-[11px]">
              Prices used are Pinnacle's closing odds — the sharpest publicly available reference, taken in the final seconds before kick-off.
              ROI = profit/loss ÷ amount staked.
              This is a backward-looking summary; small samples are noisy and past results are not a forecast.
            </p>
          </div>
        )}
      </div>

      {/* Filters — League + Side + Venue, plus Opponents on leagues that
          have a hardcoded top set (EPL only for now). */}
      <div className={`mb-4 sm:mb-6 grid grid-cols-1 gap-2 sm:gap-3 ${
        leagueHasTop ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
      }`}>
        <div>
          <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
            League
          </label>
          <select
            value={league}
            onChange={(e) => setParam('league', e.target.value === 'soccer_epl' ? null : e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-md px-2.5 py-1.5 text-xs sm:text-sm text-white font-mono"
          >
            {LEAGUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
            Bet direction
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => setParam('side', null)}
              className={`flex-1 px-2 py-1 rounded-md transition-colors border ${
                sideParam === 'back'
                  ? 'bg-emerald-500/20 border-emerald-500/40'
                  : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-700/60'
              }`}
              title="If you bet £50 on each team to win every one of their matches, what would your P/L be?"
            >
              <div className={`font-mono text-[11px] uppercase tracking-[0.1em] font-bold ${sideParam === 'back' ? 'text-emerald-300' : 'text-slate-300'}`}>
                Bet ON
              </div>
              <div className={`text-[9px] mt-0.5 ${sideParam === 'back' ? 'text-emerald-400/70' : 'text-slate-500'}`}>
                team wins
              </div>
            </button>
            <button
              onClick={() => setParam('side', 'fade')}
              className={`flex-1 px-2 py-1 rounded-md transition-colors border ${
                sideParam === 'fade'
                  ? 'bg-red-500/20 border-red-500/40'
                  : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-700/60'
              }`}
              title="If you bet £50 against each team every match (you collect on draws or when their opponent wins), what would your P/L be?"
            >
              <div className={`font-mono text-[11px] uppercase tracking-[0.1em] font-bold ${sideParam === 'fade' ? 'text-red-300' : 'text-slate-300'}`}>
                Bet AGAINST
              </div>
              <div className={`text-[9px] mt-0.5 ${sideParam === 'fade' ? 'text-red-400/70' : 'text-slate-500'}`}>
                team doesn't win
              </div>
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
            Venue
          </label>
          <select
            value={venueParam}
            onChange={(e) => setParam('venue', e.target.value === 'overall' ? null : e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-md px-2.5 py-1.5 text-xs sm:text-sm text-white font-mono"
          >
            <option value="overall">All matches</option>
            <option value="home">Home only</option>
            <option value="away">Away only</option>
          </select>
        </div>
        {leagueHasTop && (
          <div>
            <label className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-1">
              Opponents
            </label>
            <select
              value={effectiveOpponents}
              onChange={(e) => setParam('opponents', e.target.value === 'all' ? null : e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-md px-2.5 py-1.5 text-xs sm:text-sm text-white font-mono"
            >
              <option value="all">All opponents</option>
              <option value="top">Vs {LEAGUES_WITH_TOP[league].label}</option>
            </select>
          </div>
        )}
      </div>

      {/* Qualifying-teams banner — large, can't-miss callout listing the
          exact teams that count as 'Top 6' for this view. Indigo
          gradient + per-team pills so the user immediately sees which
          teams the filter is applying and can't be confused about why
          'their' team's numbers just changed. */}
      {effectiveOpponents === 'top' && data?.top_teams && data.top_teams.length > 0 && (
        <div className="mb-4 sm:mb-6 bg-gradient-to-br from-indigo-500/15 via-indigo-500/10 to-purple-500/10 border border-indigo-500/40 rounded-xl p-4 sm:p-5 shadow-lg shadow-indigo-500/5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 sm:h-6 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 flex-shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Showing matches against the &ldquo;{LEAGUES_WITH_TOP[league].label}&rdquo;
            </h2>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mb-3 leading-relaxed">
            Every team's record below counts only their fixtures against these six sides.
            Top 6 teams themselves are measured against the other five (max 10 matches);
            every other team is measured against all six (max 12 matches).
          </p>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {data.top_teams.map((t) => (
              <span
                key={t}
                className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-100 text-xs sm:text-sm font-semibold tracking-tight"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loading / error / empty states */}
      {loading && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
          <p className="text-slate-400">Loading team P/L…</p>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      )}
      {!loading && !error && data && data.rows.length === 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center space-y-2">
          <p className="text-slate-300 font-semibold">No historical data loaded yet.</p>
          <p className="text-slate-500 text-sm">An admin needs to run the football-data.co.uk import.</p>
        </div>
      )}
      {/* Season switched but no matches played (or imported) yet for this
          league — distinct from the no-data-at-all state above, which
          only fires when the API returns zero rows across ALL seasons. */}
      {!loading && !error && data && data.rows.length > 0 && sortedRows.length === 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center space-y-2">
          <p className="text-slate-300 font-semibold">No {currentSeasonLabel} matches yet for {leagueLabel}.</p>
          <p className="text-slate-500 text-sm">
            Numbers appear here after the first round of fixtures is played and the weekly results import runs.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && data && sortedRows.length > 0 && (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-900/60 border-b border-slate-700/60">
                <tr>
                  <SortHeader label="Team" field="team" active={sortField} direction={sortDir} onClick={handleSort} align="left" />
                  <SortHeader label="Matches" field="matches" active={sortField} direction={sortDir} onClick={handleSort} />
                  <SortHeader
                    label={sideParam === 'fade' ? 'Draws + L' : 'Wins'}
                    field="wins"
                    active={sortField}
                    direction={sortDir}
                    onClick={handleSort}
                  />
                  <SortHeader label="Profit / Loss" field="pl" active={sortField} direction={sortDir} onClick={handleSort} />
                  <SortHeader label="Return %" field="roi" active={sortField} direction={sortDir} onClick={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {sortedRows.map((r, i) => {
                  const v = view(r);
                  return (
                    <tr
                      key={`${r.team}-${r.season}-${i}`}
                      className="hover:bg-slate-700/15 transition-colors"
                    >
                      <td className="px-2 sm:px-3 py-2 sm:py-2.5 font-semibold tracking-tight text-white">
                        {r.team}
                      </td>
                      <td className="px-2 sm:px-3 py-2 sm:py-2.5 text-right font-mono tabular-nums text-white">
                        {v.matches}
                      </td>
                      <td
                        className="px-2 sm:px-3 py-2 sm:py-2.5 text-right font-mono tabular-nums text-slate-300"
                        title={sideParam === 'fade'
                          ? `${r.team} drew or lost in ${v.wins} of ${v.matches} ${venueParam === 'overall' ? 'matches' : venueParam + ' matches'} — i.e. the fade bet won.`
                          : `${r.team} won ${v.wins} of ${v.matches} ${venueParam === 'overall' ? 'matches' : venueParam + ' matches'}.`}
                      >
                        {v.wins}
                      </td>
                      <td className={`px-2 sm:px-3 py-2 sm:py-2.5 text-right font-mono tabular-nums font-semibold ${plColor(v.pl, false)}`}>
                        {formatPL(v.pl)}
                      </td>
                      <td className={`px-2 sm:px-3 py-2 sm:py-2.5 text-right font-mono tabular-nums font-bold ${roiColor(v.roi, false)}`}>
                        {formatROI(v.roi)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 sm:px-4 py-2 border-t border-slate-700/40 bg-slate-900/40 text-[10px] font-mono uppercase tracking-wider text-slate-500">
            {sortedRows.length} teams · side: {sideParam} · venue: {venueParam}
            {effectiveOpponents === 'top' && leagueHasTop && <> · vs {LEAGUES_WITH_TOP[league].label}</>}
            {' '}· season: {currentSeasonLabel}
          </div>
        </div>
      )}
    </div>
  );
}
