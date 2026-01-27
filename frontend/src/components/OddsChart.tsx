import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

export default function OddsChart({ data, homeTeam, awayTeam }: OddsChartProps) {
  const chartData = data.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), 'MMM d, HH:mm'),
    timestamp: new Date(point.timestamp).getTime(),
  }));

  // Get opening odds for reference lines
  const openingOdds = data.length > 0 ? data[0] : null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-xl p-4 shadow-2xl">
          <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wide">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4 text-sm py-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-slate-300">{entry.name}</span>
              </div>
              <span className="font-mono font-bold text-base" style={{ color: entry.color }}>
                {entry.value?.toFixed(2) ?? '-'}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center bg-slate-800/50 rounded-2xl border border-slate-700">
        <p className="text-slate-500">No odds history available</p>
      </div>
    );
  }

  return (
    <div className="h-96 w-full p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 24, right: 32, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
          <XAxis
            dataKey="time"
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
            tickLine={{ stroke: '#475569' }}
            axisLine={{ stroke: '#475569' }}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
            tickLine={{ stroke: '#475569' }}
            axisLine={{ stroke: '#475569' }}
            domain={['auto', 'auto']}
            tickFormatter={(value) => value.toFixed(1)}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '16px' }}
            formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
          />

          {/* Opening price reference lines (subtle dotted) */}
          {openingOdds?.home_odds && (
            <ReferenceLine
              y={openingOdds.home_odds}
              stroke="#22c55e"
              strokeDasharray="4 4"
              strokeOpacity={0.25}
            />
          )}
          {openingOdds?.draw_odds && (
            <ReferenceLine
              y={openingOdds.draw_odds}
              stroke="#eab308"
              strokeDasharray="4 4"
              strokeOpacity={0.25}
            />
          )}
          {openingOdds?.away_odds && (
            <ReferenceLine
              y={openingOdds.away_odds}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeOpacity={0.25}
            />
          )}

          <Line
            type="monotone"
            dataKey="home_odds"
            name={homeTeam}
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={{ fill: '#22c55e', strokeWidth: 0, r: 3 }}
            activeDot={{ r: 6, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="draw_odds"
            name="Draw"
            stroke="#eab308"
            strokeWidth={2.5}
            dot={{ fill: '#eab308', strokeWidth: 0, r: 3 }}
            activeDot={{ r: 6, fill: '#eab308', stroke: '#fff', strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="away_odds"
            name={awayTeam}
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={{ fill: '#ef4444', strokeWidth: 0, r: 3 }}
            activeDot={{ r: 6, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
