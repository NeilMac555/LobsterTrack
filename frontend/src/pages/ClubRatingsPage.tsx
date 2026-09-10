import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import './clubRatingsPage.css';

type Club = { id: number; name: string; rank: number; score: number; competitions: string[]; tier: string; community_adjustment: number; rank_change: number | null; score_change: number | null; performance?: Performance };
type Board = { teams: Club[]; season: string; published_at: string; next_update: string; overdue: boolean; warnings: string[] };
type VoteSession = { limit: number; used: number; remaining: number; club_ids: number[] };
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
  const [session, setSession] = useState<VoteSession | null>(null);
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
    request<Record<string, number>>('/votes/me').then(async data => {
      const allowance = await request<VoteSession>('/votes/session');
      if (active) { setVotes(data); setSession(allowance); setVotesReady(true); }
    })
      .catch(e => { if (active) { setVotesReady(false); setError(e.message); } });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (session?.remaining !== 0) return;
    let active = true;
    const timer = window.setInterval(() => {
      request<VoteSession>('/votes/session').then(value => { if (active) setSession(value); }).catch(() => {});
    }, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session?.remaining]);
  async function vote(team: Club, direction: number) {
    const next = votes[team.id] === direction ? 0 : direction;
    setBusy(team.id); setError(''); setNotice('');
    try {
      const result = await request<{ session: VoteSession }>(`/${team.id}/vote`, next);
      setSession(result.session);
      setVotes(current => ({ ...current, [team.id]: next }));
      setNotice(next ? `${team.name}: vote saved. Member feedback is assessed at the weekly update.` : `${team.name}: vote removed.`);
    } catch (e) {
      setError((e as Error).message);
      request<VoteSession>('/votes/session').then(setSession).catch(() => {});
    }
    finally { setBusy(null); }
  }
  const rows = board?.teams.filter(t => (league === 'All clubs' || t.competitions.includes(league)) && t.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  return <section className="sw-ratings" aria-label="European club ratings">
    <Helmet><title>European Club Ratings | SteamWatch</title><meta name="description" content="Free European club strength ratings combining long-term quality, recent performance and community feedback. Updated weekly." /><link rel="canonical" href="https://www.steamwatch.io/tools/club-ratings" /></Helmet>
    <header className="ratings-heading"><div><p className="ratings-eyebrow">EUROPEAN FOOTBALL · BETA</p><h1>Club Ratings</h1><p>A clearer picture of club strength across Europe.</p></div><div className="ratings-date">{board && <><strong>{board.teams.length} clubs · {board.season}</strong><span>Published {date(board.published_at)}</span><span>Weekly · Monday 12:00 UTC</span></>}</div></header>
    <p className="ratings-intro">Current club strength across the top five leagues, Champions League and Europa League. Small gaps are close calls—not decisive differences.</p>
    {board?.overdue && <p className="ratings-warning" role="status">The weekly update is delayed. Showing the last published ratings from {date(board.published_at)}.</p>}
    {board?.warnings?.length ? <details className="ratings-warning"><summary>Data update notes</summary>{board.warnings.map(w => <p key={w}>{w}</p>)}</details> : null}
    {error && <div role="alert" className="ratings-warning">{error} <button onClick={() => { setRetry(r => r+1); }}>Try again</button></div>}
    <div className="ratings-notice" role="status" aria-live="polite">{notice}</div>
    <div className="ratings-tiers" aria-label="Strength tiers">{tiers.map(([label, range]) => <div key={label} data-tier={label}><strong>{label}</strong><span>{range}</span><small>{board ? board.teams.filter(t => t.tier === label).length : '—'} clubs</small></div>)}</div>
    <div className="ratings-controls"><label><span>Find a club</span><input placeholder="Search clubs…" value={query} onChange={e => setQuery(e.target.value)} /></label><label><span>Competition</span><select value={league} onChange={e => setLeague(e.target.value)}>{leagues.map(l => <option key={l}>{l}</option>)}</select></label><span>{rows.length} clubs</span></div>
    <div className="ratings-vote-explainer"><span><strong>How your vote helps.</strong> ↑ means underrated; ↓ means overrated. Votes don't change scores immediately: at least five voters and 80% agreement are needed for a weekly adjustment. Movement is limited to 3 points a week and ±15 points overall. Votes expire after 30 days.</span><small>No sign-in needed · One vote per browser<br />{session ? `${session.used}/${session.limit} clubs voted on this session` : '10 clubs per session'}<br />Resets after 30 minutes without voting. Changing or removing a vote doesn't free a slot.</small></div>
    {loading ? <p role="status">Loading club ratings…</p> : <div className="ratings-table-wrap"><table><caption className="sr-only">European club ratings and member feedback</caption><thead><tr><th scope="col">Rank</th><th scope="col">Club</th><th scope="col">Strength</th><th scope="col">Higher / lower?</th></tr></thead><tbody>{rows.map(t => <tr key={t.id} data-tier={t.tier}>
      <td><strong>{t.rank}</strong><small className="ratings-movement" title="Rank change since the previous weekly publication">{t.rank_change === null ? 'New' : t.rank_change > 0 ? `↑ ${t.rank_change}` : t.rank_change < 0 ? `↓ ${-t.rank_change}` : '—'}</small></td>
      <td className="ratings-club"><strong>{t.name}</strong><small>{t.competitions.join(' · ')}</small></td>
      <td><strong className="ratings-score">{Math.round(t.score)}</strong><span className="ratings-tier">{t.tier}</span>{t.score_change !== null && <small>{signed(t.score_change)} this week</small>}{t.community_adjustment !== 0 && <small>Members: {signed(t.community_adjustment)} pts</small>}</td>
      <td><div className="ratings-votes">{[1, -1].map(d => <button key={d} disabled={busy !== null || !votesReady || (session?.remaining === 0 && !session.club_ids.includes(t.id) && votes[t.id] !== d)} aria-label={`${t.name} should be rated ${d === 1 ? 'higher' : 'lower'}`} aria-pressed={votes[t.id] === d} title={votes[t.id] === d ? 'Click to remove your vote' : d === 1 ? 'Underrated' : 'Overrated'} onClick={() => vote(t, d)}>{d === 1 ? '↑' : '↓'}</button>)}</div><small>{busy === t.id ? 'Saving…' : votes[t.id] ? 'Your vote saved' : 'Your view'}</small></td>
    </tr>)}</tbody></table>{board && !rows.length && <p className="ratings-empty">No clubs match your search.</p>}</div>}
    <details className="ratings-method"><summary>About these ratings</summary>
      <p>We aim to measure how strong a club is right now, rather than simply reproduce the league table. The ratings combine longer-term team quality with recent results and underlying performance, accounting for the level of opposition.</p>
      <p>Clubs are placed on a common European scale and grouped into six strength tiers. Ratings update weekly, balancing recent evidence with a broader picture so one match does not dominate the assessment. Small gaps should be treated as close calls.</p>
      <p>This is a beta guide to club strength, not a match prediction. We will refine it as new evidence becomes available.</p>
      <h2>Your view</h2><p>Vote up if a club looks underrated, or down if it looks overrated. No sign-in is needed. Your browser remembers one changeable vote per club; click the selected arrow to remove it. Clearing cookies or switching devices creates a different identity.</p>
      <p>Community feedback can make a small adjustment at the weekly update once at least five browser voters reach 80% agreement. Adjustments move by no more than three points per week and are capped at ±15 points overall. Votes expire after 30 days and may stop counting after a significant rating change. Feedback is kept separate from the underlying team assessment.</p>
    </details>
  </section>;
}
