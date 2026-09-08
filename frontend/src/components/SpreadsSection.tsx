import { useState } from 'react';
import type { MatchSpreads, TotalsPoint } from '../types';
import TimeFrameFilter, { filterByTimeFrame, type TimeFrame } from './TimeFrameFilter';
import SpreadsChart from './SpreadsChart';
import HandicapTrendStrip from './HandicapTrendStrip';
import { formatHandicap, handicapLines, handicapView, orderedHandicaps, sameHandicap } from '../utils/handicapHistory';
import { useOddsFormat } from '../contexts/OddsFormatContext';
import { useTimePreference } from '../contexts/TimePreferenceContext';
import { formatOdds } from '../utils/odds';
import { formatKickoff } from '../utils/time';

interface Props { spreads: MatchSpreads; totals?: TotalsPoint[]; homeTeam: string; awayTeam: string; timeFrame: TimeFrame; onTimeFrameChange: (tf: TimeFrame) => void }

export default function SpreadsSection({ spreads, totals, homeTeam, awayTeam, timeFrame, onTimeFrameChange }: Props) {
  const { format: oddsFormat } = useOddsFormat();
  const { mode } = useTimePreference();
  const [choice, setChoice] = useState<{ match: string; line: number } | null>(null);
  const history = orderedHandicaps(spreads.spreads_history);
  const latest = history.at(-1);
  if (!latest) return null;
  const lines = handicapLines(history);
  const selected = choice?.match === spreads.match_id && lines.some(l => sameHandicap(l, choice.line)) ? choice.line : latest.line;
  const window = filterByTimeFrame(history, timeFrame);
  const view = handicapView(window, selected);
  const currentLine = sameHandicap(selected, latest.line);
  const title = view.count === 0 ? 'No quotes at this handicap in this time range'
    : view.direction === 'home' ? `${homeTeam} shortened at ${formatHandicap(selected)}`
    : view.direction === 'away' ? `${awayTeam} shortened at ${formatHandicap(-selected)}`
    : view.direction === 'unchanged' ? 'Prices unchanged at this handicap'
    : view.direction === 'mixed' ? 'Prices moved together or on one side only'
    : 'More quotes needed for a comparison';
  const dateLabel = (timestamp: string) => formatKickoff(timestamp, 'd MMM, HH:mm', mode);
  const hasOtherLines = window.some(p => !sameHandicap(p.line, selected));
  return <section aria-label="Asian Handicap" className="bg-slate-800/80 rounded-xl sm:rounded-2xl border border-slate-700/50 overflow-hidden mb-6 sm:mb-8 card-shadow">
    <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-700/30 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <h2 className="text-base sm:text-lg font-bold text-white">Asian Handicap</h2>
      <TimeFrameFilter value={timeFrame} onChange={onTimeFrameChange} />
    </div>
    <div className="p-4 sm:p-6 space-y-5">
      <HandicapTrendStrip data={spreads.spreads_history} totals={totals} homeTeam={homeTeam} awayTeam={awayTeam} timeFrame={timeFrame} />
      <details><summary className="text-sm text-slate-300 cursor-pointer">Recorded prices & handicap changes</summary><div className="space-y-5 mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs text-slate-400 space-y-1.5 min-w-0 max-w-full"><span className="block">Compare prices at one handicap</span>
          <select aria-label="Compare handicap" value={selected} onChange={e => setChoice({ match: spreads.match_id, line: Number(e.target.value) })}
            className="block max-w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm">
            {lines.map(line => <option key={line} value={line}>{homeTeam} {formatHandicap(line)} / {awayTeam} {formatHandicap(-line)}{sameHandicap(line, latest.line) ? ' · Latest main line' : ''}</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-400">Latest main line: <strong className="text-white">{homeTeam} {formatHandicap(latest.line)}</strong></p>
      </div>
      <div className={`rounded-xl border p-4 ${view.direction === 'home' ? 'bg-emerald-500/5 border-emerald-500/25' : view.direction === 'away' ? 'bg-orange-500/5 border-orange-500/25' : 'bg-slate-900/40 border-slate-700'}`}>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{timeFrame === 'all' ? 'Full history' : `Last ${timeFrame}`} · Same handicap comparison</p>
        <h3 className="font-semibold text-white">{title}</h3>
        {view.first && view.last && view.count > 1 && <p className="text-xs text-slate-400 mt-1">{dateLabel(view.first.timestamp)} → {dateLabel(view.last.timestamp)}. {currentLine ? 'Comparing the latest main line.' : 'Historical line; these are its last recorded prices.'}</p>}
        {view.direction === 'mixed' && <p className="text-xs text-slate-400 mt-1">This does not establish a clear move towards one team.</p>}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {(['home_odds', 'away_odds'] as const).map((side, i) => <div key={side} className="bg-slate-900/50 rounded-lg p-3 min-w-0">
            <p className={`text-xs font-medium ${i ? 'text-orange-400' : 'text-emerald-400'}`}>{i ? awayTeam : homeTeam} {formatHandicap(i ? -selected : selected)}</p>
            <p className="font-mono text-lg sm:text-2xl font-bold text-white mt-1">{view.count > 1 && <><span className="text-slate-400">{formatOdds(view.first?.[side], oddsFormat)}</span><span className="text-slate-500 mx-2">→</span></>}{formatOdds(view.last?.[side], oddsFormat)}</p>
            {view.changes[i] !== null ? <p className="text-xs text-slate-400 mt-1">{view.changes[i]! < -0.1 ? 'Shortened' : view.changes[i]! > 0.1 ? 'Drifted' : 'Unchanged'} · {view.changes[i]! > 0 ? '+' : ''}{view.changes[i]!.toFixed(1)}% price change</p>
              : <p className="text-xs text-slate-400 mt-1">{view.count ? 'Not enough prices to compare' : 'No quotes in this time range'}</p>}
          </div>)}
        </div>
        {view.last && <p className="text-xs text-slate-400 mt-3">Last recorded at this line: {dateLabel(view.last.timestamp)}{!currentLine ? ' · Not the latest main quote' : ''}</p>}
      </div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2"><h3 className="text-sm font-semibold text-white">Prices at {homeTeam} {formatHandicap(selected)}</h3><span className="text-xs text-slate-400">Decimal odds · Lower means shorter</span></div>
        <div className="h-56 sm:h-64"><SpreadsChart data={window} line={selected} homeTeam={homeTeam} awayTeam={awayTeam} /></div>
        <p className="text-xs text-slate-400 mt-2">{hasOtherLines ? 'Gaps show when the feed quoted a different handicap. No price at the selected line was recorded for those periods.' : 'Only recorded prices at the selected handicap are shown.'}</p>
      </div>
      <div className="border-t border-slate-700/60 pt-4">
        <h3 className="text-sm font-semibold text-white">Main handicap changes</h3>
        <p className="text-xs text-slate-400 mt-1">{homeTeam}’s handicap. Positive = goals received; negative = goals given. A line change changes the bet and can reset its price.</p>
        <div className="h-28 mt-2"><SpreadsChart data={window} line={selected} homeTeam={homeTeam} awayTeam={awayTeam} timeline /></div>
      </div>
      </div></details>
    </div>
  </section>;
}
