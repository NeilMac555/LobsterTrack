import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { SpreadsPoint } from '../types';
import { handicapView, formatHandicap, handicapLines } from '../utils/handicapHistory';
import { useTimePreference } from '../contexts/TimePreferenceContext';
import { useOddsFormat } from '../contexts/OddsFormatContext';
import { formatKickoff } from '../utils/time';
import { formatOdds } from '../utils/odds';

const HOME = '#34d399', AWAY = '#fb923c';
const TICK = { fill: '#94a3b8', fontSize: 10, fontFamily: '"JetBrains Mono", ui-monospace, monospace' };
interface Props { data: SpreadsPoint[]; line: number; homeTeam: string; awayTeam: string; timeline?: boolean }
interface TooltipPoint { timestamp: string; line: number; home_odds: number | null; away_odds: number | null }

function HandicapTooltip({ active, payload, homeTeam, awayTeam, line, timeline }: {
  active?: boolean; payload?: ReadonlyArray<{ payload?: TooltipPoint }>; homeTeam: string; awayTeam: string; line: number; timeline: boolean;
}) {
  const { mode } = useTimePreference();
  const { format: oddsFormat } = useOddsFormat();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const handicap = timeline ? point.line : line;
  return <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 shadow-xl text-xs space-y-2 max-w-72">
    <p className="text-slate-400">{formatKickoff(point.timestamp, 'd MMM yyyy, HH:mm', mode)}</p>
    <p className="text-emerald-400">{homeTeam} {formatHandicap(handicap)}{!timeline && ' · ' + formatOdds(point.home_odds, oddsFormat)}</p>
    <p className="text-orange-400">{awayTeam} {formatHandicap(-handicap)}{!timeline && ' · ' + formatOdds(point.away_odds, oddsFormat)}</p>
  </div>;
}

export default function SpreadsChart({ data, line, homeTeam, awayTeam, timeline = false }: Props) {
  const { mode } = useTimePreference();
  const view = handicapView(data, line);
  const chart = timeline ? data.map(p => ({ ...p, time: Date.parse(p.timestamp) })) : view.chart;
  const ticks = handicapLines(data);
  if (!data.length) return <div className="h-full flex items-center justify-center text-slate-400 text-sm">No quotes in this time range.</div>;
  if (!timeline && !view.chart.some(p => p.home_odds !== null || p.away_odds !== null)) return <div className="h-full flex items-center justify-center text-slate-400 text-sm">No recorded prices at this handicap in this time range.</div>;
  return <div className="h-full w-full relative" role="img" aria-label={timeline ? 'Main handicap history for ' + homeTeam : 'Recorded prices for ' + homeTeam + ' ' + formatHandicap(line) + ' and ' + awayTeam + ' ' + formatHandicap(-line)}>
    {!timeline && <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"><span className="text-white/5 text-3xl sm:text-6xl font-black tracking-widest -rotate-12">steamwatch.io</span></div>}
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chart} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
        <CartesianGrid strokeDasharray="2 6" stroke="#475569" strokeOpacity={0.4} vertical={false} />
        <XAxis type="number" dataKey="time" scale="time" domain={['dataMin', 'dataMax']} tick={TICK} tickLine={false} minTickGap={45}
          tickFormatter={value => formatKickoff(new Date(value), 'd/M HH:mm', mode)} stroke="#334155" />
        <YAxis tick={TICK} tickLine={false} axisLine={false} width={48}
          domain={timeline ? [Math.min(...ticks) - 0.125, Math.max(...ticks) + 0.125] : ['auto', 'auto']}
          ticks={timeline ? ticks : undefined} tickFormatter={value => timeline ? formatHandicap(value) : value.toFixed(2)} />
        <Tooltip content={<HandicapTooltip homeTeam={homeTeam} awayTeam={awayTeam} line={line} timeline={timeline} />}
          cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3', strokeOpacity: 0.5 }} />
        {timeline ? <Line type="stepAfter" dataKey="line" stroke="#fbbf24" strokeWidth={2} dot={data.length === 1 ? { r: 3 } : false} isAnimationActive={false} />
          : <>{(['home_odds', 'away_odds'] as const).map((side, i) => <Line key={side} type="stepAfter" dataKey={side} name={i ? awayTeam : homeTeam}
            stroke={i ? AWAY : HOME} strokeWidth={2.2} connectNulls={false} isAnimationActive={false}
            dot={{ r: 1.5, strokeWidth: 0 }} activeDot={{ r: 4, stroke: '#0f172a', strokeWidth: 2 }} />)}</>}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}
