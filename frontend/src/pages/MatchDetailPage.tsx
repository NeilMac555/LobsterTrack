import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { format } from 'date-fns';
import { getMatchDetail, getMatchTotals, getMatchSpreads } from '../api';
import type { MatchDetail, MatchTotals, MatchSpreads } from '../types';
import { LEAGUE_CONFIG } from '../types';
import OddsChart from '../components/OddsChart';
import TotalsChart from '../components/TotalsChart';
import MarketTrendStrip from '../components/MarketTrendStrip';
import SpreadsChart from '../components/SpreadsChart';
import TimeFrameFilter, { type TimeFrame } from '../components/TimeFrameFilter';
import LeagueLogo from '../components/LeagueLogo';
import Sparkline from '../components/Sparkline';
import { countryFlagImgUrl } from '../utils/countryFlags';
import AmIUpCTA from '../components/AmIUpCTA';
import Bet105Button from '../components/Bet105Button';

// Format ms-until-kickoff as a readable T-minus string, or a T-plus if the
// match has already kicked off. Kept inside this module because match detail
// is the only place we use it.
function formatCountdown(ms: number): string {
  if (Math.abs(ms) < 60_000) return ms > 0 ? 'kickoff imminent' : 'in play';
  const sign = ms < 0 ? 'T+' : 'T-';
  const abs = Math.abs(ms);
  const d = Math.floor(abs / (24 * 3600_000));
  const h = Math.floor((abs % (24 * 3600_000)) / 3600_000);
  const m = Math.floor((abs % 3600_000) / 60_000);
  if (d > 0) return `${sign}${d}d ${h}h`;
  if (h > 0) return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
  return `${sign}${m}m`;
}

// Walk a totals/spreads history and compress consecutive same-line snapshots
// into segments. Used to surface line shifts (e.g. 2.5 → 2.75 → 3.0) above
// the chart so users immediately see a non-stationary line.
interface LineSegment {
  line: number;
  startTimestamp: string;  // ISO string of first snapshot at this line
  count: number;           // number of snapshots in this run
}
function computeLineSegments(history: Array<{ line: number; timestamp: string }>): LineSegment[] {
  const segs: LineSegment[] = [];
  for (const p of history) {
    const last = segs[segs.length - 1];
    if (last && Math.abs(last.line - p.line) < 0.001) {
      last.count += 1;
    } else {
      segs.push({ line: p.line, startTimestamp: p.timestamp, count: 1 });
    }
  }
  return segs;
}

interface LineHistoryStripProps {
  segments: LineSegment[];
  formatLine: (n: number) => string;
}
// Small amber banner shown above totals / AH charts whenever Pinnacle moved
// the line at least once. Quietly absent when there's only ever been one
// line, to avoid clutter on most matches.
function LineHistoryStrip({ segments, formatLine }: LineHistoryStripProps) {
  if (segments.length < 2) return null;
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4">
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-amber-400 font-bold whitespace-nowrap">
          Line moved
        </span>
        <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs text-white">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-amber-400/70">→</span>}
              <span className="font-bold tabular-nums">{formatLine(seg.line)}</span>
              <span className="text-slate-500 text-[10px]">
                ({format(new Date(seg.startTimestamp), 'd/M HH:mm')})
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [totals, setTotals] = useState<MatchTotals | null>(null);
  const [spreads, setSpreads] = useState<MatchSpreads | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChangesOnly, setShowChangesOnly] = useState(true);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('all');

  useEffect(() => {
    async function fetchMatch() {
      if (!matchId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getMatchDetail(matchId);
        setMatch(data);

        // Fetch totals and spreads in parallel
        const [totalsResult, spreadsResult] = await Promise.allSettled([
          getMatchTotals(matchId),
          getMatchSpreads(matchId)
        ]);

        if (totalsResult.status === 'fulfilled' && totalsResult.value.totals_history.length > 0) {
          setTotals(totalsResult.value);
        }

        if (spreadsResult.status === 'fulfilled' && spreadsResult.value.spreads_history.length > 0) {
          setSpreads(spreadsResult.value);
        }
      } catch (err) {
        setError('Failed to load match details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchMatch();
  }, [matchId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400">Loading match...</span>
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 sm:p-8 text-center">
        <p className="text-red-400 text-base sm:text-lg">{error || 'Match not found'}</p>
        <Link to="/" className="text-blue-400 hover:text-blue-300 mt-4 inline-block font-medium">
          ← Back to matches
        </Link>
      </div>
    );
  }

  const leagueConfig = LEAGUE_CONFIG[match.sport_key];
  const matchDate = new Date(match.commence_time);
  const latestOdds = match.odds_history[match.odds_history.length - 1];
  const firstOdds = match.odds_history[0];

  const metaDesc = `Sharp money movement for ${match.home_team} vs ${match.away_team} — track line moves, steam alerts and model probabilities on SteamWatch.`;

  return (
    <div>
      <Helmet>
        <title>{`${match.home_team} vs ${match.away_team} — SteamWatch`}</title>
        <meta name="description" content={metaDesc} />
        <meta property="og:title" content={`${match.home_team} vs ${match.away_team} — SteamWatch`} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:url" content={`https://www.steamwatch.io/match/${matchId}`} />
        <link rel="canonical" href={`https://www.steamwatch.io/match/${matchId}`} />
      </Helmet>

      {/* Back Button */}
      <Link
        to={`/?league=${match.sport_key}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 sm:mb-8 transition-colors duration-200 font-medium text-sm sm:text-base"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to {leagueConfig?.name || 'matches'}
      </Link>

      {/* Unified match header — league strip, teams, kickoff with T-minus,
          and a 3-column odds book with inline sparklines. One dense terminal
          hero card instead of four separate panels. */}
      <div
        className="rounded-2xl border border-slate-700/50 overflow-hidden mb-6 sm:mb-8 card-shadow"
        style={{ background: 'linear-gradient(180deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)' }}
      >
        {/* League strip */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-700/50 flex items-center gap-2 flex-wrap">
          <LeagueLogo sportKey={match.sport_key} size="sm" />
          <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.12em] text-slate-400 font-semibold">
            {leagueConfig?.name || match.league_name}
          </span>
          <span className="text-slate-600">·</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-slate-700/60 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">
            <span className="relative flex h-1.5 w-1.5">
              {matchDate.getTime() > Date.now() && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                matchDate.getTime() > Date.now() ? 'bg-emerald-500' : 'bg-slate-500'
              }`}></span>
            </span>
            {matchDate.getTime() > Date.now() ? 'Market Open' : 'Market Closed'}
          </span>
        </div>

        {/* Teams + Kickoff */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40 flex-shrink-0"></div>
              {(() => {
                const flag = countryFlagImgUrl(match.home_team, 40);
                return flag && (
                  <img src={flag} alt="" className="h-6 sm:h-7 w-auto rounded-sm flex-shrink-0" />
                );
              })()}
              <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate">{match.home_team}</h1>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 flex-shrink-0">vs</span>
            <div className="flex items-center gap-2.5 min-w-0">
              {(() => {
                const flag = countryFlagImgUrl(match.away_team, 40);
                return flag && (
                  <img src={flag} alt="" className="h-6 sm:h-7 w-auto rounded-sm flex-shrink-0" />
                );
              })()}
              <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate">{match.away_team}</h1>
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/40 flex-shrink-0"></div>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Kickoff</div>
            <div className="flex items-baseline gap-3 justify-end mt-0.5">
              <span className="text-xs font-mono text-slate-400 tabular-nums">{format(matchDate, 'EEE, MMM d')}</span>
              <span className="text-3xl sm:text-4xl font-mono font-bold text-white tabular-nums tracking-tight leading-none">{format(matchDate, 'HH:mm')}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-1 tabular-nums uppercase tracking-wider">
              UTC · {formatCountdown(matchDate.getTime() - Date.now())}
            </div>
          </div>
        </div>

        {/* 3-column 1X2 odds book with per-outcome sparklines */}
        <div className="grid grid-cols-3">
          {(() => {
            const outcomes = [
              { key: 'home' as const, label: 'Home', team: match.home_team, color: '#34d399', accentText: 'text-emerald-400', accentBg: 'bg-emerald-400' },
              { key: 'draw' as const, label: 'Draw', team: null, color: '#fbbf24', accentText: 'text-amber-400', accentBg: 'bg-amber-400' },
              { key: 'away' as const, label: 'Away', team: match.away_team, color: '#f87171', accentText: 'text-red-400', accentBg: 'bg-red-400' },
            ];
            return outcomes.map((o, i) => {
              const cur = latestOdds?.[`${o.key}_odds`] ?? null;
              const open = firstOdds?.[`${o.key}_odds`] ?? null;
              const pct = (cur && open && open > 0) ? ((cur - open) / open) * 100 : 0;
              const direction = pct < -0.1 ? 'down' : pct > 0.1 ? 'up' : 'flat';
              // Plot RAW odds so the mini-chart matches the big Odds Movement
              // chart below — drifting outcomes trend up on both, backed
              // outcomes trend down on both. Color is driven by direction
              // (emerald = shortening, red = drifting) via color="auto"
              // in the Sparkline component, so the line glance always reads
              // "green = being backed, red = drifting".
              const sparkValues = match.odds_history
                .map((h) => h[`${o.key}_odds`])
                .filter((v): v is number => v != null && v > 0);
              return (
                <div
                  key={o.key}
                  className={`px-3 sm:px-4 py-3 sm:py-4 ${i < 2 ? 'border-r border-slate-700/50' : ''}`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full ${o.accentBg} flex-shrink-0`}></div>
                    <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold truncate">
                      {o.label}
                      {o.team && <span className="text-slate-600 hidden sm:inline"> · {o.team.split(' ').slice(0, 2).join(' ')}</span>}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-white leading-none">
                        {cur != null ? cur.toFixed(2) : '—'}
                      </div>
                      <div className="text-[9px] sm:text-[10px] font-mono text-slate-500 mt-1.5 tabular-nums whitespace-nowrap">
                        <span className="hidden sm:inline">Open </span>{open != null ? open.toFixed(2) : '—'}
                        <span className="text-slate-600 mx-1">·</span>
                        {cur ? `${((1 / cur) * 100).toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] sm:text-[10px] font-bold tabular-nums whitespace-nowrap ${
                        direction === 'down' ? 'bg-emerald-500/20 text-emerald-400' :
                        direction === 'up' ? 'bg-red-500/20 text-red-400' :
                        'bg-slate-700/40 text-slate-400'
                      }`}>
                        {direction === 'down' ? '↓' : direction === 'up' ? '↑' : '·'} {Math.abs(pct).toFixed(1)}%
                      </span>
                      {sparkValues.length >= 2 && (
                        <Sparkline
                          values={sparkValues}
                          width={68}
                          height={22}
                          // Color by the pill's direction (not by team identity).
                          // Emerald = odds shortening = being backed,
                          // Red = odds drifting, slate = flat.
                          color={
                            direction === 'down' ? '#34d399'
                            : direction === 'up' ? '#f87171'
                            : '#94a3b8'
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Odds History Chart */}
      <div className="bg-slate-800/80 rounded-xl sm:rounded-2xl border border-slate-700/50 p-3 sm:p-6 mb-6 sm:mb-8 card-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 sm:mb-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base sm:text-xl font-bold text-white">Odds Movement</h2>
            <span className="text-[10px] sm:text-xs text-slate-500 font-medium">Dotted = opening</span>
          </div>
          <TimeFrameFilter value={timeFrame} onChange={setTimeFrame} />
        </div>
        <div className="h-72 sm:h-[400px]">
          <OddsChart
            data={match.odds_history}
            homeTeam={match.home_team}
            awayTeam={match.away_team}
            timeFrame={timeFrame}
          />
        </div>
      </div>

      {/* AmIUp cross-promo — slots between the main Odds Movement
          chart and the supporting Totals / AH sections. The user
          has just seen 'how this match moved'; the natural next
          action is 'track my bet on it'. */}
      <AmIUpCTA placement="match" />

      <div className="my-4 flex justify-center">
        <Bet105Button variant="full" location="match-detail" />
      </div>

      {/* Totals (Over/Under) Section */}
      {totals && totals.totals_history.length > 0 && (
        <TotalsSection totals={totals} timeFrame={timeFrame} onTimeFrameChange={setTimeFrame} />
      )}

      {/* Asian Handicap (Spreads) Section */}
      {spreads && spreads.spreads_history.length > 0 && (
        <SpreadsSection spreads={spreads} homeTeam={match.home_team} awayTeam={match.away_team} timeFrame={timeFrame} onTimeFrameChange={setTimeFrame} />
      )}

      {/* Odds History Table */}
      <OddsHistoryTable
        oddsHistory={match.odds_history}
        showChangesOnly={showChangesOnly}
        onToggleShowChanges={() => setShowChangesOnly(!showChangesOnly)}
      />
    </div>
  );
}

interface OddsHistoryTableProps {
  oddsHistory: MatchDetail['odds_history'];
  showChangesOnly: boolean;
  onToggleShowChanges: () => void;
}

function OddsHistoryTable({ oddsHistory, showChangesOnly, onToggleShowChanges }: OddsHistoryTableProps) {
  // Filter to only rows where odds changed from previous
  const filteredHistory = showChangesOnly
    ? oddsHistory.filter((point, index) => {
        if (index === 0) return true; // Always show opening
        const prev = oddsHistory[index - 1];
        return (
          point.home_odds !== prev.home_odds ||
          point.draw_odds !== prev.draw_odds ||
          point.away_odds !== prev.away_odds
        );
      })
    : oddsHistory;

  // Reverse for display (newest first)
  const displayHistory = [...filteredHistory].reverse();

  return (
    <div className="bg-slate-800/80 rounded-xl sm:rounded-2xl border border-slate-700/50 overflow-hidden card-shadow">
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Odds History</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            {showChangesOnly
              ? `${filteredHistory.length} changes out of ${oddsHistory.length} snapshots`
              : `${oddsHistory.length} snapshots recorded`}
          </p>
        </div>
        <button
          onClick={onToggleShowChanges}
          className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
            showChangesOnly
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <svg
            className={`w-4 h-4 transition-transform ${showChangesOnly ? 'rotate-0' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="hidden xs:inline">{showChangesOnly ? 'Changes Only' : 'Show All'}</span>
          <span className="xs:hidden">{showChangesOnly ? 'Changes' : 'All'}</span>
        </button>
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-700/30">
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Home
              </th>
              <th className="px-6 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Draw
              </th>
              <th className="px-6 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Away
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {displayHistory.map((point, displayIndex) => {
              // Find original index for comparison
              const originalIndex = oddsHistory.findIndex(p => p.timestamp === point.timestamp);
              const isOpening = originalIndex === 0;
              const prevPoint = originalIndex > 0 ? oddsHistory[originalIndex - 1] : null;

              const homeChanged = prevPoint && point.home_odds !== prevPoint.home_odds;
              const drawChanged = prevPoint && point.draw_odds !== prevPoint.draw_odds;
              const awayChanged = prevPoint && point.away_odds !== prevPoint.away_odds;

              return (
                <tr
                  key={displayIndex}
                  className={`hover:bg-slate-700/20 transition-colors duration-150 ${isOpening ? 'bg-slate-700/20' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-medium">
                    {format(new Date(point.timestamp), 'MMM d, yyyy HH:mm:ss')}
                    {isOpening && <span className="ml-2 text-xs text-slate-500 font-semibold">(Opening)</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`font-mono font-bold ${homeChanged ? 'text-white bg-slate-600/40 px-2 py-0.5 rounded' : 'text-white'}`}>
                      {point.home_odds?.toFixed(2) ?? '-'}
                    </span>
                    {homeChanged && prevPoint?.home_odds && (
                      <span className={`ml-2 text-xs ${point.home_odds! < prevPoint.home_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.home_odds! > prevPoint.home_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`font-mono font-bold ${drawChanged ? 'text-white bg-slate-600/40 px-2 py-0.5 rounded' : 'text-white'}`}>
                      {point.draw_odds?.toFixed(2) ?? '-'}
                    </span>
                    {drawChanged && prevPoint?.draw_odds && (
                      <span className={`ml-2 text-xs ${point.draw_odds! < prevPoint.draw_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.draw_odds! > prevPoint.draw_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`font-mono font-bold ${awayChanged ? 'text-white bg-slate-600/40 px-2 py-0.5 rounded' : 'text-white'}`}>
                      {point.away_odds?.toFixed(2) ?? '-'}
                    </span>
                    {awayChanged && prevPoint?.away_odds && (
                      <span className={`ml-2 text-xs ${point.away_odds! < prevPoint.away_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.away_odds! > prevPoint.away_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden divide-y divide-slate-700/50">
        {displayHistory.map((point, displayIndex) => {
          const originalIndex = oddsHistory.findIndex(p => p.timestamp === point.timestamp);
          const isOpening = originalIndex === 0;
          const prevPoint = originalIndex > 0 ? oddsHistory[originalIndex - 1] : null;

          const homeChanged = prevPoint && point.home_odds !== prevPoint.home_odds;
          const drawChanged = prevPoint && point.draw_odds !== prevPoint.draw_odds;
          const awayChanged = prevPoint && point.away_odds !== prevPoint.away_odds;

          return (
            <div
              key={displayIndex}
              className={`p-4 ${isOpening ? 'bg-slate-700/20' : ''}`}
            >
              <div className="text-xs text-slate-400 mb-2 flex items-center gap-2">
                {format(new Date(point.timestamp), 'MMM d, HH:mm')}
                {isOpening && <span className="text-slate-500 font-semibold">(Opening)</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Home</div>
                  <div className={`font-mono font-bold text-sm ${homeChanged ? 'text-white bg-slate-600/40 px-1 py-0.5 rounded' : 'text-white'}`}>
                    {point.home_odds?.toFixed(2) ?? '-'}
                    {homeChanged && prevPoint?.home_odds && (
                      <span className={`ml-1 text-xs ${point.home_odds! < prevPoint.home_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.home_odds! > prevPoint.home_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Draw</div>
                  <div className={`font-mono font-bold text-sm ${drawChanged ? 'text-white bg-slate-600/40 px-1 py-0.5 rounded' : 'text-white'}`}>
                    {point.draw_odds?.toFixed(2) ?? '-'}
                    {drawChanged && prevPoint?.draw_odds && (
                      <span className={`ml-1 text-xs ${point.draw_odds! < prevPoint.draw_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.draw_odds! > prevPoint.draw_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Away</div>
                  <div className={`font-mono font-bold text-sm ${awayChanged ? 'text-white bg-slate-600/40 px-1 py-0.5 rounded' : 'text-white'}`}>
                    {point.away_odds?.toFixed(2) ?? '-'}
                    {awayChanged && prevPoint?.away_odds && (
                      <span className={`ml-1 text-xs ${point.away_odds! < prevPoint.away_odds ? 'text-emerald-400' : 'text-red-400'}`}>
                        {point.away_odds! > prevPoint.away_odds ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredHistory.length === 0 && (
        <div className="px-6 py-8 text-center text-slate-500">
          No odds changes recorded yet
        </div>
      )}
    </div>
  );
}

interface TotalsSectionProps {
  totals: MatchTotals;
  timeFrame: TimeFrame;
  onTimeFrameChange: (tf: TimeFrame) => void;
}

function TotalsSection({ totals, timeFrame, onTimeFrameChange }: TotalsSectionProps) {
  const latestTotals = totals.totals_history[totals.totals_history.length - 1];
  const openingTotals = totals.totals_history[0];

  // Calculate percentage changes from opening
  const overChange = openingTotals.over_odds && latestTotals.over_odds
    ? ((latestTotals.over_odds - openingTotals.over_odds) / openingTotals.over_odds) * 100
    : null;
  const underChange = openingTotals.under_odds && latestTotals.under_odds
    ? ((latestTotals.under_odds - openingTotals.under_odds) / openingTotals.under_odds) * 100
    : null;

  const totalsSegments = computeLineSegments(totals.totals_history);

  return (
    <div className="bg-slate-800/80 rounded-xl sm:rounded-2xl border border-slate-700/50 overflow-hidden mb-6 sm:mb-8 card-shadow">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-700/30 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-base sm:text-lg font-bold text-white">Total Goals (Over/Under)</h2>
        <TimeFrameFilter value={timeFrame} onChange={onTimeFrameChange} />
      </div>

      <div className="p-4 sm:p-6">
        {/* Current Totals */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          {/* Line */}
          <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-slate-400 font-medium mb-1">Line</div>
            <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {latestTotals.line ?? '-'}
            </div>
            {openingTotals.line !== latestTotals.line && (
              <div className="text-xs text-slate-500 mt-1">
                Open: {openingTotals.line}
              </div>
            )}
          </div>

          {/* Over */}
          <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-emerald-400 font-medium mb-1">Over</div>
            <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {latestTotals.over_odds?.toFixed(2) ?? '-'}
            </div>
            {overChange !== null && Math.abs(overChange) >= 0.1 && (
              <div className={`text-xs mt-1 font-medium ${overChange < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {overChange > 0 ? '+' : ''}{overChange.toFixed(1)}%
              </div>
            )}
          </div>

          {/* Under */}
          <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-orange-400 font-medium mb-1">Under</div>
            <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {latestTotals.under_odds?.toFixed(2) ?? '-'}
            </div>
            {underChange !== null && Math.abs(underChange) >= 0.1 && (
              <div className={`text-xs mt-1 font-medium ${underChange < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {underChange > 0 ? '+' : ''}{underChange.toFixed(1)}%
              </div>
            )}
          </div>
        </div>

        {/* Opening Reference */}
        <div className="bg-slate-900/30 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-400">Opening</span>
            <div className="flex gap-4 font-mono font-medium text-slate-300">
              <span>Line: {openingTotals.line ?? '-'}</span>
              <span className="text-emerald-400">O: {openingTotals.over_odds?.toFixed(2) ?? '-'}</span>
              <span className="text-orange-400">U: {openingTotals.under_odds?.toFixed(2) ?? '-'}</span>
            </div>
          </div>
        </div>

        {/* Line-shift banner — only renders when Pinnacle has moved the
            totals line at least once during the tracking window. */}
        <LineHistoryStrip
          segments={totalsSegments}
          formatLine={(n) => n.toFixed(2)}
        />

        {/* Market-implied expected-goals trend — a single continuous
            signal that stays comparable across a line shift, unlike the
            raw price chart below it. Answers 'is the market trending
            toward Over or Under' at a glance. */}
        {totals.totals_history.length > 1 && (
          <MarketTrendStrip data={totals.totals_history} timeFrame={timeFrame} />
        )}

        {/* Chart */}
        {totals.totals_history.length > 1 && (
          <div className="h-48 sm:h-64">
            <TotalsChart data={totals.totals_history} timeFrame={timeFrame} />
          </div>
        )}

        {totals.totals_history.length === 1 && (
          <div className="text-center text-slate-500 text-sm py-4">
            Only opening totals recorded so far
          </div>
        )}
      </div>
    </div>
  );
}

interface SpreadsSectionProps {
  spreads: MatchSpreads;
  homeTeam: string;
  awayTeam: string;
  timeFrame: TimeFrame;
  onTimeFrameChange: (tf: TimeFrame) => void;
}

function SpreadsSection({ spreads, homeTeam, awayTeam, timeFrame, onTimeFrameChange }: SpreadsSectionProps) {
  const latestSpreads = spreads.spreads_history[spreads.spreads_history.length - 1];
  const openingSpreads = spreads.spreads_history[0];

  // Calculate percentage changes from opening
  const homeChange = openingSpreads.home_odds && latestSpreads.home_odds
    ? ((latestSpreads.home_odds - openingSpreads.home_odds) / openingSpreads.home_odds) * 100
    : null;
  const awayChange = openingSpreads.away_odds && latestSpreads.away_odds
    ? ((latestSpreads.away_odds - openingSpreads.away_odds) / openingSpreads.away_odds) * 100
    : null;

  // Format line with sign
  const formatLine = (line: number) => {
    if (line > 0) return `+${line}`;
    return line.toString();
  };

  const spreadsSegments = computeLineSegments(spreads.spreads_history);

  return (
    <div className="bg-slate-800/80 rounded-xl sm:rounded-2xl border border-slate-700/50 overflow-hidden mb-6 sm:mb-8 card-shadow">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-700/30 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-base sm:text-lg font-bold text-white">Asian Handicap</h2>
        <TimeFrameFilter value={timeFrame} onChange={onTimeFrameChange} />
      </div>

      <div className="p-4 sm:p-6">
        {/* Current Spreads */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          {/* Line */}
          <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-slate-400 font-medium mb-1">Line</div>
            <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {formatLine(latestSpreads.line)}
            </div>
            {openingSpreads.line !== latestSpreads.line && (
              <div className="text-xs text-slate-500 mt-1">
                Open: {formatLine(openingSpreads.line)}
              </div>
            )}
          </div>

          {/* Home */}
          <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-emerald-400 font-medium mb-1 truncate" title={homeTeam}>
              {homeTeam.length > 12 ? homeTeam.substring(0, 10) + '...' : homeTeam}
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {latestSpreads.home_odds?.toFixed(2) ?? '-'}
            </div>
            {homeChange !== null && Math.abs(homeChange) >= 0.1 && (
              <div className={`text-xs mt-1 font-medium ${homeChange < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {homeChange > 0 ? '+' : ''}{homeChange.toFixed(1)}%
              </div>
            )}
          </div>

          {/* Away */}
          <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-orange-400 font-medium mb-1 truncate" title={awayTeam}>
              {awayTeam.length > 12 ? awayTeam.substring(0, 10) + '...' : awayTeam}
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {latestSpreads.away_odds?.toFixed(2) ?? '-'}
            </div>
            {awayChange !== null && Math.abs(awayChange) >= 0.1 && (
              <div className={`text-xs mt-1 font-medium ${awayChange < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {awayChange > 0 ? '+' : ''}{awayChange.toFixed(1)}%
              </div>
            )}
          </div>
        </div>

        {/* Opening Reference */}
        <div className="bg-slate-900/30 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-400">Opening</span>
            <div className="flex gap-4 font-mono font-medium text-slate-300">
              <span>Line: {formatLine(openingSpreads.line)}</span>
              <span className="text-emerald-400">H: {openingSpreads.home_odds?.toFixed(2) ?? '-'}</span>
              <span className="text-orange-400">A: {openingSpreads.away_odds?.toFixed(2) ?? '-'}</span>
            </div>
          </div>
        </div>

        {/* Line-shift banner for AH — same pattern as totals. */}
        <LineHistoryStrip
          segments={spreadsSegments}
          formatLine={formatLine}
        />

        {/* Chart */}
        {spreads.spreads_history.length > 1 && (
          <div className="h-48 sm:h-64">
            <SpreadsChart data={spreads.spreads_history} timeFrame={timeFrame} />
          </div>
        )}

        {spreads.spreads_history.length === 1 && (
          <div className="text-center text-slate-500 text-sm py-4">
            Only opening spreads recorded so far
          </div>
        )}
      </div>
    </div>
  );
}
