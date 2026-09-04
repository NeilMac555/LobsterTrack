import { useState } from 'react';
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

// Shared typography for all chart text — matches the site's terminal feel.
const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const AXIS_TICK = {
  fill: '#94a3b8',
  fontSize: 10,
  fontFamily: MONO_STACK,
  letterSpacing: '-0.02em',
};
// Series palette — desaturated a touch so the lines sit better on dark slate.
const COLOR_HOME = '#34d399'; // emerald-400
const COLOR_DRAW = '#fbbf24'; // amber-400
const COLOR_AWAY = '#f87171'; // red-400
import { format } from 'date-fns';
import type { OddsPoint } from '../types';
import { filterByTimeFrame, type TimeFrame } from './TimeFrameFilter';

interface OddsChartProps {
  data: OddsPoint[];
  homeTeam: string;
  awayTeam: string;
  timeFrame?: TimeFrame;
}

type ViewMode = 'odds' | 'percent' | 'implied';
type SelectedOutcome = 'all' | 'home' | 'draw' | 'away';

export default function OddsChart({ data, homeTeam, awayTeam, timeFrame = 'all' }: OddsChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('odds');
  const [selectedOutcome, setSelectedOutcome] = useState<SelectedOutcome>('all');

  const filteredData = filterByTimeFrame(data, timeFrame);

  // Get opening odds for reference lines and percentage calculations
  const openingOdds = data.length > 0 ? data[0] : null;

  const chartData = filteredData.map((point) => {
    const baseData = {
      ...point,
      time: format(new Date(point.timestamp), 'MMM d, HH:mm'),
      shortTime: format(new Date(point.timestamp), 'd/M HH:mm'),
      fullTime: format(new Date(point.timestamp), 'MMM d, yyyy HH:mm'),
      timestamp: new Date(point.timestamp).getTime(),
    };

    // Add percentage change from opening
    const pctData = openingOdds ? {
      home_pct: openingOdds.home_odds && point.home_odds !== null
        ? ((point.home_odds - openingOdds.home_odds) / openingOdds.home_odds) * 100
        : 0,
      draw_pct: openingOdds.draw_odds && point.draw_odds !== null
        ? ((point.draw_odds - openingOdds.draw_odds) / openingOdds.draw_odds) * 100
        : 0,
      away_pct: openingOdds.away_odds && point.away_odds !== null
        ? ((point.away_odds - openingOdds.away_odds) / openingOdds.away_odds) * 100
        : 0,
    } : { home_pct: 0, draw_pct: 0, away_pct: 0 };

    // Add implied probability (1/odds * 100)
    const impliedData = {
      home_impl: point.home_odds ? (1 / point.home_odds) * 100 : 0,
      draw_impl: point.draw_odds ? (1 / point.draw_odds) * 100 : 0,
      away_impl: point.away_odds ? (1 / point.away_odds) * 100 : 0,
    };

    return { ...baseData, ...pctData, ...impliedData };
  });

  // Handle legend click - toggle between single outcome and all
  const handleLegendClick = (outcome: 'home' | 'draw' | 'away') => {
    if (selectedOutcome === outcome) {
      setSelectedOutcome('all');
    } else {
      setSelectedOutcome(outcome);
    }
  };

  // Check if an outcome should be visible
  const isVisible = (outcome: 'home' | 'draw' | 'away') => {
    return selectedOutcome === 'all' || selectedOutcome === outcome;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      // De-dupe: with Area+Line overlays, Recharts emits 2 entries per series.
      // Filter by unique dataKey so the tooltip shows each outcome once.
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
            boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
          }}
        >
          {/* Header with timestamp — mono uppercase for the terminal feel */}
          <div className="px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/50">
            <p className="text-slate-300 text-[10px] font-mono uppercase tracking-[0.12em] font-semibold">
              {dataPoint?.fullTime || label}
            </p>
          </div>

          {/* Odds values */}
          <div className="p-2 space-y-1 min-w-[160px]">
            {entries.map((entry: any, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4 px-1"
              >
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
                  {viewMode === 'percent'
                    ? `${entry.value >= 0 ? '+' : ''}${entry.value?.toFixed(1)}%`
                    : viewMode === 'implied'
                    ? `${entry.value?.toFixed(1)}%`
                    : entry.value?.toFixed(2) ?? '-'}
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
      <div className="h-64 sm:h-96 flex items-center justify-center bg-slate-800/50 rounded-xl sm:rounded-2xl border border-slate-700">
        <p className="text-slate-500 text-sm sm:text-base">No odds history available</p>
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

  const isPercentView = viewMode === 'percent';
  const isImpliedView = viewMode === 'implied';

  return (
    <div className="h-full w-full flex flex-col">
      {/* Controls row */}
      <div className="flex flex-col gap-2 mb-3">
        {/* Top row: View Toggle + Hint */}
        <div className="flex items-center justify-between">
          <div className="inline-flex bg-slate-900/60 border border-slate-700/60 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('odds')}
              className={`px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors border-r border-slate-700/60 ${
                viewMode === 'odds'
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Odds
            </button>
            <button
              onClick={() => setViewMode('percent')}
              className={`px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors border-r border-slate-700/60 ${
                viewMode === 'percent'
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              % Chg
            </button>
            <button
              onClick={() => setViewMode('implied')}
              className={`px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                viewMode === 'implied'
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Implied
            </button>
          </div>

          {/* Hint text - more prominent */}
          <span className="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            {selectedOutcome === 'all' ? 'Click to isolate' : 'Click again for all'}
          </span>
        </div>

        {/* Clickable Legend - styled as filter pills */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => handleLegendClick('home')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-all duration-200 ${
              selectedOutcome === 'home'
                ? 'bg-emerald-500/30 border-emerald-500/60 text-emerald-300 shadow-sm shadow-emerald-500/20'
                : selectedOutcome === 'all'
                ? 'bg-slate-800/80 border-slate-600/50 text-slate-300 hover:bg-slate-700 hover:border-slate-500 hover:scale-105'
                : 'bg-slate-800/40 border-slate-700/30 text-slate-500 hover:bg-slate-700/50 hover:text-slate-400'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${selectedOutcome === 'home' ? 'bg-emerald-400' : 'bg-emerald-500'}`}></div>
            <span className="truncate max-w-[70px] sm:max-w-[100px]">{homeTeam}</span>
          </button>
          <button
            onClick={() => handleLegendClick('draw')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-all duration-200 ${
              selectedOutcome === 'draw'
                ? 'bg-yellow-500/30 border-yellow-500/60 text-yellow-300 shadow-sm shadow-yellow-500/20'
                : selectedOutcome === 'all'
                ? 'bg-slate-800/80 border-slate-600/50 text-slate-300 hover:bg-slate-700 hover:border-slate-500 hover:scale-105'
                : 'bg-slate-800/40 border-slate-700/30 text-slate-500 hover:bg-slate-700/50 hover:text-slate-400'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${selectedOutcome === 'draw' ? 'bg-yellow-400' : 'bg-yellow-500'}`}></div>
            <span>Draw</span>
          </button>
          <button
            onClick={() => handleLegendClick('away')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-all duration-200 ${
              selectedOutcome === 'away'
                ? 'bg-red-500/30 border-red-500/60 text-red-300 shadow-sm shadow-red-500/20'
                : selectedOutcome === 'all'
                ? 'bg-slate-800/80 border-slate-600/50 text-slate-300 hover:bg-slate-700 hover:border-slate-500 hover:scale-105'
                : 'bg-slate-800/40 border-slate-700/30 text-slate-500 hover:bg-slate-700/50 hover:text-slate-400'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${selectedOutcome === 'away' ? 'bg-red-400' : 'bg-red-500'}`}></div>
            <span className="truncate max-w-[70px] sm:max-w-[100px]">{awayTeam}</span>
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 relative">
        {/* Watermark — visible in screenshots, subtle in-app */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
          <span className="text-white/10 text-5xl sm:text-7xl font-black tracking-widest -rotate-12 whitespace-nowrap">
            steamwatch.io
          </span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 12, left: 0, bottom: 8 }}
          >
            {/* Gradient defs — subtle colored glow under each line */}
            <defs>
              <linearGradient id="oddsArea-home" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_HOME} stopOpacity={0.28} />
                <stop offset="100%" stopColor={COLOR_HOME} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="oddsArea-draw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_DRAW} stopOpacity={0.24} />
                <stop offset="100%" stopColor={COLOR_DRAW} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="oddsArea-away" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_AWAY} stopOpacity={0.28} />
                <stop offset="100%" stopColor={COLOR_AWAY} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Horizontal-only grid — cleaner terminal feel */}
            <CartesianGrid
              strokeDasharray="2 6"
              stroke="#475569"
              strokeOpacity={0.4}
              vertical={false}
            />
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
              reversed={isImpliedView}
              tickFormatter={(value) =>
                isPercentView
                  ? `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`
                  : isImpliedView
                  ? `${value.toFixed(0)}%`
                  : value.toFixed(2)
              }
              width={isPercentView || isImpliedView ? 45 : 42}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.5 }}
              offset={15}
              allowEscapeViewBox={{ x: false, y: true }}
            />

            {/* Reference line at 0% for percent view */}
            {isPercentView && (
              <ReferenceLine
                y={0}
                stroke="#94a3b8"
                strokeDasharray="2 4"
                strokeOpacity={0.4}
              />
            )}

            {/* Opening price reference lines for odds view */}
            {!isPercentView && !isImpliedView && openingOdds?.home_odds && isVisible('home') && (
              <ReferenceLine y={openingOdds.home_odds} stroke={COLOR_HOME} strokeDasharray="2 4" strokeOpacity={0.25} />
            )}
            {!isPercentView && !isImpliedView && openingOdds?.draw_odds && isVisible('draw') && (
              <ReferenceLine y={openingOdds.draw_odds} stroke={COLOR_DRAW} strokeDasharray="2 4" strokeOpacity={0.25} />
            )}
            {!isPercentView && !isImpliedView && openingOdds?.away_odds && isVisible('away') && (
              <ReferenceLine y={openingOdds.away_odds} stroke={COLOR_AWAY} strokeDasharray="2 4" strokeOpacity={0.25} />
            )}

            {/* Subtle area fills (render first so lines draw on top) */}
            {isVisible('home') && (
              <Area
                type="monotone"
                dataKey={isImpliedView ? 'home_impl' : isPercentView ? 'home_pct' : 'home_odds'}
                stroke="none"
                fill="url(#oddsArea-home)"
                isAnimationActive={false}
                activeDot={false}
              />
            )}
            {isVisible('draw') && (
              <Area
                type="monotone"
                dataKey={isImpliedView ? 'draw_impl' : isPercentView ? 'draw_pct' : 'draw_odds'}
                stroke="none"
                fill="url(#oddsArea-draw)"
                isAnimationActive={false}
                activeDot={false}
              />
            )}
            {isVisible('away') && (
              <Area
                type="monotone"
                dataKey={isImpliedView ? 'away_impl' : isPercentView ? 'away_pct' : 'away_odds'}
                stroke="none"
                fill="url(#oddsArea-away)"
                isAnimationActive={false}
                activeDot={false}
              />
            )}

            {/* Lines on top — thicker stroke, no mid-point dots, glowing active dot */}
            {isVisible('home') && (
              <Line
                type="monotone"
                dataKey={isImpliedView ? 'home_impl' : isPercentView ? 'home_pct' : 'home_odds'}
                name={homeTeam}
                stroke={COLOR_HOME}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 5, fill: COLOR_HOME, stroke: '#0f172a', strokeWidth: 2 }}
                animationDuration={300}
              />
            )}
            {isVisible('draw') && (
              <Line
                type="monotone"
                dataKey={isImpliedView ? 'draw_impl' : isPercentView ? 'draw_pct' : 'draw_odds'}
                name="Draw"
                stroke={COLOR_DRAW}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 5, fill: COLOR_DRAW, stroke: '#0f172a', strokeWidth: 2 }}
                animationDuration={300}
              />
            )}
            {isVisible('away') && (
              <Line
                type="monotone"
                dataKey={isImpliedView ? 'away_impl' : isPercentView ? 'away_pct' : 'away_odds'}
                name={awayTeam}
                stroke={COLOR_AWAY}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 5, fill: COLOR_AWAY, stroke: '#0f172a', strokeWidth: 2 }}
                animationDuration={300}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Helper text */}
      {isPercentView && (
        <p className="text-[10px] text-slate-500 text-center mt-2">
          Negative = odds shortening (steam)
        </p>
      )}
      {isImpliedView && (
        <p className="text-[10px] text-slate-500 text-center mt-2">
          Higher = shorter odds (more likely) · Raw implied probability, overround not removed
        </p>
      )}
    </div>
  );
}
