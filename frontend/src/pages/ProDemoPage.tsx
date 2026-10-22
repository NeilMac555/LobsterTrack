import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import cards from '../data/proDemoCards.json';
import { demo, demoInputs, demoParams, formSummary, rollingXG, selectForm } from '../model/proDemo';
import type { Sample, Side } from '../model/proDemo';
import { runModel } from '../model/valorModel';
import './ProDemoPage.css';

const num = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? '+' : ''}${num(n)}`;
const tone = (n: number) => n < 0 ? 'demo-negative' : n > 0 ? 'demo-positive' : '';

function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={back ? { transform: 'rotate(180deg)' } : undefined}><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function Choices<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <div className="demo-switch" role="group" aria-label={label}>{options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

function Feature({ id, title, benefit, pro = true, href, sample, children, reload = false }: {
  id: string; title: string; benefit: string; pro?: boolean; href: string; sample: string; children: ReactNode; reload?: boolean;
}) {
  return <article className="demo-card" id={`demo-${id}`} aria-labelledby={`demo-title-${id}`}>
    <header className="demo-card-heading"><div><h3 id={`demo-title-${id}`}>{title}</h3><span className={`demo-access ${pro ? 'demo-access-pro' : ''}`}>{pro ? 'PRO' : 'FREE'}</span></div><p>{benefit}</p></header>
    <div className="demo-card-preview">{children}</div>
    <p className="demo-card-sample">{sample}</p>
    <Link className="demo-card-link" to={href} reloadDocument={reload}><span>Open {title}</span><Arrow /></Link>
  </article>;
}

function Shelf({ id, title, description, count, children }: { id: string; title: string; description: string; count: number; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ first: true, last: false, current: 1 });
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const update = () => {
      const width = node.querySelector<HTMLElement>('.demo-card')?.offsetWidth ?? 1;
      setPosition({ first: node.scrollLeft < 4, last: node.scrollLeft + node.clientWidth >= node.scrollWidth - 4, current: Math.min(count, Math.round(node.scrollLeft / (width + 16)) + 1) });
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => { node.removeEventListener('scroll', update); observer.disconnect(); };
  }, [count]);
  function move(direction: number) {
    const node = track.current;
    if (!node) return;
    const width = node.querySelector<HTMLElement>('.demo-card')?.offsetWidth ?? node.clientWidth;
    node.scrollBy({ left: direction * (width + 16), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  return <section className="demo-shelf" id={id} aria-labelledby={`${id}-heading`}>
    <header className="demo-shelf-heading"><div><h2 id={`${id}-heading`}>{title} <span>{count}</span></h2><p>{description}</p></div>
      <div className="demo-shelf-navigation"><span className="demo-swipe-hint">Swipe to explore</span><button type="button" aria-label={`Previous ${title.toLowerCase()} card`} aria-controls={`${id}-track`} disabled={position.first} onClick={() => move(-1)}><Arrow back /></button><button type="button" aria-label={`Next ${title.toLowerCase()} card`} aria-controls={`${id}-track`} disabled={position.last} onClick={() => move(1)}><Arrow /></button></div>
    </header>
    <div className="demo-track" id={`${id}-track`} ref={track} role="region" aria-label={`${title}, ${count} cards. Swipe or use the arrow buttons to explore.`} tabIndex={0}>{children}</div>
    <span className="demo-sr-only" aria-live="polite">{title}: card {position.current} of {count} at the start of the row.</span>
  </section>;
}

/** Compact charts use the actual bundled series; the shared match chart is unchanged. */
function MiniChart({ series, label, from, to }: { series: { values: number[]; color: string; dashed?: boolean }[]; label: string; from: string; to: string }) {
  const values = series.flatMap(line => line.values);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  return <div className="demo-mini-chart"><svg viewBox="0 0 310 108" role="img" aria-label={label} preserveAspectRatio="none">
    {[15, 55, 95].map(y => <line key={y} x1="1" x2="309" y1={y} y2={y} stroke="#334155" strokeWidth=".6" />)}
    {series.map((line, index) => <polyline key={index} points={line.values.map((value, i) => `${2 + i / Math.max(1, line.values.length - 1) * 306},${96 - (value - min) / range * 82}`).join(' ')} fill="none" stroke={line.color} strokeWidth="2.5" strokeDasharray={line.dashed ? '5 4' : undefined} vectorEffect="non-scaling-stroke" />)}
  </svg><div className="demo-chart-dates"><span>{from}</span><span>{to}</span></div></div>;
}

function Movement({ drift = false }: { drift?: boolean }) {
  const source = drift ? cards.drift : cards.steam;
  return <Feature id={drift ? 'drifters' : 'steam'} title={drift ? 'Drifter records' : 'Steam moves'} benefit={drift ? 'What happened after the price went out?' : 'Which teams does the market keep backing?'} href={drift ? '/drifters' : '/steam-results'} sample="2026/27 sample · 3pp+ moves · final 2h before KO">
    <div className="demo-preview-label">Most {drift ? 'drifted' : 'steamed'} teams <span>1u stakes</span></div>
    <table className="demo-mini-table"><caption className="demo-sr-only">Top three teams by settled move count, all competitions, captured 22 October 2026</caption><thead><tr><th>Team</th><th>Moves</th><th>P/L</th></tr></thead><tbody>{source.rows.map(row => <tr key={row.team_name}><th scope="row">{row.team_name}<small>{row.wins}W · {row.draws}D · {row.losses}L</small></th><td>{row.total_moves}</td><td className={tone(row.profit_loss)}>{signed(row.profit_loss)}u</td></tr>)}</tbody></table>
  </Feature>;
}

function Bias() {
  const [index, setIndex] = useState(0);
  const team = cards.bias[index];
  return <Feature id="bias" title="Favourite–longshot bias" benefit="Same club. Two very different betting records." href="/longshot-bias" sample="Premier League 2025/26 · 1u per bet">
    <Choices label="Bias sample team" value={index} onChange={setIndex} options={[{ value: 0, label: 'Man United' }, { value: 1, label: 'Arsenal' }]} />
    <div className="demo-bias-comparison" aria-live="polite">{([['As favourite', team.as_favourite], ['As underdog', team.as_underdog]] as const).map(([label, row]) => <div key={label}><span>{label}</span><strong className={tone(row.back_pl)}>{signed(row.back_pl)}<small>u</small></strong><span>{row.wins} wins / {row.matches} bets</span><div className="demo-win-bar" aria-hidden="true"><span style={{ width: `${row.win_rate}%` }} /></div></div>)}</div>
    <p className="demo-preview-footnote">{team.as_underdog.matches < 5 ? 'Only 2 underdog bets: a very small sample.' : 'Compare the record behind each price band.'}</p>
  </Feature>;
}

function Odds() {
  const [side, setSide] = useState<'home_odds' | 'away_odds'>('home_odds');
  const first = demo.odds[0][side], last = demo.odds.at(-1)![side];
  return <Feature id="market" title="Odds movement" benefit="See the move, from first quote to kick-off." pro={false} href="/" sample="Arsenal–Leeds · recorded quotes · Sep–Oct 2026">
    <Choices label="Odds outcome" value={side} onChange={setSide} options={[{ value: 'home_odds', label: 'Arsenal' }, { value: 'away_odds', label: 'Leeds' }]} />
    <div className="demo-quote-pair"><span>{num(first)}</span><Arrow /><strong>{num(last)}</strong><small>Decimal odds</small></div>
    <MiniChart series={[{ values: demo.odds.map(row => row[side]), color: '#67e8f9' }]} label={`Recorded odds: ${num(first)} to ${num(last)}`} from="13 Sep" to="10 Oct · pre-KO" />
  </Feature>;
}

function Closing() {
  const row = cards.closing;
  return <Feature id="closing" title="Closing lines" benefit="Keep the final market price in view." pro={false} href="/closing-lines" sample="Pinnacle · 21 Oct 2026 · recorded 1 min before KO">
    <div className="demo-match-label">Bayern Munich <span>vs</span> Arsenal</div>
    <div className="demo-price-trio">{[['Bayern', row.close_home], ['Draw', row.close_draw], ['Arsenal', row.close_away]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{num(Number(value))}</strong></div>)}</div>
    <div className="demo-closing-stamp"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></svg><span>Last recorded 1X2 prices</span></div>
  </Feature>;
}

function Form() {
  const [sample, setSample] = useState<Sample>(20);
  return <Feature id="form" title="Form Lab" benefit="Look beyond the score. Start with the sample." href="/tools/form-lab" sample="Premier League · before Arsenal–Leeds, 10 Oct 2026">
    <div className="demo-preview-label">Last matches<Choices label="Form sample size" value={sample} onChange={setSample} options={[5, 10, 20].map(value => ({ value: value as Sample, label: String(value) }))} /></div>
    <table className="demo-mini-table"><thead><tr><th>Team</th><th>W–D–L</th><th>npxG diff.</th></tr></thead><tbody>{(['home', 'away'] as Side[]).map(side => {
      const stats = formSummary(selectForm(side, sample, 'all'));
      const diff = (stats.xgFor ?? 0) - (stats.xgAgainst ?? 0);
      return <tr key={side}><th scope="row">{side === 'home' ? 'Arsenal' : 'Leeds'}</th><td>{stats.wins}–{stats.draws}–{stats.losses}</td><td className={tone(diff)}>{signed(diff)}</td></tr>;
    })}</tbody></table>
    <p className="demo-preview-footnote">All venues · non-penalty xG difference per game</p>
  </Feature>;
}

function XG() {
  const [side, setSide] = useState<Side>('home');
  const rows = rollingXG(side, 5), last = rows.at(-1)!;
  return <Feature id="xg" title="Rolling xG" benefit="Are performances improving before results do?" href="/tools/rolling-xg" sample="5-game rolling npxG · 20 points · to Sep 2026">
    <Choices label="Rolling xG team" value={side} onChange={setSide} options={[{ value: 'home', label: 'Arsenal' }, { value: 'away', label: 'Leeds' }]} />
    <MiniChart series={[{ values: rows.map(row => row.for), color: '#67e8f9' }, { values: rows.map(row => row.against), color: '#fbbf24', dashed: true }]} label={`${demo.match[side]} 5-game rolling npxG, latest ${num(last.for)} for and ${num(last.against)} against`} from="Last 20 match points" to="Latest" />
    <div className="demo-xg-key"><span>For <strong>{num(last.for)}</strong></span><span>Against <strong>{num(last.against)}</strong></span></div>
  </Feature>;
}

function Model() {
  const [absence, setAbsence] = useState(1);
  const model = useMemo(() => runModel({ home: demoInputs('home', absence), away: demoInputs('away') }, demoParams), [absence]);
  return <Feature id="model" title="Dixon–Coles model" benefit="Change the team news. See the fair odds move." href="/tools/match-predictor" sample="Arsenal–Leeds · reconstructed from 20-game inputs">
    <label className="demo-scenario">Arsenal absence scenario<select value={absence} onChange={event => setAbsence(Number(event.target.value))}><option value={1}>No adjustment</option><option value={3}>Weakened</option><option value={5}>Severely weakened</option></select></label>
    <div className="demo-price-trio" aria-live="polite" aria-atomic="true">{[['Arsenal', model.probHome], ['Draw', model.probDraw], ['Leeds', model.probAway]].map(([label, p]) => <div key={label}><span>{label}</span><strong>{num(1 / Number(p))}</strong></div>)}</div>
    <p className="demo-preview-footnote">Fair 1X2 odds · your scenario, not reported news</p>
  </Feature>;
}

function PnL() {
  const [venue, setVenue] = useState<'overall' | 'home' | 'away'>('overall');
  const row = cards.pnl.back[venue];
  return <Feature id="pnl" title="Team profit & loss" benefit="What would backing your team have returned?" pro={false} href="/team-pnl" sample="Arsenal · 1u stakes · available data from 12 Feb 2026">
    <Choices label="Arsenal P/L venue" value={venue} onChange={setVenue} options={[{ value: 'overall', label: 'All games' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }]} />
    <div className="demo-pnl-result" aria-live="polite"><strong className={tone(row.pl)}>{signed(row.pl)}<small>u</small></strong><span>Backing Arsenal</span></div>
    <div className="demo-split-stats"><span><strong>{row.matches}</strong> bets</span><span><strong>{row.wins}</strong> wins</span><span><strong className={tone(row.roi)}>{row.roi > 0 ? '+' : ''}{row.roi.toFixed(1)}%</strong> ROI</span></div>
  </Feature>;
}

function Ratings() {
  return <Feature id="ratings" title="Club ratings" benefit="See who’s climbing the European rankings." pro={false} href="/tools/club-ratings" sample="Weekly rating snapshot · 19 Oct 2026">
    <div className="demo-preview-label">European top three<span>Rating</span></div>
    <ol className="demo-rank-list">{cards.ratings.rows.map(row => <li key={row.name}><span className="demo-rank">{row.rank}</span><strong>{row.name}</strong><span className="demo-rating-value">{Math.round(row.score)}<small aria-label={`${row.rank_change > 0 ? 'Up' : row.rank_change < 0 ? 'Down' : 'Unchanged'} ${Math.abs(row.rank_change)} places`} className={tone(row.rank_change)}>{row.rank_change > 0 ? '↑' : row.rank_change < 0 ? '↓' : '—'} {row.rank_change ? Math.abs(row.rank_change) : ''}</small></span></li>)}</ol>
  </Feature>;
}

function Managers() {
  return <Feature id="managers" title="Manager ratings" benefit="Compare a manager’s record across clubs." href="/tools/manager-ratings" reload sample="Career impact rankings · snapshot 19 Oct 2026">
    <div className="demo-preview-label">Top three managers<span>Impact</span></div>
    <ol className="demo-rank-list">{cards.managers.rows.map(row => <li key={row.name}><span className="demo-rank">{row.rank}</span><strong>{row.name}<small>{row.club}</small></strong><span className="demo-rating-value demo-positive">+{row.impact.toFixed(1)}</span></li>)}</ol>
  </Feature>;
}

function Goals() {
  const row = cards.goals.row;
  return <Feature id="goals" title="Goals coming soon?" benefit="Find teams scoring less than their xG." pro={false} href="/goals-coming-soon" sample="Mainz 05 · 33 matches · 12-month sample to Oct 2026">
    <div className="demo-preview-label">Mainz 05<span>Goals vs xG</span></div>
    <div className="demo-goal-bars"><div><span>Goals</span><div style={{ width: `${row.goals / row.xg * 100}%` }}>{row.goals}</div></div><div><span>Expected goals</span><div style={{ width: '100%' }}>{row.xg}</div></div></div>
    <p className="demo-goal-gap"><strong>{Math.abs(row.gap).toFixed(1)}</strong> below xG <span>A research lead, not a promise of goals.</span></p>
  </Feature>;
}

export default function ProDemoPage() {
  return <div className="pro-demo">
    <Helmet><title>Explore SteamWatch | Try Our Football Research Tools</title><meta name="description" content="Swipe through SteamWatch’s football research tools. Try steam records, drifters, favourite–longshot bias, Form Lab and the Dixon–Coles model. No sign-up needed." /><link rel="canonical" href="https://www.steamwatch.io/pro/demo" /></Helmet>
    <header className="demo-intro"><div><h1>Find your next angle.</h1><p>12 tools to read the market and research a match. Try them here.</p></div><div className="demo-membership"><Link className="demo-pro-button" to="/pro">Explore Pro <Arrow /></Link><span>€19.99 / month · renews automatically</span></div></header>
    <nav className="demo-quick-nav" aria-label="Demo categories"><a href="#market-tools">Market tools <span>5</span></a><a href="#match-tools">Match tools <span>3</span></a><a href="#team-tools">Team research <span>4</span></a><span className="demo-sample-notice">Real historical samples · no sign-up</span></nav>
    <Shelf id="market-tools" title="Read the market" description="Follow the money. Check the record." count={5}><Movement /><Movement drift /><Bias /><Odds /><Closing /></Shelf>
    <Shelf id="match-tools" title="Build your view" description="Form, performances and your own fair price." count={3}><Form /><XG /><Model /></Shelf>
    <Shelf id="team-tools" title="Go a little deeper" description="Find the patterns behind a team or manager." count={4}><PnL /><Ratings /><Managers /><Goals /></Shelf>
    <footer className="demo-bottom"><div><h2>Found your next research tool?</h2><p>Unlock the full Pro tools for €19.99 a month.</p></div><Link className="demo-pro-button" to="/pro">See what’s included <Arrow /></Link></footer>
    <details className="demo-data-note"><summary>About these samples & calculations</summary><div>
      <p>These are fixed examples captured on 22 October 2026, not live prices. Each card’s sample differs. “Pro” identifies tools whose full access requires membership; some also offer free previews. Past returns do not establish a future betting edge.</p>
      <p>Steam and drifter tables show the three teams with the most settled qualifying moves. They include all tracked competitions, not only Telegram alerts. A qualifying move is at least 3 percentage points (pp) in raw implied probability, observed within two hours of kick-off. One move per match and side is retained: the largest observed move. P/L uses a 1-unit stake at that recorded price; draws lose. This descriptive record is not a strategy backtest.</p>
      <p>Favourite–longshot examples use the 2025/26 Premier League and backing returns at the tool’s recorded market prices. Team P/L uses Arsenal’s available records from 12 February 2026, at 1 unit per bet. Open the full tools for price coverage, filters and settlement details. A unit is an equal stake, independent of currency.</p>
      <p>Form Lab uses Sportmonks non-penalty xG (npxG). Rolling xG and predictor inputs use Understat. Providers may differ. Arsenal–Leeds examples use matches before 10 October 2026; model inputs are the last 20 games at all venues. The current predictor reconstructs fair prices from historical inputs; these are not saved pre-match forecasts.</p>
      <p>Model absence scenarios reduce Arsenal’s scoring rate by 6% (weakened) or 12% (severe), while increasing Leeds’ by the same percentage. They are hypothetical, not team news. Other parameters and the archived league baseline are fixed. Form Lab controls do not alter model inputs. Fair odds exclude bookmaker margin.</p>
      <p>The odds chart uses archived quotes; only the last quote’s bookmaker is identified as Pinnacle. Closing lines are Pinnacle’s last recorded pre-kick-off quote, not a guarantee of the exact market close. Club and manager ratings are dated snapshots. Manager impact is the tool’s accumulated rating measure, not a causal estimate. Goals coming soon compares recorded goals with xG over the stated sample; an xG shortfall does not guarantee a rebound.</p>
    </div></details>
  </div>;
}
