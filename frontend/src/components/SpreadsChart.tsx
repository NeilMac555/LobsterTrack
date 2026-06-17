import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import type { SpreadsPoint } from '../types';
import { filterByTimeFrame, type TimeFrame } from './TimeFrameFilter';

// Shared terminal-feel typography and palette (mirrors OddsChart / TotalsChart).
const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const AXIS_TICK = {
  fill: '#94a3b8',
  fontSize: 10,
  fontFamily: MONO_STACK,
  letterSpacing: '-0.02em',
};
const COLOR_HOME = '#34d399';  // emerald-400
const COLOR_AWAY = '#fb923c';  // orange-400
const COLOR_LINE_SHIFT = '#fbbf24'; // amber-400 — high contrast on the green/orange odds lines

interface SpreadsChartProps {
  data: SpreadsPoint[];
  timeFrame?: TimeFrame;
}

export default function SpreadsChart({ data, timeFrame = 'all' }: SpreadsChartProps) {
  const filteredData = filterByTimeFrame(data, timeFrame);

  const openingSpreads = data.length > 0 ? data[0] : null;

  const chartData = filteredData.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), 'MMM d, HH:mm'),
    shortTime: format(new Date(point.timestamp), 'd/M HH:mm'),
    fullTime: format(new Date(point.timestamp), 'MMM d, yyyy HH:mm'),
    timestamp: new Date(point.timestamp).getTime(),
  }));

  // Detect AH line shifts (e.g. -0.5 → -0.75) so we can mark them on the chart.
  // Without this, a sudden home/away odds jump at the moment of the line move
  // looks like a steam move when it's really just a different bet.
  const lineShifts: Array<{ shortTime: string; from: number; to: number }> = [];
  for (let i = 1; i < chartData.length; i++) {
    const prev = chartData[i - 1].line;
    const curr = chartData[i].line;
    if (prev != null && curr != null && Math.abs(prev - curr) > 0.001) {
      lineShifts.push({
        shortTime: chartData[i].shortTime,
        from: prev,
        to: curr,
      });
    }
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      const seen = new Set<string>();
      const entries = (payload as any[]).filter((e) => {
        const k = e?.dataKey as string;
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return (
        <div
          className="bg-slate-900/95 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-2xl overflow-hidden"
          style={{
            animation: 'fadeIn 0.15s ease-out',
            boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          }}
        >
          <div className="px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/50">
            <p className="text-slate-300 text-[10px] font-mono uppercase tracking-[0.12em] font-semibold">
              {dataPoint?.fullTime || label}
            </p>
          </div>
          <div className="p-2 space-y-1 min-w-[160px]">
            <div className="flex items-center justify-between gap-4 px-1">
              <span className="text-slate-400 text-xs font-medium">Line</span>
              <span className="font-mono font-bold text-sm tabular-nums tracking-tight text-white">
                {dataPoint?.line >= 0 ? '+' : ''}{dataPoint?.line}
              </span>
            </div>
            {entries.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4 px-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}` }}
                  />
                  <span className="text-slate-300 text-xs font-medium">{entry.name}</span>
                </div>
                <span
                  className="font-mono font-bold text-sm tabular-nums tracking-tight"
                  style={{ color: entry.color }}
                >
                  {entry.value?.toFixed(2) ?? '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700">
        <p className="text-slate-500 text-sm">No spreads history available</p>
      </div>
    );
  }

  if (filteredData.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-slate-500 text-sm">No data in this time range</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
        <span className="text-white/10 text-5xl sm:text-7xl font-black tracking-widest -rotate-12 whitespace-nowrap">
          steamwatch.io
        </span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="spreadsArea-home" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_HOME} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COLOR_HOME} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="spreadsArea-away" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_AWAY} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COLOR_AWAY} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="2 6" stroke="#475569" strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="shortTime"
            stroke="#475569"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: '#334155', strokeWidth: 1 }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            stroke="#475569"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(value) => value.toFixed(2)}
            width={42}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.5 }}
            offset={15}
            allowEscapeViewBox={{ x: false, y: true }}
          />

          {/* Opening price reference lines */}
          {openingSpreads?.home_odds && (
            <ReferenceLine y={openingSpreads.home_odds} stroke={COLOR_HOME} strokeDasharray="2 4" strokeOpacity={0.25} />
          )}
          {openingSpreads?.away_odds && (
            <ReferenceLine y={openingSpreads.away_odds} stroke={COLOR_AWAY} strokeDasharray="2 4" strokeOpacity={0.25} />
          )}

          {/* AH line-shift markers — see TotalsChart for full rationale. */}
          {lineShifts.map((s, i) => (
            <ReferenceLine
              key={`shift-${i}`}
              x={s.shortTime}
              stroke={COLOR_LINE_SHIFT}
              strokeDasharray="3 4"
              strokeWidth={1}
              strokeOpacity={0.35}
              ifOverflow="extendDomain"
            />
          ))}

          {/* Area fills underneath */}
          <Area type="monotone" dataKey="home_odds" stroke="none" fill="url(#spreadsArea-home)" isAnimationActive={false} activeDot={false} />
          <Area type="monotone" dataKey="away_odds" stroke="none" fill="url(#spreadsArea-away)" isAnimationActive={false} activeDot={false} />

          {/* Lines on top */}
          <Line
            type="monotone"
            dataKey="home_odds"
            name="Home"
            stroke={COLOR_HOME}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 5, fill: COLOR_HOME, stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="away_odds"
            name="Away"
            stroke={COLOR_AWAY}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 5, fill: COLOR_AWAY, stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
