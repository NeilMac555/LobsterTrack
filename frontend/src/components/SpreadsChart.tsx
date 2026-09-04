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

  const baseData = filteredData.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), 'MMM d, HH:mm'),
    shortTime: format(new Date(point.timestamp), 'd/M HH:mm'),
    dayLabel: format(new Date(point.timestamp), 'EEE d MMM'),
    clockLabel: format(new Date(point.timestamp), 'HH:mm'),
    fullTime: format(new Date(point.timestamp), 'MMM d, yyyy HH:mm'),
    timestamp: new Date(point.timestamp).getTime(),
  }));

  // Detect AH line shifts (e.g. -0.5 → -0.75) so we can mark them on the chart.
  // Without this, a sudden home/away odds jump at the moment of the line move
  // looks like a steam move when it's really just a different bet.
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

  // Group consecutive same-line points into segments so each stretch
  // of the chart can be shaded and labelled with the AH line that was
  // active — same rationale as TotalsChart.
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

  // Home/Away prices at one AH line aren't comparable to prices at a
  // different line — connecting them draws a misleading diagonal right
  // at the shift. Insert a null-value gap point at each boundary and
  // disable connectNulls so the lines visibly break instead of joining
  // two incomparable price levels.
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
        home_odds: null as unknown as number,
        away_odds: null as unknown as number,
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

          {/* Alternating background bands, one per distinct AH line,
              labelled so a reader can tell at a glance which stretch of
              the chart was -0.5 vs -0.75 vs -1.0 etc without hovering. */}
          {segments.map((seg, i) => (
            <ReferenceArea
              key={`seg-${i}`}
              x1={seg.startTime}
              x2={seg.endTime}
              fill={i % 2 === 0 ? 'rgba(148,163,184,0.05)' : 'rgba(148,163,184,0.11)'}
              stroke="none"
              ifOverflow="extendDomain"
              label={{
                value: `${seg.line >= 0 ? '+' : ''}${seg.line.toFixed(2)}`,
                position: 'insideTop',
                fill: '#fbbf24',
                fontSize: 10,
                fontFamily: MONO_STACK,
                fontWeight: 700,
              }}
            />
          ))}

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

          {/* Area fills underneath — connectNulls=false so the fill breaks
              at each line-shift gap point instead of bridging two
              incomparable price levels. */}

          {/* Lines on top — connectNulls=false breaks the line at each
              line-shift gap point instead of drawing a misleading
              diagonal between two different AH lines' prices. */}
          <Line
            type="stepAfter"
            dataKey="home_odds"
            name="Home"
            stroke={COLOR_HOME}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 5, fill: COLOR_HOME, stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={300}
          />
          <Line
            type="stepAfter"
            dataKey="away_odds"
            name="Away"
            stroke={COLOR_AWAY}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 5, fill: COLOR_AWAY, stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
