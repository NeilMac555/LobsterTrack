import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import type { TotalsPoint } from '../types';
import { filterByTimeFrame, type TimeFrame } from './TimeFrameFilter';
import { impliedExpectedGoals } from '../utils/impliedTotal';

// Standout colour — deliberately NOT green/orange/amber (those are taken
// by Over / Under / line-shift markers) so this reads immediately as a
// distinct, derived signal rather than another raw price series.
const COLOR_TREND = '#e879f9'; // fuchsia-400
const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

interface MarketTrendStripProps {
  data: TotalsPoint[];
  timeFrame?: TimeFrame;
}

export default function MarketTrendStrip({ data, timeFrame = 'all' }: MarketTrendStripProps) {
  const filtered = filterByTimeFrame(data, timeFrame);

  // Deliberately computed from the RAW history (not the gap-broken series
  // the price chart uses) — implied expected goals is comparable across a
  // line shift, so this trend should stay unbroken through one.
  const points = filtered
    .map((p) => ({
      shortTime: format(new Date(p.timestamp), 'd/M HH:mm'),
      fullTime: format(new Date(p.timestamp), 'MMM d, yyyy HH:mm'),
      impliedGoals: impliedExpectedGoals(p.line, p.over_odds, p.under_odds),
    }))
    .filter((p) => p.impliedGoals != null) as Array<{
      shortTime: string;
      fullTime: string;
      impliedGoals: number;
    }>;

  if (points.length < 2) return null;

  const opening = points[0].impliedGoals;
  const latest = points[points.length - 1].impliedGoals;
  const delta = latest - opening;
  const trendingOver = delta > 0.05;
  const trendingUnder = delta < -0.05;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0]?.payload;
      return (
        <div
          className="bg-slate-900/95 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-2xl px-3 py-2"
          style={{ boxShadow: '0 20px 40px -12px rgba(0,0,0,0.5)' }}
        >
          <p className="text-slate-400 text-[10px] font-mono uppercase tracking-[0.1em] mb-1">{p?.fullTime}</p>
          <p className="font-mono font-bold text-sm" style={{ color: COLOR_TREND }}>
            {p?.impliedGoals?.toFixed(2)} goals
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-3 sm:p-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: COLOR_TREND, boxShadow: `0 0 8px ${COLOR_TREND}` }}
          />
          <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-slate-300 font-semibold">
            Market-Implied Total Goals
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-slate-500">
            Open <span className="text-slate-300 font-semibold">{opening.toFixed(2)}</span>
          </span>
          <span style={{ color: COLOR_TREND }} className="font-bold text-sm">
            {latest.toFixed(2)}
          </span>
          {(trendingOver || trendingUnder) && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                trendingOver
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
              }`}
            >
              {trendingOver ? '▲ Trending Over' : '▼ Trending Under'}
            </span>
          )}
        </div>
      </div>
      <div className="h-16 sm:h-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_TREND} stopOpacity={0.3} />
                <stop offset="100%" stopColor={COLOR_TREND} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="shortTime" hide />
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: COLOR_TREND, strokeWidth: 1, strokeOpacity: 0.3 }} />
            <Area
              type="monotone"
              dataKey="impliedGoals"
              stroke="none"
              fill="url(#trendArea)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="impliedGoals"
              stroke={COLOR_TREND}
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4, fill: COLOR_TREND, stroke: '#0f172a', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-slate-500 mt-1 font-mono" style={{ fontFamily: MONO_STACK }}>
        Devigged Over/Under odds solved for the Poisson goal-expectancy implied by Pinnacle's price — comparable across line shifts.
      </p>
    </div>
  );
}
