# Goals Coming Soon (/goals-coming-soon)

Built 30 September 2026. Teams underperforming and overperforming their
expected goals across Europe's top five leagues, over a rolling 12 months
(6 on the toggle). Free. Server-rendered per request, client page on top.

## Search intent the page targets

Primary: "teams underperforming xG", "xG underperformers", "teams
overperforming xG", "goals vs xG table", "unluckiest teams xG",
"xG regression candidates". Secondary, one section each: "Premier League
teams underperforming xG" and the La Liga, Bundesliga, Serie A and Ligue 1
equivalents. The brand name "Goals Coming Soon" is the H1 and the URL; the
search phrases carry the `<title>`, the H2s and the FAQ questions.

## Page structure (top to bottom)

1. H1 "Goals Coming Soon". Lead paragraph with the top three clubs and
   their gaps written out in prose (the sentence answer engines lift).
2. Meta line: window dates, clubs counted, data source, last refresh date.
3. Jump links to every section (anchors below).
4. `#underperforming` H2: top ten furthest below xG, all five leagues.
5. `#overperforming` H2: top ten furthest above xG, with a one-line
   prose summary of the top three.
6. `#premier-league`, `#la-liga`, `#bundesliga`, `#serie-a`, `#ligue-1`:
   H2 "{League} teams underperforming and overperforming xG", a prose
   line naming the top three each way, then two five-row tables (H3
   Below xG, H3 Above xG).
7. `#method` H2 How it is measured. `#meaning` H2 What the gap means.
8. `#faq` H2 Questions: six Q&As, two of which are generated from the
   live data (which teams are under/over right now, with names and gaps).
9. More on SteamWatch: Rolling xG, Team P/L, Match Predictor, Dropping Odds.

Table columns: #, Club, League (omitted inside league sections), P,
Goals, xG, Gap (goals minus xG), Per match, Def gap (conceded minus xGA).

## Head

- Title (55): `Teams Underperforming xG: Goals Coming Soon | SteamWatch`
- Description (149): `Teams underperforming their xG, and those running hot: goals against expected goals across Europe's top five leagues, last 12 months, updated weekly.`
- Canonical, OG and Twitter tags, one of each, marked `data-prerender`
  so the app's Helmet copies replace them cleanly.
- JSON-LD: `Dataset` (creator Person Neil Mac -> /about, publisher
  SteamWatch, temporalCoverage from the window, dateModified = latest
  match date, keywords, variableMeasured) and `FAQPage` with the six
  Q&As, answers identical to the visible text.

## Data

- Table `xg_team_results`: one row per club per league match, goals for
  and against, xG/xGA, npxG/npxGA, from Understat's league JSON
  (`understat_feed.fetch_league`), unique on (league, team_name,
  match_date). Model `app/models/xg_team_result.py`.
- Refresh: `services/xg_goals.refresh` fetches current and previous
  season for all five leagues and upserts. Scheduled Mondays 03:30 UTC
  (`scheduler.xg_goals_refresh_job`), after the rolling-xG refresh, which
  it does not touch. First fill done by hand on 30 Sep 2026 (4,004 rows).
- Query: `xg_goals.table(db, months)` returns every club in the division
  this season with 8+ matches in the window, sorted by gap ascending.
  Ten-minute in-process cache, cleared on refresh. Relegated clubs are
  excluded by requiring at least one match in the current season.
- Window: 365 or 182 days back from today, by match date.
- xG is total xG (penalties included) so it compares like with like with
  goals scored. Non-penalty figures are on Rolling xG.

## Endpoints

- `GET /api/xg-goals/table?months=12|6` — everything the page shows.
- `GET /api/xg-goals/undershooting?months=&limit=` — the first version.
- `GET /api/xg-goals/club?league=&team=` — one club by our (Odds API)
  team name, via `xg_goals.club_gap` (accent stripping, token
  normalisation, an alias map for Cologne, Gladbach, Mainz, Leipzig,
  Osasuna, Racing Santander and similar; unique-first-token fallback
  inside the same league). Returns `{"row": null}` when unsure.

## Rendering

- Backend: `services/goals_coming_soon_page.py` renders the document
  into `dist/_shell.html` (the shared nav/footer/CSS shell), ten-minute
  cache, `Cache-Control: public, max-age=600`. Served by the catch-all in
  `main.py` for the `server_rendered` route in `routes.json`.
- Frontend: `pages/GoalsComingSoonPage.tsx`, same copy and sections,
  fetches `/api/xg-goals/table`, adds the 12/6-month toggle.

## Internal links to the page

- Nav (prerendered and app Results dropdown), footer Data column,
  sitemap-pages.xml (server_rendered, lastmod = now), llms.txt.
- Rolling xG page: one line under the title, in both the app and the
  prerendered copy.
- Every match page in the top five leagues: one sentence per side when
  a club's 12-month gap is 3+ goals, e.g. "Crystal Palace have scored
  18.7 goals fewer than their expected goals over the last 12 months
  (37 league matches). See Goals Coming Soon." Server-rendered in
  `match_page._xg_note`, mirrored in the app by `XgGapNote.tsx`.

## Editorial rules

Plain and factual, no marketing adjectives, no "not X but Y" lines, no
em dashes. Nothing on the page is a prediction: the regression claim is
stated with its evidence (last season, first five matches versus the
remaining 33, near-zero relationship) and the page tells the reader to
check the price.

## Follow-ups (not built)

- Blog post: "Do teams that underperform xG catch up? A season of data",
  with the correlation figures per league, linking here. Gives the
  citable claim a permanent home with a date on it.
- Weekly post on X and Sharp Side Soccer with the top three each way and
  a link, so the URL earns a fresh inbound link every week.
- Per-club history: a small chart of cumulative goals minus xG over the
  window for each club (data is already in the table).
- Sitemap lastmod from the last refresh rather than the request time.
