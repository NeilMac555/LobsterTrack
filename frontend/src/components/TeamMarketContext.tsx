import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTeamMarketContext } from '../api';
import type { TeamMarketContextData, TeamMarketHistory, TeamMarketMatch } from '../types';
import { formatKickoff, parseUtc } from '../utils/time';
import { useTimePreference } from '../contexts/TimePreferenceContext';
import { useOddsFormat } from '../contexts/OddsFormatContext';
import { formatOdds } from '../utils/odds';

const directions = {
  drift: { label: 'Drifted', short: 'Drift', className: 'text-emerald-300' },
  steam: { label: 'Shortened', short: 'Short', className: 'text-red-300' },
  both: { label: 'Both ways', short: 'Both', className: 'text-amber-300' },
  quiet: { label: 'Little change', short: 'Quiet', className: 'text-slate-300' },
  unavailable: { label: 'Incomplete prices', short: 'No data', className: 'text-slate-400' },
};

function headline(team: TeamMarketHistory) {
  if (!team.completed_matches) return 'No completed matches earlier this season.';
  if (!team.tracked_matches) return 'Not enough Pinnacle price history yet.';
  if (team.drifts > team.steams && team.drifts >= 3) return `Drifted in ${team.drifts} of ${team.tracked_matches} tracked matches.`;
  if (team.steams > team.drifts && team.steams >= 3) return `Shortened in ${team.steams} of ${team.tracked_matches} tracked matches.`;
  return 'No repeated market direction yet.';
}

function MatchHistory({ rows }: { rows: TeamMarketMatch[] }) {
  const { mode } = useTimePreference();
  const { format: oddsFormat } = useOddsFormat();
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs text-slate-300">
        <caption className="sr-only">Previous matches, Pinnacle prices and market direction</caption>
        <thead className="border-b border-slate-700 text-slate-400">
          <tr>
            <th scope="col" className="text-left font-medium pb-2 pr-3">Match</th>
            <th scope="col" className="text-right font-medium pb-2 px-2">First / close</th>
            <th scope="col" className="text-right font-medium pb-2 px-2">Movement</th>
            <th scope="col" title="Result and home–away score" className="text-right font-medium pb-2 pl-2">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/60">
          {rows.map(row => (
            <tr key={row.match_id}>
              <td className="py-3 pr-3 min-w-28">
                <Link className="text-cyan-300 hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-cyan-300" to={`/match/${row.match_id}`}>
                  {row.opponent} ({row.venue === 'home' ? 'H' : 'A'})
                </Link>
                <div className="text-slate-400 mt-0.5">{formatKickoff(parseUtc(row.kickoff), 'd MMM', mode)}</div>
              </td>
              <td className="text-right px-2 py-3 tabular-nums whitespace-nowrap">
                {row.opening_odds != null && row.closing_odds != null
                  ? `${formatOdds(row.opening_odds, oddsFormat)} / ${formatOdds(row.closing_odds, oddsFormat)}` : 'Unavailable'}
              </td>
              <td className={`text-right px-2 py-3 ${directions[row.direction].className}`}>
                {directions[row.direction].label}
                {row.direction === 'drift' && row.largest_drift_pp != null && <div className="tabular-nums text-slate-400 whitespace-nowrap mt-0.5">−{row.largest_drift_pp.toFixed(1)}pp peak</div>}
                {row.direction === 'steam' && row.largest_steam_pp != null && <div className="tabular-nums text-slate-400 whitespace-nowrap mt-0.5">+{row.largest_steam_pp.toFixed(1)}pp peak</div>}
                {row.direction === 'both' && row.largest_drift_pp != null && row.largest_steam_pp != null && <div className="tabular-nums text-slate-400 whitespace-nowrap mt-0.5">−{row.largest_drift_pp.toFixed(1)} / +{row.largest_steam_pp.toFixed(1)}pp peaks</div>}
                {row.direction === 'quiet' && row.close_move_pp != null && <div className="tabular-nums text-slate-400 whitespace-nowrap mt-0.5">{row.close_move_pp > 0 ? '+' : ''}{row.close_move_pp.toFixed(1)}pp at close</div>}
              </td>
              <td className="text-right pl-2 py-3 tabular-nums whitespace-nowrap">
                <span className="font-semibold">{row.result}</span>
                <span className="text-slate-400 ml-1">{row.home_score}–{row.away_score}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamSummary({ team }: { team: TeamMarketHistory }) {
  const frequent = team.drifts >= team.steams ? 'drift' : 'steam';
  const count = frequent === 'drift' ? team.drifts : team.steams;
  const record = team.records[frequent];
  return (
    <article className="min-w-0 p-4 sm:p-6">
      <h3 className="font-bold text-lg text-white">{team.team}</h3>
      <p className="text-sm text-slate-200 mt-1">{headline(team)}</p>
      {team.tracked_matches > 0 && <>
        <dl className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-xs">
          {([
            ['Drifted', team.drifts, 'text-emerald-300'],
            ['Shortened', team.steams, 'text-red-300'],
            ['Little change', team.quiet, 'text-slate-300'],
            ...(team.both ? [['Both ways', team.both, 'text-amber-300']] : []),
          ] as [string, number, string][]).map(([label, value, color]) => (
            <div key={label} className="flex gap-1.5 items-baseline">
              <dt className="text-slate-400">{label}</dt><dd className={`font-semibold tabular-nums ${color}`}>{value}</dd>
            </div>
          ))}
        </dl>
        {count > 0 && <p className="mt-3 text-xs text-slate-400">
          Results when {frequent === 'drift' ? 'drifting' : 'shortening'}:{' '}
          <span className="text-slate-200 tabular-nums">{record.wins}W · {record.draws}D · {record.losses}L</span>
        </p>}
      </>}
      {team.unavailable_matches > 0 && <p className="mt-3 text-xs text-slate-400">
        {team.unavailable_matches} of {team.completed_matches} completed matches lack enough Pinnacle prices.
      </p>}
      {team.recent.length > 0 && <div className="mt-4">
        <div className="text-xs text-slate-400 mb-2">Last {team.recent.length} matches · newest first</div>
        <ol className="flex gap-2 flex-wrap" aria-label={`${team.team} recent market direction`}>
          {team.recent.map(row => (
            <li key={row.match_id}>
              <Link to={`/match/${row.match_id}`}
                aria-label={`${row.venue === 'home' ? 'Home' : 'Away'} against ${row.opponent}: ${directions[row.direction].label}, result ${row.result}`}
                title={`${row.opponent} (${row.venue === 'home' ? 'H' : 'A'}) · ${directions[row.direction].label} · ${row.result}`}
                className={`inline-flex items-center justify-center min-h-11 px-3 rounded-md border border-slate-600 text-xs font-medium hover:bg-slate-700/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${directions[row.direction].className}`}>
                {directions[row.direction].short}
              </Link>
            </li>
          ))}
        </ol>
      </div>}
      {team.history.length > 0 && <details className="mt-4 group">
        <summary className="w-fit min-h-11 flex items-center gap-2 cursor-pointer list-none text-sm font-semibold text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 [&::-webkit-details-marker]:hidden">
          View match history
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 group-open:rotate-180"><path d="m4 6 4 4 4-4" /></svg>
        </summary>
        <MatchHistory rows={team.history} />
      </details>}
    </article>
  );
}

export default function TeamMarketContext({ matchId }: { matchId: string }) {
  const [state, setState] = useState<{ matchId: string; data?: TeamMarketContextData; error?: boolean }>({ matchId });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.hidden) return;
      getTeamMarketContext(matchId, controller.signal)
        .then(data => { if (!controller.signal.aborted) setState({ matchId, data }); })
        .catch(() => { if (!controller.signal.aborted) setState(previous => previous.matchId === matchId && previous.data
          ? { ...previous, error: true } : { matchId, error: true }); });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [matchId, retry]);
  const data = state.matchId === matchId ? state.data : undefined;
  const error = state.matchId === matchId && state.error;
  return (
    <section aria-labelledby="team-market-heading" className="rounded-xl sm:rounded-2xl border border-slate-700/50 bg-slate-800/80 mb-6 sm:mb-8 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-700/50 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="team-market-heading" className="text-base sm:text-xl font-bold text-white">Team market history</h2>
        <span className="text-xs text-slate-300">Pinnacle{data ? ` · ${data.season} · ${data.historical ? 'before this match' : data.league_name}` : ''}</span>
      </div>
      {!data && !error && <p role="status" className="p-4 sm:p-6 text-sm text-slate-300">Loading team market history…</p>}
      {data && <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700/50">
        {data.teams.map(team => <TeamSummary key={team.team} team={team} />)}
      </div>}
      {error && <div role="status" className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        {data ? 'Refresh failed. Showing the last loaded history.' : 'Team market history could not load.'}
        <button onClick={() => setRetry(value => value + 1)} className="min-h-11 text-cyan-300 font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-cyan-300">Try again</button>
      </div>}
      {data && <details className="border-t border-slate-700/50 px-4 sm:px-6 py-1">
        <summary className="cursor-pointer min-h-11 flex items-center text-xs text-slate-300 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300">How these patterns are counted</summary>
        <p className="text-xs text-slate-300 leading-relaxed max-w-prose pb-4">
          Completed matches in this competition, earlier this season and before this fixture. A meaningful move is at least {data.threshold_pp} percentage points in implied probability from the first tracked Pinnacle price, observed during the final {data.window_minutes / 60} hours before kickoff.
          {' '}Each match counts once. A move in both directions is labelled “Both ways”. We require a price within {data.max_close_age_minutes} minutes of kickoff; incomplete history is excluded from the tracked sample. “Little change” means no move met the threshold. Historical patterns describe price movement, not its cause or a betting recommendation.
        </p>
      </details>}
    </section>
  );
}
