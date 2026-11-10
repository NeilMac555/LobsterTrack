import type { MatchSummaryData } from '../types';

// Result, steam alerts and the 1X2 price timeline on a match page. The
// copy is written once, in backend/app/services/match_summary.py, and
// arrives as plain text, so this and the server-rendered page
// (services/match_page.py) always say the same thing.

const price = (v: number | null) => (v ? v.toFixed(2) : '—');

export default function MatchSummary({ data }: { data: MatchSummaryData }) {
  const h2 = 'text-lg font-bold text-white mt-8 mb-2';
  const p = 'text-sm text-slate-300 leading-relaxed max-w-[80ch] mb-2';
  return (
    <div>
      {data.result.length > 0 && (
        <>
          <h2 className={h2}>{data.result_heading}</h2>
          <p className={p}>{data.result.join(' ')}</p>
        </>
      )}
      {data.alerts_text.length > 0 && (
        <>
          <h2 className={h2}>Steam alerts</h2>
          {data.alerts_text.map((a) => <p key={a} className={p}>{a}</p>)}
        </>
      )}
      {data.timeline && (
        <>
          <h2 className={h2}>1X2 price timeline</h2>
          <div className="overflow-x-auto rounded-md border border-slate-700/50 mb-2">
            <table className="w-full text-[13px] font-mono">
              <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  {data.timeline.columns.map((c) => <th key={c} className="text-right px-3 py-2">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.timeline.rows.map((r) => (
                  <tr key={r.label} className="border-t border-slate-700/40 text-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-400">{r.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{price(r.home)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{price(r.draw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{price(r.away)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.late_move && <p className={p}>{data.late_move}</p>}
        </>
      )}
    </div>
  );
}
