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
import type { TotalsPoint } from '../types';

interface TotalsChartProps {
  data: TotalsPoint[];
}

export default function TotalsChart({ data }: TotalsChartProps) {
  // Get opening totals for reference lines
  const openingTotals = data.length > 0 ? data[0] : null;

  const chartData = data.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), 'MMM d, HH:mm'),
    shortTime: format(new Date(point.timestamp), 'd/M HH:mm'),
    fullTime: format(new Date(point.timestamp), 'MMM d, yyyy HH:mm'),
    timestamp: new Date(point.timestamp).getTime(),
  }));

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

          {/* Values */}
          <div className="p-2.5 space-y-1">
            <div className="flex items-center justify-between gap-4 px-1">
              <span className="text-slate-400 text-xs font-medium">Line</span>
              <span className="font-mono font-bold text-sm tabular-nums text-white">
                {dataPoint?.line?.toFixed(2) ?? '-'}
              </span>
            </div>
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

  return (
    <div className="h-full w-full">
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
            domain={['auto', 'auto']}
            tickFormatter={(value) => value.toFixed(2)}
            width={40}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }}
            offset={15}
            allowEscapeViewBox={{ x: false, y: true }}
          />

          {/* Opening price reference lines */}
          {openingTotals?.over_odds && (
            <ReferenceLine
              y={openingTotals.over_odds}
              stroke="#3b82f6"
              strokeDasharray="4 4"
              strokeOpacity={0.25}
            />
          )}
          {openingTotals?.under_odds && (
            <ReferenceLine
              y={openingTotals.under_odds}
              stroke="#f97316"
              strokeDasharray="4 4"
              strokeOpacity={0.25}
            />
          )}

          <Line
            type="monotone"
            dataKey="over_odds"
            name="Over"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ fill: '#3b82f6', strokeWidth: 0, r: 2 }}
            activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="under_odds"
            name="Under"
            stroke="#f97316"
            strokeWidth={2.5}
            dot={{ fill: '#f97316', strokeWidth: 0, r: 2 }}
            activeDot={{ r: 5, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
