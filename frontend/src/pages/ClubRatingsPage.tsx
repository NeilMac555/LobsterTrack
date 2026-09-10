import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import './clubRatingsPage.css';

type Performance = { weight: number; games: number; half_life_days: number; latest: string; stale: boolean; score_change: number };
type Club = { id: number; name: string; rank: number; score: number; competitions: string[]; sources: Record<string, number>; weights: Record<string, number>; tier: string; community_adjustment: number; rank_change: number | null; score_change: number | null; performance?: Performance };
type Board = { teams: Club[]; season: string; published_at: string; next_update: string; overdue: boolean; observed_at: Record<string, string | null>; warnings: string[] };
const tiers = [ ['Elite', '1850+'], ['Contenders', '1800–1849'], ['Strong', '1650–1799'], ['Competitive', '1500–1649'], ['Outsiders', '1350–1499'], ['Lower rated', 'Below 1350'] ];
const leagues = ['All clubs', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Champions League', 'Europa League'];
const date = (s: string) => new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;

async function request<T>(path: string, direction?: number): Promise<T> {
  const response = await fetch(`/api/club-ratings${path}`, {
    method: direction === undefined ? 'GET' : 'PUT',
    headers: { ...(direction !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(direction !== undefined ? { body: JSON.stringify({ direction }) } : {}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not load ratings. Please try again.');
  }
  return response.json();
}

export default function ClubRatingsPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [votesReady, setVotesReady] = useState(false);
  const [query, setQuery] = useState('');
  const [league, setLeague] = useState('All clubs');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    request<Board>('').then(data => { if (active) { setBoard(data); setError(''); } })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    let active = true;
    request<Record<string, number>>('/votes/me').then(data => { if (active) { setVotes(data); setVotesReady(true); } })
      .catch(e => { if (active) { setVotesReady(false); setError(e.message); } });
    return () => { active = false; };
  }, [retry]);
  async function vote(team: Club, direction: number) {
    const next = votes[team.id] === direction ? 0 : direction;
    setBusy(team.id); setError(''); setNotice('');
    try {
      await request(`/${team.id}/vote`, next);
      setVotes(current => ({ ...current, [team.id]: next }));
      setNotice(next ? `${team.name}: vote saved. Member feedback is assessed at the weekly update.` : `${team.name}: vote removed.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  const rows = board?.teams.filter(t => (league === 'All clubs' || t.competitions.includes(league)) && t.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  return <section className="sw-ratings" aria-label="European club ratings">
    <Helmet><title>European Club Ratings | SteamWatch</title><meta name="description" content="European club strength rankings blending four rating sources with rolling non-penalty expected goals and bounded member feedback." /><link rel="canonical" href="https://www.steamwatch.io/tools/club-ratings" /></Helmet>
    <header className="ratings-heading"><div><p className="ratings-eyebrow">EUROPEAN FOOTBALL · BETA</p><h1>Club Ratings</h1><p>Four rating sources. Rolling expected goals. Your informed view.</p></div><div className="ratings-date">{board && <><strong>{board.teams.length} clubs · {board.season}</strong><span>Published {date(board.published_at)}</span><span>Weekly · Monday 12:00 UTC</span></>}</div></header>
    <p className="ratings-intro">Current club strength across the top five leagues, Champions League and Europa League. Small gaps are close calls—not decisive differences.</p>
    {board?.overdue && <p className="ratings-warning" role="status">The weekly update is delayed. Showing the last published ratings from {date(board.published_at)}.</p>}
    {board?.warnings?.length ? <details className="ratings-warning"><summary>Source coverage notes ({board.warnings.length})</summary>{board.warnings.map(w => <p key={w}>{w}</p>)}</details> : null}
    {error && <div role="alert" className="ratings-warning">{error} <button onClick={() => { setRetry(r => r+1); }}>Try again</button></div>}
    <div className="ratings-notice" role="status" aria-live="polite">{notice}</div>
    <div className="ratings-tiers" aria-label="Strength tiers">{tiers.map(([label, range]) => <div key={label} data-tier={label}><strong>{label}</strong><span>{range}</span><small>{board ? board.teams.filter(t => t.tier === label).length : '—'} clubs</small></div>)}</div>
    <div className="ratings-controls"><label><span>Find a club</span><input placeholder="Search clubs…" value={query} onChange={e => setQuery(e.target.value)} /></label><label><span>Competition</span><select value={league} onChange={e => setLeague(e.target.value)}>{leagues.map(l => <option key={l}>{l}</option>)}</select></label><span>{rows.length} clubs</span></div>
    <div className="ratings-vote-explainer"><span><strong>Higher or lower?</strong> Tell us where you disagree. Votes inform a small weekly adjustment; a click never changes a rating immediately.</span><small>No sign-in needed · One vote per browser</small></div>
    {loading ? <p role="status">Loading club ratings…</p> : <div className="ratings-table-wrap"><table><caption className="sr-only">European club ratings and member feedback</caption><thead><tr><th scope="col">Rank</th><th scope="col">Club</th><th scope="col">Strength</th><th scope="col">Higher / lower?</th><th scope="col">Sources</th></tr></thead><tbody>{rows.map(t => <tr key={t.id} data-tier={t.tier}>
      <td><strong>{t.rank}</strong><small className="ratings-movement" title="Rank change since the previous weekly publication">{t.rank_change === null ? 'New' : t.rank_change > 0 ? `↑ ${t.rank_change}` : t.rank_change < 0 ? `↓ ${-t.rank_change}` : '—'}</small></td>
      <td className="ratings-club"><strong>{t.name}</strong><small>{t.competitions.join(' · ')}</small></td>
      <td><strong className="ratings-score">{Math.round(t.score)}</strong><span className="ratings-tier">{t.tier}</span>{t.score_change !== null && <small>{signed(t.score_change)} this week</small>}{t.community_adjustment !== 0 && <small>Members: {signed(t.community_adjustment)} pts</small>}</td>
      <td><div className="ratings-votes">{[1, -1].map(d => <button key={d} disabled={busy !== null || !votesReady} aria-label={`${t.name} should be rated ${d === 1 ? 'higher' : 'lower'}`} aria-pressed={votes[t.id] === d} title={votes[t.id] === d ? 'Click to remove your vote' : d === 1 ? 'Underrated' : 'Overrated'} onClick={() => vote(t, d)}>{d === 1 ? '↑' : '↓'}</button>)}</div><small>{busy === t.id ? 'Saving…' : votes[t.id] ? 'Your vote saved' : 'Your view'}</small></td>
      <td><details><summary>{Object.keys(t.sources).length}/4{t.performance ? ' + npxG' : ''}</summary>{Object.keys(t.sources).map(s => <small key={s}>{s}: {(t.weights[s]*100).toFixed(1)}%</small>)}{t.performance && <small>Rolling npxG: {(t.performance.weight*100).toFixed(1)}% · {t.performance.games} matches{t.performance.stale ? ' · reduced for stale data' : ''}<br />Latest match: {date(t.performance.latest)}</small>}</details></td>
    </tr>)}</tbody></table>{board && !rows.length && <p className="ratings-empty">No clubs match your search.</p>}</div>}
    <details className="ratings-method"><summary>How ratings and member votes work</summary><h2>The blend</h2><p>Euro Club Index, Club Elo, Driblab/The90Lab and PitchRank are converted to a common fixed scale. Available sources share the external component equally. They overlap in their information; PitchRank includes market information.</p><p>Understat non-penalty expected goals add a domestic performance component, adjusted for opponents and home advantage. Matches have a 180-day half-life. Its weight is 50% × weighted matches ÷ (weighted matches + 8), so sparse teams rely more on external ratings. Stale performance data has reduced influence. The calibration is provisional, and does not explicitly adjust for red cards, game state or player transfers.</p><h2>Your view</h2><p>No account or subscription is needed. One active vote per browser per club is remembered with a voting cookie. Clearing cookies or switching devices loses that identity; this is not a count of verified people. Click the selected arrow to remove it, or the other arrow to change it. Votes expire after 30 days, or stop counting when the rating has moved more than 20 points from the score you voted on.</p><p>At least five browser voters and 80% agreement are needed. Small samples are pulled towards zero: the target adjustment is 15 × (up votes − down votes) ÷ (total votes + 10). The actual adjustment moves at most three points per weekly publication, with a total limit of ±15. When agreement fades, it moves back towards zero. This offset never feeds back into the underlying model.</p><p>The six tiers use fixed boundaries, with Elite beginning at 1850. New results can move clubs between tiers. This is a current-strength guide, not a match probability or betting recommendation.</p><h2>Updates & sources</h2><p>Ratings are published weekly, with the last complete publication retained if an update fails. Source dates are shown below; publication does not imply every provider updated that day. Competition membership is the reviewed {board?.season ?? 'current season'} roster.</p>{board && Object.entries(board.observed_at).map(([s, when]) => <p key={s}>{s}: {when ? date(when) : 'unavailable'}</p>)}<p><a href="https://www.euroclubindex.com/" target="_blank" rel="noreferrer">Euro Club Index</a> · <a href="https://clubelo.com/" target="_blank" rel="noreferrer">Club Elo</a> · <a href="https://the90lab.com/elo/teams" target="_blank" rel="noreferrer">Driblab / The90Lab</a> · <a href="https://www.pitchrank.fyi/" target="_blank" rel="noreferrer">PitchRank</a> · <a href="https://understat.com/" target="_blank" rel="noreferrer">Understat</a></p></details>
  </section>;
}
