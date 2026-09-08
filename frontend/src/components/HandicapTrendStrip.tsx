import { useId, useMemo } from 'react';
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SpreadsPoint, TotalsPoint } from '../types';
import { impliedHandicapHistory, type HandicapTrendPoint } from '../utils/impliedHandicap';
import { formatKickoff } from '../utils/time';
import { formatHandicap } from '../utils/handicapHistory';
import { useTimePreference } from '../contexts/TimePreferenceContext';
import { filterByTimeFrame, type TimeFrame } from './TimeFrameFilter';

const COLOR = '#e879f9';
const EMPTY_TOTALS: TotalsPoint[] = [];
const signed = (v: number) => {
  const rounded = Math.round(v * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
};

function TrendTooltip({ active, payload, homeTeam, awayTeam }: {
  active?: boolean; payload?: ReadonlyArray<{ payload?: HandicapTrendPoint }>; homeTeam: string; awayTeam: string;
}) {
  const { mode } = useTimePreference();
  const p = payload?.[0]?.payload;
  if (!active || !p || p.homeGap === null || p.totalGoals === null) return null;
  return <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs shadow-xl space-y-1 max-w-80">
    <p className="text-slate-400">{formatKickoff(p.timestamp, 'd MMM yyyy, HH:mm', mode)}</p>
    <p className="text-fuchsia-400 font-semibold">{signed(p.homeGap)} goals · {homeTeam} minus {awayTeam}</p>
    <p className="text-slate-300">Implied goals: {((p.totalGoals + p.homeGap) / 2).toFixed(2)} – {((p.totalGoals - p.homeGap) / 2).toFixed(2)}</p>
    <p className="text-slate-400">Main handicap: {homeTeam} {formatHandicap(p.line)}</p>
    {p.totalTimestamp && <p className="text-slate-400">Totals paired from {formatKickoff(p.totalTimestamp, 'd MMM, HH:mm', mode)}</p>}
  </div>;
}

export default function HandicapTrendStrip({ data, totals = EMPTY_TOTALS, homeTeam, awayTeam, timeFrame }: {
  data: SpreadsPoint[]; totals?: TotalsPoint[]; homeTeam: string; awayTeam: string; timeFrame: TimeFrame;
}) {
  const gradient = useId();
  const { mode } = useTimePreference();
  const history = useMemo(() => impliedHandicapHistory(data, totals), [data, totals]);
  // Pair against full earlier history before applying the displayed time window.
  const points = filterByTimeFrame(history, timeFrame);
  const valid = points.filter((p): p is HandicapTrendPoint & { homeGap: number } => p.homeGap !== null);
  const first = valid[0], last = points.at(-1);
  const latest = last?.homeGap;
  const delta = first && latest != null && valid.length >= 2 ? latest - first.homeGap : null;
  const title = delta === null ? 'Trend unavailable for this range'
    : delta > .05 ? `Towards ${homeTeam}` : delta < -.05 ? `Towards ${awayTeam}` : 'Little net change';
  const values = valid.map(p => p.homeGap);
  const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 0;
  const pad = Math.max(.05, (.2 - (max - min)) / 2);
  return <section aria-label="Market-implied team advantage" className="bg-slate-900/40 rounded-xl border border-fuchsia-400/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
      <div><p className="text-[11px] font-mono uppercase tracking-wider text-slate-300">● Market-implied team advantage</p>
        <h3 className="text-fuchsia-400 font-semibold text-lg mt-1">{title}{delta !== null && Math.abs(delta) > .05 ? ` · ${Math.abs(delta).toFixed(2)} goals` : ''}</h3>
        <p className="text-xs text-slate-400 mt-1">{homeTeam} minus {awayTeam} · {timeFrame === 'all' ? 'Full history' : `Last ${timeFrame}`}</p>
      </div>
      <div className="flex gap-4 text-xs font-mono text-slate-400"><span>First paired<strong className="block text-slate-200 text-lg">{first ? signed(first.homeGap) : '—'}</strong></span>
        <span>Latest<strong className="block text-fuchsia-400 text-lg">{latest != null ? signed(latest) : '—'}</strong></span></div>
    </div>
    {valid.length ? <div className="h-32" role="img" aria-label={`Market-implied goal difference; rising towards ${homeTeam}, falling towards ${awayTeam}`}>
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLOR} stopOpacity={.25} /><stop offset="100%" stopColor={COLOR} stopOpacity={0} /></linearGradient></defs>
        <XAxis type="number" scale="time" dataKey="time" domain={['dataMin', 'dataMax']} minTickGap={65} tickLine={false} axisLine={false}
          tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => formatKickoff(new Date(v), 'd/M HH:mm', mode)} />
        <YAxis width={43} domain={[min - pad, max + pad]} tickCount={3} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={signed} />
        <Tooltip content={<TrendTooltip homeTeam={homeTeam} awayTeam={awayTeam} />} cursor={{ stroke: COLOR, strokeOpacity: .4 }} />
        <Area type="stepAfter" dataKey="homeGap" stroke="none" fill={`url(#${gradient})`} connectNulls={false} isAnimationActive={false} />
        <Line type="stepAfter" dataKey="homeGap" stroke={COLOR} strokeWidth={2.3} connectNulls={false} isAnimationActive={false} dot={valid.length < 3 ? { r: 3 } : false} />
      </ComposedChart></ResponsiveContainer>
    </div> : <p className="text-sm text-slate-400 py-3">A usable earlier Over/Under quote and both handicap prices are needed. Recorded handicap prices are still available below.</p>}
    <p className="text-xs text-slate-400 mt-2">Rising = towards {homeTeam}. Falling = towards {awayTeam}. Zero = equal expected goals.</p>
    {first && last && <p className="text-[10px] text-slate-500 mt-1">First paired {formatKickoff(first.timestamp, 'd MMM, HH:mm', mode)} · Latest handicap quote {formatKickoff(last.timestamp, 'd MMM, HH:mm', mode)}</p>}
    {points.some(p => p.homeGap === null) && <p className="text-xs text-amber-300 mt-2">Gaps mark missing, invalid or unpaired data. Totals must be from the preceding 30 minutes; future quotes are never used.</p>}
    <p className="text-[10px] text-slate-500 mt-2">Estimated from Pinnacle handicap and Over/Under prices after margin removal. Uses a Poisson score model with whole, half and quarter-goal settlement. Includes venue effects.</p>
  </section>;
}
