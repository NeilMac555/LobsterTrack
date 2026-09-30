import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { getXgTable } from '../api';
import type { XgTableResponse, XgTableRow } from '../types';

// /goals-coming-soon — client twin of
// backend/app/services/goals_coming_soon_page.py, which server-renders the
// 12-month version for crawlers. Keep copy identical in both places.
// Spec: docs/goals-coming-soon.md.

const TITLE = 'Teams Underperforming xG: Goals Coming Soon | SteamWatch';
const DESCRIPTION =
  "Teams underperforming their xG, and those running hot: goals against expected goals across Europe's top five leagues, last 12 months, updated weekly.";

const TOP_N = 10;
const LEAGUE_N = 5;
const LEAGUES: Array<[string, string, string]> = [
  ['soccer_epl', 'Premier League', 'premier-league'],
  ['soccer_spain_la_liga', 'La Liga', 'la-liga'],
  ['soccer_germany_bundesliga', 'Bundesliga', 'bundesliga'],
  ['soccer_italy_serie_a', 'Serie A', 'serie-a'],
  ['soccer_france_ligue_one', 'Ligue 1', 'ligue-1'],
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}
const sgn = (v: number, nd = 1) => `${v > 0 ? '+' : ''}${v.toFixed(nd)}`;
const top3 = (rows: XgTableRow[], below: boolean) =>
  rows.length ? `Furthest ${below ? 'below' : 'above'} their xG: ${rows.slice(0, 3).map((r) => `${r.team} (${sgn(r.gap)}, ${r.league_name})`).join(', ')}.` : '';

function GapTable({ rows, leagueCol = true }: { rows: XgTableRow[]; leagueCol?: boolean }) {
  if (!rows.length) return <p className="text-slate-400 text-sm">No club has enough matches in the window yet.</p>;
  const th = (t: string, right = true) => <th key={t} className={`${right ? 'text-right' : 'text-left'} px-3 py-2`}>{t}</th>;
  return (
    <div className="overflow-x-auto rounded-md border border-slate-700/50">
      <table className="w-full text-[13px] font-mono">
        <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase tracking-wider">
          <tr>{th('#')}{th('Club', false)}{leagueCol && th('League', false)}{th('P')}{th('Goals')}{th('xG')}{th('Gap')}{th('Per match')}{th('Def gap')}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.league}:${r.team}`} className="border-t border-slate-700/40 text-slate-200">
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">{i + 1}</td>
              <td className="px-3 py-2">{r.team}</td>
              {leagueCol && <td className="px-3 py-2 text-slate-400">{r.league_name}</td>}
              <td className="px-3 py-2 text-right tabular-nums">{r.matches}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.goals}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.xg.toFixed(1)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${r.gap < 0 ? 'text-emerald-400' : 'text-red-400'}`}>{sgn(r.gap)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{sgn(r.gap_per_match, 2)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-400">{sgn(r.def_gap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const H2 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h2 id={id} className="text-lg font-bold text-white mt-8 mb-3 scroll-mt-20">{children}</h2>
);
const H3 = ({ children }: { children: ReactNode }) => <h3 className="text-sm font-semibold text-slate-200 mt-4 mb-2">{children}</h3>;
const P = ({ children }: { children: ReactNode }) => <p className="text-slate-300 text-[15px] leading-relaxed max-w-[72ch] mb-3">{children}</p>;

export default function GoalsComingSoonPage() {
  const [months, setMonths] = useState<6 | 12>(12);
  const [data, setData] = useState<XgTableResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getXgTable(months)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); });
    return () => { cancelled = true; };
  }, [months]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const below = useMemo(() => rows.slice(0, TOP_N), [rows]);
  const above = useMemo(() => rows.slice(-TOP_N).reverse(), [rows]);
  const asOf = fmtDate(data?.latest_match);

  const btn = (m: 6 | 12) =>
    `px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] rounded transition-colors ${
      months === m ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 border border-slate-700 hover:text-white'
    }`;
  const a = 'text-cyan-400 hover:underline';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://www.steamwatch.io/goals-coming-soon" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content="https://www.steamwatch.io/goals-coming-soon" />
      </Helmet>

      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">Goals Coming Soon</h1>
      <P>
        Teams underperforming their expected goals across Europe's top five leagues, and the teams running hot above theirs.
        Gap is goals scored minus xG over the last {months} months: the more negative, the more chances have gone unrewarded.
        {' '}{top3(below, true)}
      </P>
      <p className="text-xs text-slate-500 font-mono mb-3">
        {data ? `Matches from ${fmtDate(data.since)} to ${asOf} · ${data.clubs_in_window} clubs with ${data.min_matches}+ matches · Understat data · updated ${fmtDate(data.refreshed_at)}` : 'Loading'}
      </p>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <nav className="text-xs text-slate-500 font-mono" aria-label="Sections">
          Jump to: <a href="#underperforming" className={a}>Below xG</a> · <a href="#overperforming" className={a}>Above xG</a>
          {LEAGUES.map(([, name, anchor]) => <span key={anchor}> · <a href={`#${anchor}`} className={a}>{name}</a></span>)} · <a href="#faq" className={a}>Questions</a>
        </nav>
        <div className="flex gap-2">
          <button type="button" className={btn(12)} onClick={() => setMonths(12)}>12 months</button>
          <button type="button" className={btn(6)} onClick={() => setMonths(6)}>6 months</button>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <H2 id="underperforming">Teams underperforming xG: furthest below, all five leagues</H2>
      <GapTable rows={below} />

      <H2 id="overperforming">Teams overperforming xG: furthest above, all five leagues</H2>
      <P>{top3(above, false)} The same logic applies in reverse: goals usually fall back towards the chances created.</P>
      <GapTable rows={above} />

      {LEAGUES.map(([key, name, anchor]) => {
        const lrows = rows.filter((r) => r.league === key);
        if (!lrows.length) return null;
        const lb = lrows.slice(0, LEAGUE_N);
        const la = lrows.slice(-LEAGUE_N).reverse();
        return (
          <section key={key}>
            <H2 id={anchor}>{name} teams underperforming and overperforming xG</H2>
            <p className="text-xs text-slate-500 font-mono mb-2">{lrows.length} {name} clubs with 8+ matches in the window. {top3(lb, true)} {top3(la, false)}</p>
            <H3>Below xG</H3>
            <GapTable rows={lb} leagueCol={false} />
            <H3>Above xG</H3>
            <GapTable rows={la} leagueCol={false} />
          </section>
        );
      })}

      <H2 id="method">How it is measured</H2>
      <P>
        Match-level goals and xG come from Understat for the Premier League, La Liga, Bundesliga, Serie A and Ligue 1, refreshed
        every Monday. The window is a rolling 12 months of league matches, or 6 months on the toggle, so it spans the end of
        last season and the start of this one. A club needs at least 8 matches in the window, and a place in the division this
        season, to appear. xG here is total xG, including penalties, so it lines up with goals scored. Gap is goals minus xG;
        Def gap is goals conceded minus xGA, so a negative Def gap means a defence conceding less than the chances it allows.
      </P>
      <H2 id="meaning">What the gap means</H2>
      <P>
        Over a season, goals track xG closely, and a club well below its xG usually catches up in the end. When that happens
        is not something the numbers can say. Last season across the five leagues, a club's gap in its first five matches told
        you almost nothing about its gap in the remaining 33. Read the tables as a list of attacks creating more than they
        score, and of attacks scoring more than they create, and check the price before assuming the market has not noticed.
      </P>

      <H2 id="faq">Questions</H2>
      <H3>What does underperforming xG mean?</H3>
      <P>A team is underperforming its expected goals when it has scored fewer goals than the xG value of the chances it created. On this page the gap is goals minus xG over the window, and a negative gap is underperformance.</P>
      <H3>Which teams are underperforming their xG right now?</H3>
      <P>As of matches to {asOf}, the clubs furthest below their xG over the last {months} months in the top five leagues are {below.slice(0, 3).map((r) => `${r.team} (${sgn(r.gap)})`).join(', ')}. The full top ten and a breakdown by league are above.</P>
      <H3>Which teams are overperforming their xG?</H3>
      <P>As of matches to {asOf}, the clubs furthest above their xG are {above.slice(0, 3).map((r) => `${r.team} (${sgn(r.gap)})`).join(', ')}. Goals usually fall back towards chances created, so these are the regression candidates in the other direction.</P>
      <H3>Do teams that underperform xG catch up?</H3>
      <P>Usually, over a long enough run: goals track xG closely across a season. When the catch-up happens is not predictable. Across the five leagues last season, a club's goals-minus-xG gap in its first five matches had almost no relationship with its gap over the remaining 33.</P>
      <H3>Does the gap include penalties?</H3>
      <P>Yes. xG here is total xG including penalty xG, so it compares like with like against goals scored. Non-penalty figures per club are on the <Link to="/tools/rolling-xg" className={a}>Rolling xG</Link> page.</P>
      <H3>How often is this page updated?</H3>
      <P>Every Monday at 03:30 UTC from Understat, covering the current and previous season, so the 12-month window is always complete.</P>

      <H2>More on SteamWatch</H2>
      <ul className="list-disc pl-5 text-slate-300 text-sm space-y-1">
        <li><Link to="/justice-table" className={a}>The Justice Table: every league table rebuilt on expected points</Link></li>
        <li><Link to="/tools/rolling-xg" className={a}>Rolling xG: each club's last 5 and 10 matches, non-penalty</Link></li>
        <li><Link to="/team-pnl" className={a}>Team P/L: what backing each club at closing prices returned</Link></li>
        <li><Link to="/tools/match-predictor" className={a}>Match Predictor: fair odds from xG form</Link></li>
        <li><Link to="/dropping-odds" className={a}>Dropping Odds: where the market is moving today</Link></li>
      </ul>
    </div>
  );
}
