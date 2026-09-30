import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { getJusticeTable } from '../api';
import type { JusticeResponse, JusticeRow } from '../types';

// /justice-table — client twin of backend/app/services/justice_table_page.py,
// which server-renders the current season for crawlers. Keep copy identical
// in both places. Adds the season toggle.

const TITLE = 'Expected Points Table (xPts): Justice Table | SteamWatch';
const DESCRIPTION =
  "Every top-five-league table rebuilt on expected points over the last 12 months: each club's rank on xPts against its rank on results, updated weekly.";

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
const names = (rows: JusticeRow[], league = true) => rows.map((r) => `${r.team} (${sgn(r.gap)}${league ? `, ${r.league_name}` : ''})`).join(', ');

const H2 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h2 id={id} className="text-lg font-bold text-white mt-8 mb-3 scroll-mt-20">{children}</h2>
);
const H3 = ({ children }: { children: ReactNode }) => <h3 className="text-sm font-semibold text-slate-200 mt-4 mb-2">{children}</h3>;
const P = ({ children }: { children: ReactNode }) => <p className="text-slate-300 text-[15px] leading-relaxed max-w-[72ch] mb-3">{children}</p>;

function Table({ rows }: { rows: JusticeRow[] }) {
  if (!rows.length) return <p className="text-slate-400 text-sm">No matches in this season yet.</p>;
  const th = (t: string, right = true) => <th key={t} className={`${right ? 'text-right' : 'text-left'} px-2.5 py-2`}>{t}</th>;
  const td = (v: ReactNode, cls = '') => <td className={`px-2.5 py-2 text-right tabular-nums ${cls}`}>{v}</td>;
  return (
    <div className="overflow-x-auto rounded-md border border-slate-700/50">
      <table className="w-full text-[13px] font-mono">
        <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase tracking-wider">
          <tr>{th('xPos')}{th('Club', false)}{th('Pos')}{th('P')}{th('W')}{th('D')}{th('L')}{th('GF')}{th('GA')}{th('Pts')}{th('xPts')}{th('Gap')}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team} className="border-t border-slate-700/40 text-slate-200">
              {td(r.xpos, 'text-slate-400')}
              <td className="px-2.5 py-2 whitespace-nowrap">{r.team}</td>
              {td(r.pos, r.pos < r.xpos ? 'text-red-400' : r.pos > r.xpos ? 'text-emerald-400' : 'text-slate-400')}
              {td(r.matches)}{td(r.won)}{td(r.drawn)}{td(r.lost)}{td(r.goals)}{td(r.conceded)}
              {td(<strong>{r.points}</strong>)}{td(r.xpts.toFixed(1))}
              {td(sgn(r.gap), r.gap > 0 ? 'text-red-400' : r.gap < 0 ? 'text-emerald-400' : '')}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function JusticeTablePage() {
  const [months, setMonths] = useState<6 | 12>(12);
  const [data, setData] = useState<JusticeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getJusticeTable(months)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); });
    return () => { cancelled = true; };
  }, [months]);

  const all = useMemo(() => LEAGUES.flatMap(([k]) => data?.leagues[k] ?? []), [data]);
  const over = useMemo(() => [...all].sort((x, y) => y.gap - x.gap).slice(0, 3), [all]);
  const under = useMemo(() => [...all].sort((x, y) => x.gap - y.gap).slice(0, 3), [all]);
  const asOf = fmtDate(data?.latest_match);
  const prev = data?.previous_summary;
  const a = 'text-cyan-400 hover:underline';
  const btn = (active: boolean) =>
    `px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] rounded transition-colors ${
      active ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 border border-slate-700 hover:text-white'
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://www.steamwatch.io/justice-table" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content="https://www.steamwatch.io/justice-table" />
      </Helmet>

      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">The Justice Table</h1>
      <P>
        Each of Europe's top five league tables rebuilt on expected points over the last {months} months. A club's expected points are what its chances, and
        its opponents' chances, were worth match by match; the table sorts on them, with the rank on real points alongside. Gap is
        points minus expected points: positive means results have been kinder than the play.
        {all.length > 0 && <> Biggest gaps: {names(over)}. Furthest behind: {names(under)}.</>}
      </P>
      <p className="text-xs text-slate-500 font-mono mb-3">
        {data ? `Matches from ${fmtDate(data.since)} to ${asOf} · clubs with ${data.min_matches}+ matches · Understat data · updated ${fmtDate(data.refreshed_at)}` : 'Loading'}
      </p>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <nav className="text-xs text-slate-500 font-mono" aria-label="Sections">
          Jump to: {LEAGUES.map(([, name, anchor], i) => <span key={anchor}>{i > 0 && ' · '}<a href={`#${anchor}`} className={a}>{name}</a></span>)} · <a href="#method" className={a}>Method</a> · <a href="#faq" className={a}>Questions</a>
        </nav>
        <div className="flex gap-2">
          <button type="button" className={btn(months === 12)} onClick={() => setMonths(12)}>12 months</button>
          <button type="button" className={btn(months === 6)} onClick={() => setMonths(6)}>6 months</button>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {LEAGUES.map(([key, name, anchor]) => {
        const rows = data?.leagues[key] ?? [];
        if (!rows.length) return null;
        const o = [...rows].sort((x, y) => y.gap - x.gap).slice(0, 3);
        const u = [...rows].sort((x, y) => x.gap - y.gap).slice(0, 3);
        const pMin = Math.min(...rows.map((r) => r.matches)); const pMax = Math.max(...rows.map((r) => r.matches));
        return (
          <section key={key}>
            <H2 id={anchor}>{name} justice table, last {months} months</H2>
            <p className="text-xs text-slate-500 font-mono mb-2">
              {rows.length} clubs, {pMin === pMax ? pMin : `${pMin} to ${pMax}`} matches played. Above their expected points: {names(o, false)}. Below: {names(u, false)}.
            </p>
            <Table rows={rows} />
          </section>
        );
      })}
      <p className="text-xs text-slate-500 mt-3 max-w-[72ch]">xPos is the rank on expected points over the window; Pos is the rank on real points over the same window. Gap is points minus expected points.</p>

      <H2 id="method">How it is measured</H2>
      <P>
        Expected points come from Understat, which turns the xG of both sides in a match into win, draw and loss probabilities
        and scores them 3, 1 and 0. A match a side would win 60% of the time and draw 20% of the time is worth 2.0 expected
        points. Summed over the season they give the points a club's chances, and its opponents' chances, deserved. The window is
        a rolling 12 months of league matches, or 6 on the toggle, so it spans the end of last season and the start of this one;
        a club needs 8 matches in the window and a place in the division this season to appear. Each table is sorted on expected
        points, the justice order. Pos is the club's rank on real points over the same window, not its league position. Gap is
        points minus expected points. Data covers the Premier League, La Liga, Bundesliga, Serie A and Ligue 1 and refreshes every
        Monday; expected points count penalties, as xG does.
      </P>
      <H2 id="meaning">What the table means</H2>
      <P>
        The name comes from the clubs in Christoph Biermann's Football Hackers, Midtjylland and Brentford among them, which
        judged themselves on expected points because the real table lies for long stretches. It still does.
        {prev && prev.clubs > 0 && (
          <> In {data?.previous_label}, the average club finished {prev.mean_abs_places.toFixed(1)} places from its expected-points position, {prev.within_two} of {prev.clubs} finished within two places of it, and the largest points gap was {prev.max_gap_club} at {sgn(prev.max_gap)}.</>
        )}
        {' '}Read a large positive gap as results running ahead of the play, and a large negative one as the reverse. Whether the
        market has priced that in is a separate question; the closing prices for every match are in <Link to="/closing-lines" className={a}>Closing Lines</Link>.
      </P>

      <H2 id="faq">Questions</H2>
      <H3>What is a justice table?</H3>
      <P>A league table sorted on expected points instead of points. It shows where each club would sit if its results matched the quality of the chances it created and allowed, with its real position alongside.</P>
      <H3>What are expected points (xPts)?</H3>
      <P>The points a club was likely to take from a match given the xG of both sides: the win, draw and loss probabilities scored 3, 1 and 0 and added up. Over a season they show what the play was worth, separate from what the results delivered.</P>
      <H3>Which teams are overachieving their expected points right now?</H3>
      <P>As of matches to {asOf}, the clubs furthest above their expected points over the last {months} months across the top five leagues are {names(over)}. Their results have run ahead of their play.</P>
      <H3>Which teams are underachieving their expected points?</H3>
      <P>As of matches to {asOf}, the clubs furthest below their expected points over the last {months} months are {names(under)}. Their play has been worth more than their results.</P>
      <H3>Why a rolling 12 months rather than the league table?</H3>
      <P>Five or six matches into a season the gaps are mostly noise. Twelve months of league matches, about 34 to 38 per club, is enough for expected points to mean something, and the window moves on every week. A 6-month view is on the toggle.</P>
      <H3>How often is the justice table updated?</H3>
      <P>Every Monday at 03:30 UTC from Understat, covering the current and previous season so the 12-month window is always complete.</P>

      <H2>More on SteamWatch</H2>
      <ul className="list-disc pl-5 text-slate-300 text-sm space-y-1">
        <li><Link to="/goals-coming-soon" className={a}>Goals Coming Soon: teams underperforming and overperforming their xG</Link></li>
        <li><Link to="/tools/rolling-xg" className={a}>Rolling xG: each club's last 5 and 10 matches</Link></li>
        <li><Link to="/closing-lines" className={a}>Closing Lines: the Pinnacle close for every finished match</Link></li>
        <li><Link to="/team-pnl" className={a}>Team P/L: what backing each club at closing prices returned</Link></li>
      </ul>
    </div>
  );
}
