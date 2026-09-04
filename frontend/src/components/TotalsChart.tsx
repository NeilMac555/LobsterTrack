import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
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

  const baseData = filteredData.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), 'MMM d, HH:mm'),
    shortTime: format(new Date(point.timestamp), 'd/M HH:mm'),
    dayLabel: format(new Date(point.timestamp), 'EEE d MMM'),
    clockLabel: format(new Date(point.timestamp), 'HH:mm'),
    fullTime: format(new Date(point.timestamp), 'MMM d, yyyy HH:mm'),
    timestamp: new Date(point.timestamp).getTime(),
  }));

  // Find every point where Pinnacle moved the goals line. We render a
  // dashed amber vertical at each transition so the user can't miss it
  // — without context, a jump in Over/Under odds at the moment the line
  // shifts looks like a steam move when it's really just a different bet.
  // X-axis ticks: one per calendar day (first point of each day), labelled
  // with the date; exact times live in the tooltip. Single-day windows
  // (1H/2H/6H frames) fall back to clock ticks. Same as OddsChart.
  const dayTicks: string[] = [];
  const tickLabel = new Map<string, string>();
  {
    let lastDay = '';
    for (const pt of baseData) {
      if (pt.dayLabel !== lastDay) {
        dayTicks.push(pt.shortTime);
        tickLabel.set(pt.shortTime, pt.dayLabel);
        lastDay = pt.dayLabel;
      }
    }
  }
  const singleDay = dayTicks.length <= 1;
  const xTickFormatter = (v: string) => {
    if (singleDay) {
      const pt = baseData.find((d) => d.shortTime === v);
      return pt ? pt.clockLabel : v;
    }
    return tickLabel.get(v) ?? '';
  };
  // Y-axis scaled to the data with a little headroom (the old area fills
  // anchored it at zero).
  const padDomain: [(min: number) => number, (max: number) => number] = [
    (min) => (min - Math.max((min || 1) * 0.06, 0.05)),
    (max) => (max + Math.max((max || 1) * 0.06, 0.05)),
  ];

  const lineShifts: Array<{ shortTime: string; from: number; to: number }> = [];
  for (let i = 1; i < baseData.length; i++) {
    const prev = baseData[i - 1].line;
    const curr = baseData[i].line;
    if (prev != null && curr != null && Math.abs(prev - curr) > 0.001) {
      lineShifts.push({
        shortTime: baseData[i].shortTime,
        from: prev,
        to: curr,
      });
    }
  }

  // Group consecutive same-line points into segments so we can shade
  // each one a slightly different background and label it with the
  // line value — the reader can see at a glance which stretch of the
  // chart was Over/Under 2.75 vs 3.0 vs 3.25 without hovering.
  const segments: Array<{ line: number; startTime: string; endTime: string }> = [];
  for (const point of baseData) {
    if (point.line == null) continue;
    const last = segments[segments.length - 1];
    if (last && Math.abs(last.line - point.line) < 0.001) {
      last.endTime = point.shortTime;
    } else {
      segments.push({ line: point.line, startTime: point.shortTime, endTime: point.shortTime });
    }
  }

  // Over/Under prices at one line aren't comparable to prices at another
  // line — Over 2.75 @ 1.95 and Over 3.0 @ 1.95 mean different things.
  // Connecting them with a straight line draws a misleading diagonal
  // "wall" right at the moment the line shifts. Instead we insert a
  // null-value gap point at each shift boundary and disable connectNulls
  // so the Over/Under lines visibly BREAK there instead of joining two
  // incomparable price levels.
  const chartData: typeof baseData = [];
  for (let i = 0; i < baseData.length; i++) {
    if (
      i > 0 &&
      baseData[i].line != null &&
      baseData[i - 1].line != null &&
      Math.abs((baseData[i].line as number) - (baseData[i - 1].line as number)) > 0.001
    ) {
      chartData.push({
        ...baseData[i - 1],
        over_odds: null as unknown as number,
        under_odds: null as unknown as number,
      });
    }
    chartData.push(baseData[i]);
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
      {/* Watermark — discreet corner mark, same as OddsChart */}
      <div className="absolute bottom-7 right-3 pointer-events-none select-none z-10">
        <span className="text-white/[0.12] text-[11px] sm:text-xs font-mono font-semibold uppercase tracking-[0.2em] whitespace-nowrap">
          steamwatch.io
        </span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
          

          <CartesianGrid strokeDasharray="2 6" stroke="#475569" strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="shortTime"
            stroke="#475569"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: '#334155', strokeWidth: 1 }}
            ticks={singleDay ? undefined : dayTicks}
            tickFormatter={xTickFormatter}
            interval={singleDay ? 'preserveStartEnd' : 0}
            minTickGap={singleDay ? 40 : 0}
          />
          <YAxis
            stroke="#475569"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            domain={padDomain}
            tickFormatter={(value) => value.toFixed(2)}
            width={42}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.5 }}
            offset={15}
            allowEscapeViewBox={{ x: false, y: true }}
          />

          {/* Alternating background bands, one per distinct line value, each
              labelled with the line so a reader can tell at a glance which
              stretch of the chart was Over/Under 2.75 vs 3.0 vs 3.25 etc
              without hovering for the tooltip. */}
          {segments.map((seg, i) => (
            <ReferenceArea
              key={`seg-${i}`}
              x1={seg.startTime}
              x2={seg.endTime}
              fill={i % 2 === 0 ? 'rgba(148,163,184,0.05)' : 'rgba(148,163,184,0.11)'}
              stroke="none"
              ifOverflow="extendDomain"
              label={{
                value: seg.line.toFixed(2),
                position: 'insideTop',
                fill: '#fbbf24',
                fontSize: 10,
                fontFamily: MONO_STACK,
                fontWeight: 700,
              }}
            />
          ))}

          {/* Opening price reference lines */}
          {openingTotals?.over_odds && (
            <ReferenceLine y={openingTotals.over_odds} stroke={COLOR_OVER} strokeDasharray="2 4" strokeOpacity={0.25} />
          )}
          {openingTotals?.under_odds && (
            <ReferenceLine y={openingTotals.under_odds} stroke={COLOR_UNDER} strokeDasharray="2 4" strokeOpacity={0.25} />
          )}

          {/* Line-shift markers — thin amber verticals at each line change.
              We deliberately don't label them with the new line value any
              more (it was overflowing the chart and stacking up when shifts
              cluster). The LINE MOVED strip rendered above the chart by
              LineHistoryStrip is the canonical reference for the sequence
              of line moves; these markers just align the price movement
              visually with the moments those shifts happened. */}
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

          {/* Area fills underneath — connectNulls=false so the fill breaks
              at each line-shift gap point instead of bridging two
              incomparable price levels. */}

          {/* Lines on top — connectNulls=false breaks the line at each
              line-shift gap point (see chartData construction above)
              instead of drawing a misleading diagonal between an Over
              2.75 price and an Over 3.0 price. */}
          <Line
            type="stepAfter"
            dataKey="over_odds"
            name="Over"
            stroke={COLOR_OVER}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 5, fill: COLOR_OVER, stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={300}
          />
          <Line
            type="stepAfter"
            dataKey="under_odds"
            name="Under"
            stroke={COLOR_UNDER}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 5, fill: COLOR_UNDER, stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
