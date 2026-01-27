import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import type { OddsPoint } from '../types';

interface OddsChartProps {
  data: OddsPoint[];
  homeTeam: string;
  awayTeam: string;
}

type ViewMode = 'odds' | 'percent';

export default function OddsChart({ data, homeTeam, awayTeam }: OddsChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('odds');

  // Get opening odds for reference lines and percentage calculations
  const openingOdds = data.length > 0 ? data[0] : null;

  const chartData = data.map((point) => {
    const baseData = {
      ...point,
      time: format(new Date(point.timestamp), 'MMM d, HH:mm'),
      shortTime: format(new Date(point.timestamp), 'd/M HH:mm'),
      fullTime: format(new Date(point.timestamp), 'MMM d, yyyy HH:mm'),
      timestamp: new Date(point.timestamp).getTime(),
    };

    // Add percentage change from opening
    if (openingOdds) {
      return {
        ...baseData,
        home_pct: openingOdds.home_odds
          ? ((point.home_odds - openingOdds.home_odds) / openingOdds.home_odds) * 100
          : 0,
        draw_pct: openingOdds.draw_odds
          ? ((point.draw_odds - openingOdds.draw_odds) / openingOdds.draw_odds) * 100
          : 0,
        away_pct: openingOdds.away_odds
          ? ((point.away_odds - openingOdds.away_odds) / openingOdds.away_odds) * 100
          : 0,
      };
    }
    return { ...baseData, home_pct: 0, draw_pct: 0, away_pct: 0 };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      return (
        <div
          className="bg-slate-900/95 backdrop-blur-md border border-slate-600/50 rounded-xl shadow-2xl overflow-hidden"
          style={{
            animation: 'fadeIn 0.15s ease-out',
            boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
          }}
        >
          {/* Header with timestamp */}
          <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700/50">
            <p className="text-slate-300 text-xs font-semibold">
              {dataPoint?.fullTime || label}
            </p>
          </div>

          {/* Odds values */}
          <div className="p-2.5 space-y-1">
            {payload.map((entry: any, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4 px-1"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full ring-2 ring-white/10"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-slate-400 text-xs font-medium">{entry.name}</span>
                </div>
                <span
                  className="font-mono font-bold text-sm tabular-nums"
                  style={{ color: entry.color }}
                >
                  {viewMode === 'percent'
                    ? `${entry.value >= 0 ? '+' : ''}${entry.value?.toFixed(1)}%`
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

  const isPercentView = viewMode === 'percent';
  const dataKeyPrefix = isPercentView ? '_pct' : '_odds';

  return (
    <div className="h-full w-full flex flex-col">
      {/* Toggle + Legend row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        {/* View Toggle */}
        <div className="flex bg-slate-800 rounded-lg p-1 self-start">
          <button
            onClick={() => setViewMode('odds')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'odds'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Odds
          </button>
          <button
            onClick={() => setViewMode('percent')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'percent'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            % Change
          </button>
        </div>

        {/* Legend - above graph on mobile */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-emerald-500 rounded-full"></div>
            <span className="text-slate-400">{homeTeam}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-yellow-500 rounded-full"></div>
            <span className="text-slate-400">Draw</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-red-500 rounded-full"></div>
            <span className="text-slate-400">{awayTeam}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
            <XAxis
              dataKey="shortTime"
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 9, fontFamily: 'Inter' }}
              tickLine={{ stroke: '#475569' }}
              axisLine={{ stroke: '#475569' }}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 9, fontFamily: 'Inter' }}
              tickLine={{ stroke: '#475569' }}
              axisLine={{ stroke: '#475569' }}
              domain={isPercentView ? ['auto', 'auto'] : ['auto', 'auto']}
              tickFormatter={(value) =>
                isPercentView
                  ? `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`
                  : value.toFixed(1)
              }
              width={isPercentView ? 45 : 35}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }}
              offset={15}
              allowEscapeViewBox={{ x: false, y: true }}
            />

            {/* Reference line at 0% for percent view */}
            {isPercentView && (
              <ReferenceLine
                y={0}
                stroke="#64748b"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            )}

            {/* Opening price reference lines for odds view */}
            {!isPercentView && openingOdds?.home_odds && (
              <ReferenceLine
                y={openingOdds.home_odds}
                stroke="#22c55e"
                strokeDasharray="4 4"
                strokeOpacity={0.25}
              />
            )}
            {!isPercentView && openingOdds?.draw_odds && (
              <ReferenceLine
                y={openingOdds.draw_odds}
                stroke="#eab308"
                strokeDasharray="4 4"
                strokeOpacity={0.25}
              />
            )}
            {!isPercentView && openingOdds?.away_odds && (
              <ReferenceLine
                y={openingOdds.away_odds}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeOpacity={0.25}
              />
            )}

            <Line
              type="monotone"
              dataKey={isPercentView ? 'home_pct' : 'home_odds'}
              name={homeTeam}
              stroke="#22c55e"
              strokeWidth={2.5}
              dot={{ fill: '#22c55e', strokeWidth: 0, r: 2 }}
              activeDot={{ r: 5, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey={isPercentView ? 'draw_pct' : 'draw_odds'}
              name="Draw"
              stroke="#eab308"
              strokeWidth={2.5}
              dot={{ fill: '#eab308', strokeWidth: 0, r: 2 }}
              activeDot={{ r: 5, fill: '#eab308', stroke: '#fff', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey={isPercentView ? 'away_pct' : 'away_odds'}
              name={awayTeam}
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={{ fill: '#ef4444', strokeWidth: 0, r: 2 }}
              activeDot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Percent view helper text */}
      {isPercentView && (
        <p className="text-[10px] text-slate-500 text-center mt-2">
          Percentage change from opening odds • Negative = odds shortening (steam)
        </p>
      )}
    </div>
  );
}
