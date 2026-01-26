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
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
          <p className="text-slate-400 text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-300">{entry.name}:</span>
              <span className="font-mono font-semibold" style={{ color: entry.color }}>
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
      <div className="h-80 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700">
        <p className="text-slate-500">No odds history available</p>
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="time"
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={{ stroke: '#475569' }}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={{ stroke: '#475569' }}
            domain={['auto', 'auto']}
            tickFormatter={(value) => value.toFixed(1)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            formatter={(value) => <span className="text-slate-300">{value}</span>}
          />

          {/* Opening price reference lines (dotted) */}
          {openingOdds?.home_odds && (
            <ReferenceLine
              y={openingOdds.home_odds}
              stroke="#22c55e"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
            />
          )}
          {openingOdds?.draw_odds && (
            <ReferenceLine
              y={openingOdds.draw_odds}
              stroke="#eab308"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
            />
          )}
          {openingOdds?.away_odds && (
            <ReferenceLine
              y={openingOdds.away_odds}
              stroke="#ef4444"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
            />
          )}

          <Line
            type="stepAfter"
            dataKey="home_odds"
            name={homeTeam}
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ fill: '#22c55e', strokeWidth: 0, r: 4 }}
            activeDot={{ r: 6, fill: '#22c55e' }}
          />
          <Line
            type="stepAfter"
            dataKey="draw_odds"
            name="Draw"
            stroke="#eab308"
            strokeWidth={2}
            dot={{ fill: '#eab308', strokeWidth: 0, r: 4 }}
            activeDot={{ r: 6, fill: '#eab308' }}
          />
          <Line
            type="stepAfter"
            dataKey="away_odds"
            name={awayTeam}
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ fill: '#ef4444', strokeWidth: 0, r: 4 }}
            activeDot={{ r: 6, fill: '#ef4444' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
