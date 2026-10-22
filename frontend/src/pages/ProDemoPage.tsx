import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import OddsChart from '../components/OddsChart';
import { demo, demoInputs, demoParams, formSummary, rollingXG, selectForm } from '../model/proDemo';
import type { Sample, Side, Venue } from '../model/proDemo';
import { runModel } from '../model/valorModel';
import './ProDemoPage.css';

const tools = [
  { id: 'market', name: 'Odds movement', detail: 'Follow the price' },
  { id: 'form', name: 'Form Lab', detail: 'Look beyond the score' },
  { id: 'xg', name: 'Rolling xG', detail: 'Find the underlying trend' },
  { id: 'model', name: 'Match predictor', detail: 'Build your own price' },
] as const;
type Tool = (typeof tools)[number]['id'];
const isTool = (value: string | null): value is Tool => tools.some(tool => tool.id === value);
const date = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const quoteTime = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const num = (value: number | null) => value === null ? '—' : value.toFixed(2);
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const sides: Side[] = ['home', 'away'];

function Choices<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <fieldset className="demo-choices"><legend>{label}</legend><div>
    {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div></fieldset>;
}

function MarketDemo() {
  const [window, setWindow] = useState<'all' | '168' | '48'>('all');
  const points = useMemo(() => window === 'all' ? demo.odds : demo.odds.filter(point =>
    Date.parse(point.timestamp) >= Date.parse(demo.match.kickoff) - Number(window) * 3600000), [window]);
  const first = points[0];
  const last = points[points.length - 1];
  const move = 100 / last.home_odds - 100 / first.home_odds;
  return <>
    <div className="demo-panel-heading"><div><h2>See how the price changed.</h2><p>Switch outcomes or view the move as implied probability.</p></div>
      <Choices label="Pre-match window" value={window} onChange={setWindow} options={[{ value: 'all', label: 'All recorded' }, { value: '168', label: 'Last 7 days' }, { value: '48', label: 'Last 48h' }]} />
    </div>
    <div className="demo-market-grid">
      <div className="demo-odds-chart"><OddsChart data={points} homeTeam={demo.match.home} awayTeam={demo.match.away} /></div>
      <aside className="demo-reading">
        <h3>{move < 0 ? 'Arsenal drifted.' : move > 0 ? 'Arsenal shortened.' : 'Arsenal finished unchanged.'}</h3>
        <div className="demo-price-change"><span>{num(first.home_odds)}</span><span aria-hidden="true">→</span><strong>{num(last.home_odds)}</strong></div>
        <p>First to last recorded home price in this window. Raw implied probability {move < 0 ? 'fell' : 'changed'} by <strong>{Math.abs(move).toFixed(2)} percentage points</strong>.</p>
        <dl className="demo-quote-dates"><div><dt>First quote</dt><dd>{quoteTime(first.timestamp)} UTC</dd></div><div><dt>Last quote</dt><dd>{quoteTime(last.timestamp)} UTC</dd></div></dl>
        <p className="demo-note">A move tells you how the price changed. Form and team news help you investigate it.</p>
      </aside>
    </div>
    <div className="demo-table-scroll" role="region" aria-label="Recorded match odds" tabIndex={0}><table className="demo-table demo-market-table"><caption>Decimal odds in the selected window</caption><thead><tr><th scope="col">Outcome</th><th scope="col">First recorded</th><th scope="col">Last recorded</th><th scope="col">Implied move</th></tr></thead><tbody>
      {([['Arsenal', 'home_odds'], ['Draw', 'draw_odds'], ['Leeds United', 'away_odds']] as const).map(([label, key]) => <tr key={key}><th scope="row">{label}</th><td>{num(first[key])}</td><td>{num(last[key])}</td><td>{signed(100 / last[key] - 100 / first[key])}pp</td></tr>)}
    </tbody></table></div>
    <p className="demo-source">SteamWatch’s archived pre-match quotes. Last quote: Pinnacle. Implied probability = 1 / odds; bookmaker margin is included. Chart times follow your device timezone. No live prices.</p>
  </>;
}

function FormDemo() {
  const [sample, setSample] = useState<Sample>(20);
  const [venue, setVenue] = useState<Venue>('all');
  const rows = sides.map(side => ({ side, games: selectForm(side, sample, venue), summary: formSummary(selectForm(side, sample, venue)) }));
  return <>
    <div className="demo-panel-heading"><div><h2>Give the scoreline some context.</h2><p>Start with 20 games, then narrow the sample by venue.</p></div><Link className="demo-text-link" to="/tools/form-lab">Explore the full Form Lab →</Link></div>
    <div className="demo-controls">
      <Choices label="Last matching games" value={sample} onChange={setSample} options={[5, 10, 20].map(value => ({ value: value as Sample, label: String(value) }))} />
      <Choices label="Venue for both teams" value={venue} onChange={setVenue} options={[{ value: 'all', label: 'All venues' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }]} />
    </div>
    <div className="demo-table-scroll" role="region" aria-label="Team form comparison" tabIndex={0}><table className="demo-table demo-form-table"><caption>Premier League form before 10 October 2026 · averages per game</caption><thead><tr><th scope="col">Team</th><th scope="col">Played</th><th scope="col">W–D–L</th><th scope="col">Goals for</th><th scope="col">Goals against</th><th scope="col">npxG for</th><th scope="col">npxG against</th><th scope="col">npxG difference</th></tr></thead><tbody>
      {rows.map(({ side, summary: s }) => <tr key={side}><th scope="row">{demo.match[side]}</th><td>{s.played}</td><td>{s.wins}–{s.draws}–{s.losses}</td><td>{num(s.goalsFor)}</td><td>{num(s.goalsAgainst)}</td><td>{num(s.xgFor)}</td><td>{num(s.xgAgainst)}</td><td className="demo-emphasis">{s.xgFor !== null && s.xgAgainst !== null ? signed(s.xgFor - s.xgAgainst) : '—'}</td></tr>)}
    </tbody></table></div>
    <div className="demo-form-notes">{rows.map(({ side, games, summary }) => <div key={side}><h3>{demo.match[side]}</h3><p>{games.length ? `${date(games[0].date)} – ${date(games[games.length - 1].date)}` : 'No matches in this sample'}</p><div className="demo-form-strip" aria-label={`${demo.match[side]} results, oldest to newest`}>{games.map(game => <span key={game.id} className={`demo-result-${game.gf > game.ga ? 'w' : game.gf === game.ga ? 'd' : 'l'}`} title={`${date(game.date)} · ${game.venue} vs ${game.opponent} · ${game.gf}–${game.ga}`}>{game.gf > game.ga ? 'W' : game.gf === game.ga ? 'D' : 'L'}</span>)}</div><p className="demo-note">Oldest → newest · npxG coverage: {summary.xgCoverage}/{summary.played}</p></div>)}</div>
    <details className="demo-details"><summary>See the matches in this sample</summary>{rows.map(({ side, games }) => <div className="demo-table-scroll" key={side} role="region" aria-label={`${demo.match[side]} sample matches`} tabIndex={0}><table className="demo-table"><caption>{demo.match[side]} · team score first</caption><thead><tr><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col">Venue</th><th scope="col">Score</th><th scope="col">npxG for</th><th scope="col">npxG against</th></tr></thead><tbody>{[...games].reverse().map(game => <tr key={game.id}><td>{date(game.date)}</td><th scope="row">{game.opponent}</th><td>{game.venue}</td><td>{game.gf}–{game.ga}</td><td>{num(game.npxgf)}</td><td>{num(game.npxga)}</td></tr>)}</tbody></table></div>)}</details>
    <p className="demo-source">Source: Sportmonks, as used by Form Lab. npxG means non-penalty expected goals. Venue is filtered before selecting the last {sample} matches across 2025/26 and 2026/27. Missing xG is excluded from xG averages, never treated as zero.</p>
  </>;
}

function XGDemo() {
  const [side, setSide] = useState<Side>('home');
  const [window, setWindow] = useState<5 | 10>(5);
  const rows = rollingXG(side, window);
  const last = rows[rows.length - 1];
  return <>
    <div className="demo-panel-heading"><div><h2>Follow the performances underneath.</h2><p>Compare chance creation with chances allowed, over time.</p></div><Link className="demo-text-link" to="/tools/rolling-xg">Explore rolling xG →</Link></div>
    <div className="demo-controls"><Choices label="Team" value={side} onChange={setSide} options={sides.map(value => ({ value, label: demo.match[value] }))} /><Choices label="Rolling average" value={window} onChange={setWindow} options={[{ value: 5, label: '5 games' }, { value: 10, label: '10 games' }]} /></div>
    <div className="demo-xg-heading"><h3>{demo.match[side]} <span>Last 20 match points</span></h3><div className="demo-xg-legend"><span className="demo-line-for">npxG for</span><span className="demo-line-against">npxG against</span></div></div>
    <div className="demo-xg-chart" role="img" aria-label={`${demo.match[side]} ${window}-game rolling non-penalty xG. Latest: ${num(last.for)} for, ${num(last.against)} against. Match values available below.`}><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ left: -20, top: 16, right: 12, bottom: 6 }} accessibilityLayer>
      <CartesianGrid stroke="#334155" vertical={false} strokeDasharray="3 5" /><XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: '#aabbd0', fontSize: 12 }} minTickGap={40} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#aabbd0', fontSize: 12 }} tickFormatter={value => Number(value).toFixed(1)} axisLine={false} tickLine={false} domain={[0, 'auto']} />
      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #475569', borderRadius: 8, color: '#e2e8f0' }} labelFormatter={value => date(String(value))} formatter={value => num(Number(value))} />
      <Line dataKey="for" name="npxG for" stroke="#67e8f9" strokeWidth={2.5} dot={false} isAnimationActive={false} /><Line dataKey="against" name="npxG against" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
    </LineChart></ResponsiveContainer></div>
    <p className="demo-insight">Across the latest {window} matches, {demo.match[side]} averaged <strong>{num(last.for)} npxG for</strong> and <strong>{num(last.against)} against</strong> — a difference of <strong>{signed(last.for - last.against)}</strong> per game.</p>
    <details className="demo-details"><summary>See the chart values</summary><div className="demo-table-scroll" role="region" aria-label="Rolling xG values" tabIndex={0}><table className="demo-table"><caption>{window}-game rolling averages · team score first</caption><thead><tr><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col">Score</th><th scope="col">npxG for</th><th scope="col">npxG against</th></tr></thead><tbody>{[...rows].reverse().map(row => <tr key={row.id}><td>{date(row.date)}</td><th scope="row">{row.opponent}</th><td>{row.gf}–{row.ga}</td><td>{num(row.for)}</td><td>{num(row.against)}</td></tr>)}</tbody></table></div></details>
    <p className="demo-source">Source: Understat, as used by SteamWatch’s rolling xG tool. Each point includes that game and the preceding {window - 1}; earlier matches provide a full window at the start of the chart. Providers model xG differently, so these figures can differ from Form Lab.</p>
  </>;
}

function ModelDemo() {
  const [homeAbsence, setHomeAbsence] = useState(1);
  const [awayAbsence, setAwayAbsence] = useState(1);
  const [line, setLine] = useState(-1.5);
  const baseline = useMemo(() => runModel({ home: demoInputs('home'), away: demoInputs('away') }, demoParams), []);
  const model = useMemo(() => runModel({ home: demoInputs('home', homeAbsence), away: demoInputs('away', awayAbsence) }, demoParams), [homeAbsence, awayAbsence]);
  const changed = homeAbsence !== 1 || awayAbsence !== 1;
  const total = model.totalsRows.find(row => row.line === 2.5)!;
  const ah = model.ahRows.find(row => row.line === line)!;
  const last = demo.odds[demo.odds.length - 1];
  const probabilities = [model.probHome, model.probDraw, model.probAway];
  const baselineProbabilities = [baseline.probHome, baseline.probDraw, baseline.probAway];
  const labels = [demo.match.home, 'Draw', demo.match.away];
  return <>
    <div className="demo-panel-heading"><div><h2>Turn your view into a price.</h2><p>A 20-game baseline, using the same model as the full predictor.</p></div><button type="button" className="demo-reset" onClick={() => { setHomeAbsence(1); setAwayAbsence(1); setLine(-1.5); }} disabled={!changed && line === -1.5}>Reset demo</button></div>
    <div className="demo-model-grid"><div className="demo-model-inputs"><h3>Try a team-news scenario</h3><p>Change either team’s availability and watch the fair prices respond.</p>
      {sides.map(side => <label className="demo-field" key={side}><span>{demo.match[side]} absences</span><select value={side === 'home' ? homeAbsence : awayAbsence} onChange={event => (side === 'home' ? setHomeAbsence : setAwayAbsence)(Number(event.target.value))}><option value={1}>No adjustment</option><option value={3}>Weakened</option><option value={5}>Severely weakened</option></select></label>)}
      <p className="demo-note">These are your assumptions, not reported team news. The model reduces a weakened team’s scoring rate by 6% and increases its opponent’s by 6%; severe uses 12%.</p>
      <dl className="demo-input-summary">{sides.map(side => { const input = demoInputs(side); return <div key={side}><dt>{demo.match[side]} · 20 games</dt><dd>{num(input.xgFor)} xG for <span>/</span> {num(input.xgAgainst)} against</dd></div>; })}</dl>
    </div><div className="demo-model-results">
      <div className="demo-results-heading"><h3>Fair 1X2 prices</h3><span>{changed ? 'Your scenario' : 'Baseline'}</span></div>
      <div className="demo-fair-prices" aria-live="polite" aria-atomic="true">{labels.map((label, index) => <div key={label}><h4>{label}</h4><strong>{num(1 / probabilities[index])}</strong><span>{pct(probabilities[index])}</span>{changed && <small>Baseline {num(1 / baselineProbabilities[index])}</small>}</div>)}</div>
      <div className="demo-goals"><span>Model expected goals</span><strong>{num(model.lambdaHome)} <span>–</span> {num(model.lambdaAway)}</strong></div>
      <div className="demo-table-scroll" role="region" aria-label="Additional model markets" tabIndex={0}><table className="demo-table"><caption>More markets · fair decimal odds</caption><tbody><tr><th scope="row">Total goals 2.5</th><td>Over <strong>{num(total.overOdds)}</strong></td><td>Under <strong>{num(total.underOdds)}</strong></td></tr><tr><th scope="row">Both teams to score</th><td>Yes <strong>{num(model.bttsYesOdds)}</strong></td><td>No <strong>{num(model.bttsNoOdds)}</strong></td></tr><tr><th scope="row"><label className="demo-ah-label">Arsenal handicap<select aria-label="Arsenal Asian handicap" value={line} onChange={event => setLine(Number(event.target.value))}>{[-2, -1.75, -1.5, -1.25, -1, -0.75, -0.5].map(value => <option value={value} key={value}>{value.toFixed(2)}</option>)}</select></label></th><td>Arsenal <strong>{num(ah.homeOdds)}</strong></td><td>Leeds +{(-line).toFixed(2)} <strong>{num(ah.awayOdds)}</strong></td></tr></tbody></table></div>
      <p className="demo-note">Fair odds exclude bookmaker margin. Handicap prices account for half wins, half losses and pushes where applicable.</p>
    </div></div>
    <div className="demo-market-comparison"><div><h3>Compare with the recorded market</h3><p>Pinnacle’s last recorded 1X2 quote · {quoteTime(last.timestamp)} UTC</p></div><p className="demo-compare-odds">Arsenal <strong>{num(last.home_odds)}</strong><span>Draw <strong>{num(last.draw_odds)}</strong></span>Leeds <strong>{num(last.away_odds)}</strong></p></div>
    <p className="demo-source">This is a reconstruction using today’s model and historical inputs, not a saved pre-match forecast or a proven betting edge. An apparent difference from the market is a starting point for further research.</p>
    <details className="demo-details"><summary>Inputs, assumptions and calculation log</summary><p>Both teams use their last 20 Premier League games before this fixture, all venues, ending 19 September (Arsenal) and 20 September (Leeds). Understat total xG, goals conceded and the last six games feed the existing predictor. Half of penalty xG is retained, using total xG minus npxG; penalty counts are not assumed.</p><p>The archived league baseline was computed on 3 October 2026 from 430 matches across two seasons. It uses a weighted scoring rate of {num(demo.league.avgGoalsPerTeam * 2)} goals per match and home/away ratio {num(demo.league.homeAwayRatio)}. Recent form weight: 25%; Dixon–Coles rho: −0.03; draw multiplier: 1.08. Shot-quality and set-piece adjustments are skipped because those inputs are not supplied.</p><p>Form Lab filters do not change these model inputs. Absence scenarios are the only strength inputs you change in this demo.</p><ol className="demo-calculation-log">{model.calcLog.map((entry, index) => <li key={index}>{entry}</li>)}</ol></details>
  </>;
}

export default function ProDemoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tool');
  const active: Tool = isTool(requested) ? requested : 'market';
  const activeIndex = tools.findIndex(tool => tool.id === active);
  function selectTool(tool: Tool) { setSearchParams({ tool }, { replace: true, preventScrollReset: true }); }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tools.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tools.length) % tools.length;
    selectTool(tools[next].id);
    document.getElementById(`demo-tab-${tools[next].id}`)?.focus();
  }
  return <div className="pro-demo">
    <Helmet><title>Try SteamWatch Pro | Interactive Football Research Demo</title><meta name="description" content="Try SteamWatch’s odds charts, Form Lab, rolling xG and Dixon–Coles match predictor on a historical Arsenal–Leeds match. No sign-up required." /><link rel="canonical" href="https://www.steamwatch.io/pro/demo" /><meta property="og:title" content="Try the SteamWatch Pro demo" /><meta property="og:description" content="One match. Odds movement, Form Lab, rolling xG and model prices. Try the tools without signing up." /><meta property="og:url" content="https://www.steamwatch.io/pro/demo" /></Helmet>
    <header className="demo-intro"><div><h1>A match. Four ways to read it.</h1><p>Try SteamWatch Pro on a real match. Follow the market, test the form and build your own price. No sign-up needed.</p></div><Link className="demo-text-link" to="/pro">What’s included in Pro →</Link></header>
    <section className="demo-workbench" aria-label="Interactive Pro demo">
      <div className="demo-fixture"><div><div className="demo-fixture-meta"><span>Historical demo</span><span>Premier League · 10 October 2026</span></div><h2>Arsenal <span>vs</span> Leeds United</h2></div><p>One sample match.<br /><strong>Real tools to explore.</strong></p></div>
      <div className="demo-tabs" role="tablist" aria-label="Research tools">{tools.map((tool, index) => <button key={tool.id} type="button" role="tab" id={`demo-tab-${tool.id}`} aria-controls={`demo-panel-${tool.id}`} aria-selected={active === tool.id} tabIndex={active === tool.id ? 0 : -1} onClick={() => selectTool(tool.id)} onKeyDown={event => onTabKey(event, index)}><span>{tool.name}</span><small>{tool.detail}</small></button>)}</div>
      <section className="demo-panel" role="tabpanel" id={`demo-panel-${active}`} aria-labelledby={`demo-tab-${active}`} tabIndex={0}>
        {active === 'market' && <MarketDemo />}{active === 'form' && <FormDemo />}{active === 'xg' && <XGDemo />}{active === 'model' && <ModelDemo />}
        {activeIndex < tools.length - 1 && <div className="demo-next"><span>{active === 'market' ? 'Put the market move alongside the teams’ form.' : active === 'form' ? 'See whether those performances are improving.' : 'Use those inputs to build a baseline price.'}</span><button type="button" onClick={() => { selectTool(tools[activeIndex + 1].id); document.getElementById(`demo-tab-${tools[activeIndex + 1].id}`)?.focus(); }}>Try {tools[activeIndex + 1].name} →</button></div>}
      </section>
    </section>
    <section className="demo-membership"><div><h2>Take this process to your next match.</h2><p>Pro opens the full tools: choose your teams, explore deeper form filters, track xG and build model prices.</p><p className="demo-note">Plus steam and drifter rankings, team P/L and favourite–longshot analysis.</p></div><div><Link className="demo-primary-link" to="/pro">Explore SteamWatch Pro →</Link><p>€19.99 / month · Renews automatically</p></div></section>
    <details className="demo-details demo-provenance"><summary>About this historical demo and its data</summary><p>Arsenal–Leeds, 10 October 2026, 11:30 UTC. This frozen sample uses only matches and quotes from before kickoff. Match samples end on 20 September; the gap reflects the fixture calendar. It does not refresh into a live tip.</p><p><a href={demo.provenance.oddsUrl}>Archived odds</a> were retrieved on 22 October 2026. The chart preserves each price change and the quotes immediately before it, plus the first and last of {demo.provenance.oddsOriginalCount.toLocaleString()} stored quotes. The public archive identifies Pinnacle for the last quote; it does not identify a bookmaker for every earlier point. First recorded is not necessarily the bookmaker’s opening price, and last recorded is not necessarily the exact closing line.</p><p>Form Lab uses cached <a href="https://www.sportmonks.com/football-api/">Sportmonks</a> results and non-penalty xG from 2025/26 and 2026/27. Rolling xG and the model use <a href="https://understat.com/league/EPL/2026">Understat</a> from the same two seasons. Different providers’ xG estimates should not be treated as interchangeable. Model calculations are performed now on historical inputs, with an archived league baseline; they are not an original pre-match forecast.</p><p>This is a focused demonstration of four tools. The full versions offer wider team selection, filters and settings. Research tools provide context, not a promise of profit.</p></details>
  </div>;
}
