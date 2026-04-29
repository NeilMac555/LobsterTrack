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
import type { TotalsPoint } from '../types';
import { filterByTimeFrame, type TimeFrame } from './TimeFrameFilter';

// Shared terminal-feel typography and palette (mirrors OddsChart).
const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const AXIS_TICK = {
  fill: '#94a3b8',
  fontSize: 10,
  fontFamily: MONO_STACK,
  letterSpacing: '-0.02em',
};
const COLOR_OVER = '#34d399';  // emerald-400
const COLOR_UNDER = '#fb923c'; // orange-400
const COLOR_LINE_SHIFT = '#fbbf24'; // amber-400 — high-contrast against the green/orange odds lines

interface TotalsChartProps {
  data: TotalsPoint[];
  timeFrame?: TimeFrame;
}

export default function TotalsChart({ data, timeFrame = 'all' }: TotalsChartProps) {
  const filteredData = filterByTimeFrame(data, timeFrame);

  const openingTotals = data.length > 0 ? data[0] : null;

  const chartData = filteredData.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), 'MMM d, HH:mm'),
    shortTime: format(new Date(point.timestamp), 'd/M HH:mm'),
    fullTime: format(new Date(point.timestamp), 'MMM d, yyyy HH:mm'),
    timestamp: new Date(point.timestamp).getTime(),
  }));

  // Find every point where Pinnacle moved the goals line. We render a
  // dashed amber vertical at each transition so the user can't miss it
  // — without context, a jump in Over/Under odds at the moment the line
  // shifts looks like a steam move when it's really just a different bet.
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
                {dataPoint?.line?.toFixed(2) ?? '-'}
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
        <p className="text-slate-500 text-sm">No totals history available</p>
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
            <linearGradient id="totalsArea-over" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_OVER} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COLOR_OVER} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="totalsArea-under" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_UNDER} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COLOR_UNDER} stopOpacity={0} />
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
          {openingTotals?.over_odds && (
            <ReferenceLine y={openingTotals.over_odds} stroke={COLOR_OVER} strokeDasharray="2 4" strokeOpacity={0.25} />
          )}
          {openingTotals?.under_odds && (
            <ReferenceLine y={openingTotals.under_odds} stroke={COLOR_UNDER} strokeDasharray="2 4" strokeOpacity={0.25} />
          )}

          {/* Line-shift markers — vertical amber dashes labelled with the new
              line so the user immediately understands "the odds jumped here
              because the bookmaker moved from O/U 2.5 to O/U 2.75". */}
          {lineShifts.map((s, i) => (
            <ReferenceLine
              key={`shift-${i}`}
              x={s.shortTime}
              stroke={COLOR_LINE_SHIFT}
              strokeDasharray="4 3"
              strokeWidth={1.6}
              strokeOpacity={0.85}
              ifOverflow="extendDomain"
              label={{
                value: `→ ${s.to.toFixed(2)}`,
                position: 'top',
                fill: COLOR_LINE_SHIFT,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: MONO_STACK,
              }}
            />
          ))}

          {/* Area fills underneath */}
          <Area type="monotone" dataKey="over_odds" stroke="none" fill="url(#totalsArea-over)" isAnimationActive={false} activeDot={false} />
          <Area type="monotone" dataKey="under_odds" stroke="none" fill="url(#totalsArea-under)" isAnimationActive={false} activeDot={false} />

          {/* Lines on top */}
          <Line
            type="monotone"
            dataKey="over_odds"
            name="Over"
            stroke={COLOR_OVER}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 5, fill: COLOR_OVER, stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="under_odds"
            name="Under"
            stroke={COLOR_UNDER}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 5, fill: COLOR_UNDER, stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
