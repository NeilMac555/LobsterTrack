import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEAGUE_CONFIG } from '../types';

type Days = 1 | 7 | 30;

interface HeatmapData {
  days: number;
  from_at: string;
  to_at: string;
  total_moves: number;
  max_cell: number;
  leagues: string[];
  data: Record<string, number[]>; // sport_key -> 24 hourly counts
}

/**
 * Steam activity heatmap: league × hour-of-day grid showing when
 * sharp-money moves tend to fire. Reuses SteamMove detections that
 * we already store, aggregated client-side into a colored grid.
 *
 * Hidden if there's no data in the window (graceful fallback).
 */
export default function SteamHeatmap() {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [days, setDays] = useState<Days>(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/steam-heatmap?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [days]);

  if (loading || !data || data.total_moves === 0) return null;

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const maxCell = Math.max(1, data.max_cell); // avoid divide-by-zero

  // Cell color: cyan at max intensity, fading to bare slate at 0.
  // OKLCH would be cleanest but rgba keeps things simple + cross-browser.
  const cellStyle = (count: number): React.CSSProperties => {
    if (count === 0) {
      return { background: 'rgba(30, 41, 59, 0.4)' };
    }
    // Non-linear (sqrt) so single-move cells still register visually
    const t = Math.sqrt(count / maxCell);
    const alpha = 0.15 + t * 0.75;
    return {
      background: `rgba(34, 211, 238, ${alpha})`, // cyan-400 base
      boxShadow: t > 0.6 ? `0 0 8px rgba(34, 211, 238, ${t * 0.4})` : undefined,
    };
  };

  return (
    <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 overflow-hidden mb-6 sm:mb-8">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-700/50 flex items-center gap-3 flex-wrap">
        <div className="w-1 h-6 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-base sm:text-lg tracking-tight">Steam Heatmap</h2>
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
            Steam intensity by league × hour (UTC) · {data.total_moves} moves
          </p>
        </div>
        <div className="inline-flex bg-slate-900/60 border border-slate-700/60 rounded-md overflow-hidden">
          {([1, 7, 30] as Days[]).map((d, i) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                i > 0 ? 'border-l border-slate-700/60' : ''
              } ${
                days === d
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {d === 1 ? '24h' : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="p-3 sm:p-4 overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Hour labels row */}
          <div
            className="grid gap-[2px] mb-1"
            style={{ gridTemplateColumns: '56px repeat(24, minmax(0, 1fr))' }}
          >
            <span />
            {hours.map((h) => (
              <span
                key={h}
                className="text-center text-[9px] font-mono uppercase tracking-wider text-slate-500"
              >
                {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
              </span>
            ))}
          </div>

          {/* League rows */}
          {data.leagues.map((sportKey) => {
            const cfg = LEAGUE_CONFIG[sportKey];
            const row = data.data[sportKey] || [];
            const rowTotal = row.reduce((a, b) => a + b, 0);
            return (
              <Link
                key={sportKey}
                to={`/?league=${sportKey}`}
                className="group grid gap-[2px] mb-[2px] items-center hover:bg-slate-700/10 rounded"
                style={{ gridTemplateColumns: '56px repeat(24, minmax(0, 1fr))' }}
                title={`${cfg?.name || sportKey} — ${rowTotal} move${rowTotal === 1 ? '' : 's'}`}
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.1em] font-semibold text-slate-400 group-hover:text-white truncate pr-2">
                  {cfg?.shortName || sportKey}
                </span>
                {hours.map((h) => {
                  const count = row[h] || 0;
                  return (
                    <div
                      key={h}
                      className="h-5 rounded-sm"
                      style={cellStyle(count)}
                      title={count > 0 ? `${cfg?.shortName} · ${String(h).padStart(2, '0')}:00 UTC — ${count} move${count === 1 ? '' : 's'}` : undefined}
                    />
                  );
                })}
              </Link>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-3 pr-1">
          <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Less</span>
          <div className="flex gap-[2px]">
            {[0.0, 0.25, 0.5, 0.75, 1.0].map((t) => (
              <div
                key={t}
                className="w-5 h-2.5 rounded-sm"
                style={
                  t === 0
                    ? { background: 'rgba(30, 41, 59, 0.4)' }
                    : { background: `rgba(34, 211, 238, ${0.15 + t * 0.75})` }
                }
              />
            ))}
          </div>
          <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">More</span>
        </div>
      </div>
    </div>
  );
}
