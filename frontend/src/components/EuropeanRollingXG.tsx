import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

type Fixture = { id: number; date: string; stage: string; home: string; away: string; home_npxg: number | null; away_npxg: number | null; missing_reason: string | null };
type Snapshot = { source: string; season: string; updated_at: string | null; fixtures: Fixture[] };

export default function EuropeanRollingXG({ league }: { league: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [team, setTeam] = useState('');
  const [windowSize, setWindowSize] = useState(5);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setTeam(''); setError(false);
    fetch(`/api/european-xg?league=${encodeURIComponent(league)}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw Error(); return r.json() as Promise<Snapshot>; })
      .then(d => { setData(d); setTeam([...new Set(d.fixtures.flatMap(f => [f.home, f.away]))].sort()[0] || ''); })
      .catch(e => { if (e.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [league]);
  const teams = useMemo(() => [...new Set(data?.fixtures.flatMap(f => [f.home, f.away]) || [])].sort(), [data]);
  const matches = useMemo(() => (data?.fixtures || []).filter(f => f.home === team || f.away === team).map(f => ({
    ...f, opponent: f.home === team ? f.away : f.home, venue: f.home === team ? 'H' : 'A',
    for: f.home === team ? f.home_npxg : f.away_npxg, against: f.home === team ? f.away_npxg : f.home_npxg,
  })), [data, team]);
  const chart = useMemo(() => matches.map((m, i) => {
    const slice = matches.slice(Math.max(0, i-windowSize+1), i+1);
    const complete = slice.every(f => f.for !== null && f.against !== null);
    return { game: i+1, sample: slice.length, date: m.date.slice(0, 10),
      npxG: complete ? slice.reduce((s, f) => s + (f.for as number), 0)/slice.length : null,
      npxGA: complete ? slice.reduce((s, f) => s + (f.against as number), 0)/slice.length : null };
  }), [matches, windowSize]);
  const latest = chart.at(-1);
  const missing = matches.filter(f => f.for === null || f.against === null).length;
  if (error) return <p className="p-6 text-red-400">European xG could not be loaded. Please refresh.</p>;
  if (!data) return <p className="p-6 text-slate-400">Loading European xG…</p>;
  return <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
    <div><h1 className="text-2xl font-bold text-white">European rolling xG</h1>
      <p className="text-sm text-slate-400 mt-2">Sportmonks · Non-penalty xG · {data.season} · Main competition only, qualifiers excluded</p>
      <p className="text-xs text-slate-500 mt-1">Separate from Understat domestic data. Updated {data.updated_at ? new Date(data.updated_at).toLocaleString() : 'not yet'} · Refreshes daily.</p>
      {data.updated_at && Date.now()-Date.parse(data.updated_at)>36*3600000 && <p className="text-amber-400 text-sm">The last successful refresh is over 36 hours old.</p>}
    </div>
    <div className="flex flex-wrap gap-3">
      <select aria-label="European team" value={team} onChange={e => setTeam(e.target.value)} className="bg-slate-800 text-white border border-slate-700 rounded-lg p-3 flex-1">{teams.map(t => <option key={t}>{t}</option>)}</select>
      {[5,10].map(w => <button key={w} onClick={() => setWindowSize(w)} className={`rounded-lg px-4 py-2 ${w===windowSize ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>{w}-game</button>)}
    </div>
    {!matches.length ? <p className="text-slate-400">No completed main-competition fixtures available yet for this season.</p> : <>
      <p className="text-sm text-slate-400">{matches.length} completed matches · {matches.length-missing} with both teams’ npxG · {missing} missing.
        {matches.length < windowSize && ` Early-season average: ${matches.length} of ${windowSize} matches. The window builds as games are played.`}
        {missing > 0 && ' Missing values are not counted as zero; any affected rolling window is left blank.'}</p>
      <div className="grid grid-cols-3 gap-3">{[['Avg npxG', latest?.npxG], ['Avg npxGA', latest?.npxGA], ['npxG difference', latest?.npxG != null && latest?.npxGA != null ? latest.npxG-latest.npxGA : null]].map(([label, value]) => <div key={String(label)} className="bg-slate-800 rounded-xl p-4"><p className="text-slate-400 text-xs">{label}</p><p className="text-cyan-400 text-2xl font-mono mt-2">{typeof value === 'number' ? value.toFixed(2) : '—'}</p></div>)}</div>
      <div className="bg-slate-800/60 rounded-xl p-4"><h2 className="text-white mb-4">{team} · Up to {windowSize}-match rolling average</h2>
        <ResponsiveContainer width="100%" height={310}><LineChart data={chart}><CartesianGrid stroke="#334155" strokeDasharray="3 3"/><XAxis dataKey="game" stroke="#94a3b8"/><YAxis stroke="#94a3b8" domain={[0,'auto']}/><Tooltip contentStyle={{background:'#0f172a',borderColor:'#334155'}} labelFormatter={v => `Match ${v}`} formatter={(v: number | undefined) => v == null ? 'Missing' : v.toFixed(2)}/><Legend/>
          <Line dataKey="npxG" name="npxG for" stroke="#22d3ee" strokeWidth={2} dot connectNulls={false}/><Line dataKey="npxGA" name="npxG against" stroke="#f87171" strokeWidth={2} dot connectNulls={false}/>
        </LineChart></ResponsiveContainer>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left text-slate-300"><thead><tr><th className="p-2">Date</th><th>Opponent</th><th>Venue</th><th>npxG</th><th>npxGA</th><th>Coverage</th></tr></thead><tbody>{matches.map(m => <tr key={m.id} className="border-t border-slate-700"><td className="p-2">{m.date.slice(0,10)}</td><td>{m.opponent}</td><td>{m.venue}</td><td>{m.for?.toFixed(2) ?? '—'}</td><td>{m.against?.toFixed(2) ?? '—'}</td><td>{m.missing_reason || 'Available'}</td></tr>)}</tbody></table></div>
    </>}
  </div>;
}
