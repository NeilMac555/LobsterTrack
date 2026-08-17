# TODO

Lightweight kanban maintained by Claude Code. Read at the start of every
session; update before finishing (move cards, add new ones, trim Done).

## Now

- Team P/L 26/27 data: BLOCKED UPSTREAM as of 2026-08-17 —
  football-data.co.uk's 2627 folder has no top-5-league files yet
  (I1/D1/F1/E1 are HTTP 300) and E0/SP1 contain the WRONG competition
  (National League and Portuguese Liga rows — mislabeled uploads).
  Our side is ready: importer has a Div guard (bcd7191), promoted-club
  names are mapped, Monday 09:00 UTC cron pulls 2627. Check after
  deploy that rows appear once football-data publishes real files; if
  the Monday summary still shows div-mismatch errors, their upload is
  still broken.

- Top-scorer forecasting (EPL first) — NEW player-level model, biggest
  feature since v1. Data chain VALIDATED end-to-end 2026-08-05:
  * Rates: Understat getLeagueData `players` key (same endpoint xg_
    refresher uses, different key) gives per-player minutes/goals/npg/
    npxG/position — 537 EPL players, Haaland tops npxG/90 at 0.78, board
    is credible. Use LAST completed season (2025/26) as the rate; the
    current season endpoint (2026) is empty at season start.
  * Roster truth: Transfermarkt squad pages reachable via HTTP with a
    browser UA (no browser automation needed) — 20 EPL club verein-ids
    scraped from the league page, 36 players/club with stable TM ids.
    This is the spine that catches summer transfers Understat still
    mis-attributes (it tags players by last season's club, comma-joins
    mid-season movers like "Bournemouth,Manchester City").
  * NOTE: pull 2026/27 squads (saison_id/2026) not 2025/26 — promoted
    set differs (Coventry/Hull/etc. per the Polymarket outright list).
  Build plan: (1) player_stats + squad_membership models + snapshot
    (Understat player fetch, all 5 leagues; TM squad fetch); (2) player-
    name crosswalk (accent-folded, TM id as spine — nastier than teams:
    accents, initials, single-name players like "Gabriel", dup names) +
    a freshness gate (never forecast a player not on a current squad);
    (3) projection = npxG/90 × projected minutes × team-goals scaling
    (from our strength fit) + penalties to the designated taker; Monte
    Carlo top-scorer distribution reusing the season sim's team goals;
    (4) parser `top_scorer` shape, engine path, registry source node,
    frontend. Market comparison (Polymarket golden-boot / Ballon d'Or)
    optional + patchy; Oddschecker still rejected (no API, ToS).
    Hard parts: the crosswalk, expected-minutes model, and refreshing
    squads hard around both transfer windows.


- Forecast engine: SEVER-then-refit rho and drawInflation on our own
  window — external review flags a likely double-correction (negative
  rho already boosts the draw-adjacent cells; multiplying the diagonal
  by 1.08 on top is the same fix applied twice, and rho is probably
  small BECAUSE the inflation is doing its job for it). Reviewer
  guidance: drop DRAW_INFLATION first, refit rho alone (expect larger
  |rho| than -0.03), harness gates held.
- Forecast engine: JOINT out-of-sample grid over (HALF_LIFE_DAYS,
  K_SHRINK) through the harness — coarse 4x4 first, plus a coarse
  third axis over the promoted-team priors (three pairs around the
  asserted 0.85/1.15), or at minimum a published sensitivity line for
  relegation probabilities across plausible prior values. Rationale:
  relegation odds — the most product-visible, most-argued output —
  sit at the intersection of the two least-validated parameters,
  coupled (K sets how much relegation probability promoted sides shed
  onto weak incumbents, and the promoted strengths themselves are
  asserted priors). OBJECTIVE, pinned: out-of-sample log loss on
  match 1X2, walk-forward folds, selection by mean across folds — NOT
  outright calibration, which resolves too rarely to select on.
  Must be joint, not sequential: the ablation measured a -0.054
  interaction term (decay slashes effective counts so shrinkage bites
  harder), so tuning half-life first and K second inherits the
  first's bias. Caption for the observed profile asymmetry (MC/ARS
  cell): shrinkage compresses ALL strengths toward 1.0 symmetrically;
  the asymmetric cost between attack-led and defence-led profiles
  lives in the Poisson map's nonlinearity — the win-probability
  response to a lambda shift differs between suppressing opponent
  goals and adding your own (measured via per-fixture xPts deltas).
  N_DRAWS=500 Dirichlet draws is the remaining provisional constant
  (cheap to raise post-vectorisation).
- Forecast engine: opponent-adjusted npxG form — the last-6 window is
  schedule-blind (six easy fixtures mark a team up). Needs an
  xg_data<->historical_matches join to identify each match's opponent
  (xg_data has no opponent column): match on (league, team, match_date),
  then divide each match npxG by opponent fitted defence. Verify the
  date alignment against real Understat rows before trusting it.
- Forecast engine: cache the strength fit per league (~1h TTL, keyed
  on league + latest historical row) — fit + bootstrap is ~0.9s and
  the draw-aware sim ~5.7s; the fit is question-independent so repeat
  forecasts on the same league shouldn't repay it. Also vectorise
  _fit_core with numpy if the request path needs to get back under 2s.
- Team name normalizer gaps: Bielefeld, Greuther Fürth, Holstein Kiel,
  Ajaccio unmapped (flagged during backfill).

## Next

- Wage-informed promoted-team priors (the actual model integration):
  the `wages` source now DISPLAYS wage bills but does NOT feed the
  model — probabilities are unchanged. The real win is replacing the
  asserted 0.85/1.15 promoted priors with a fit of strength on
  log(wage or value share of league), which also turns the reviewer's
  promoted-prior grid axis into a data-driven one. BLOCKER: club
  wages are PL-only and lag ~1 season, and a promoted club has no PL
  wage bill the year we need it — so wages can't set a promoted
  prior. Use Transfermarkt SQUAD VALUES instead (all 5 leagues,
  exist pre-season for promoted clubs, correlate with finish as
  strongly as wages). Wage bills stay as established-club context/
  display. Do this inside the joint grid (it's the third axis).
- Championship on Team P/L: the league is live for odds/steam
  (db4103f) but has no historical results — needs E1 added to
  LEAGUE_FILE_CODES, a 24-club Championship map in
  team_name_normalizer.NAME_MAP_BY_LEAGUE, and a Team P/L
  LEAGUE_OPTIONS entry. Neil flagged 26/27 Championship games are
  already being played, so data exists on football-data.co.uk now.
- Cross-league wage/value data if we ever want wages beyond the PL:
  Transfermarkt squad values (free-ish, 5 leagues) or a licensed
  SportMonks/Capology feed. valuball only covers ENG (Companies
  House is England-only).

- Outrights follow-ups: (1) Polymarket top-4 / relegation books
  usually appear mid-season — add slugs to OUTRIGHT_EVENTS when
  listed (schema already carries the `market` discriminator);
  (2) full order-book depth via the CLOB API (current capture is
  bestBid/bestAsk/spread from Gamma — enough for divergence display,
  NOT enough for the walk-the-book executable-price P/L the scoring
  spec requires on thin venues); (3) Betfair Exchange API-NG as a
  second outright venue; (4) outright_captures growth is ~120
  rows/day (~600KB) — add a TTL sweep if it ever matters; (5) new
  season = update OUTRIGHT_EVENTS slugs by hand (timestamped, not
  derivable) and check _PM_ALIASES promoted-club guesses against
  the canonical names the normalizer adopts for 27/28.
- Forecast engine: scoring pass over the forecasts ledger — revised
  per external review, three arenas with different scoreboards:
  (1) liquid markets: LOG-LOSS skill delta vs de-vigged Pinnacle
  close with CIs, per segment (not raw Brier — conflates skill with
  slate difficulty); (2) thin venues: realised paper P/L at
  executable prices; (3) unpriced questions: calibration curves on
  resolution. Headline statistic: out-of-sample alpha in
  alpha*model + (1-alpha)*close — alpha reliably > 0 means the model
  predicts closing-line error. Independent engine stays the
  published/scored ledger; any anchored blend that drives
  market-facing output publishes its alpha.
  Mechanics locked after review two: (a) de-vig method must be NAMED
  and VERSIONED in the spec — current engine code is proportional
  (1/odds normalised); evaluate Shin/power, which diverge on
  longshots; (b) "closing line" = last pre-KO snapshot at 15-min
  Odds API cadence — a stale close is easier to beat and the bias
  runs in our favour, so the ledger DISCLOSES the capture rule;
  (c) skill-score CIs bootstrap by MATCHDAY CLUSTER, not per
  forecast (same-slate forecasts aren't independent); (d) alpha:
  blend in log-odds space, walk-forward OOS max-likelihood, pooled
  first, per-segment via hierarchical shrinkage only past ~150
  resolved per segment, publish pooled from ~150-200 resolved with
  a provisional label; (e) thin-venue P&L: content-addressed raw
  CLOB snapshots (hash in ledger entry, snapshots published),
  fills computed by walking resting depth, taker fees included,
  stated adverse-selection haircut — reproducibility over prose;
  (f) outright interim credibility = inheritance from match-level
  calibration (same probability field), convergence-vs-market plots
  are DIAGNOSTICS ONLY, never a scoreboard.
- Duplicate match rows from fixture reschedules: DB sweep found ~20
  pairs of matches (same two teams, commence_time <48h apart) across
  Ligue 1, Serie A, La Liga and Bundesliga — early-season fixtures
  getting a provisional kickoff slot swapped for a confirmed TV slot,
  which makes The Odds API issue a new event ID while the old one
  lingers in the feed. Only 2 of these (both Bundesliga) have actually
  broken so far (see Done entry below), but all ~20 pairs mean the
  same real-world fixture shows as two separate cards on league pages
  today. Needs a real dedup pass (pick canonical ID, likely by which
  one keeps getting fresh Pinnacle data, and hide/merge the other) —
  bigger than a quick patch, wasn't in scope for the Betfair-fallback
  bug fix.

## Later

- Forecast engine: LLM question parser in front of the closed grammar
  (ParsedQuestion is the seam — engine untouched). Also injury-news
  ingestion as a registered source to drive the absence adjustment.
- Forecast engine: La Liga head-to-head tie-break is approximated by
  goal difference in the season simulator; Bundesliga/Ligue 1
  relegation playoff counted as survival. Revisit if forecasts get
  quoted seriously.
- Re-fit rho/drawInflation in xG mode once 2026/27 accumulates enough
  matches (fallback fit was rejected — see fit-v1.md).
- CL/UEL restoration: needs Elo-based cross-league strengths +
  competition-specific constants. Blocked until then.
- qualityWeight/spDiscount: fit or delete once shots/SP historical
  data exists (currently unfittable).

## Done

(newest first)

- BOM fix for the Div guard (found by verifying the guard LIVE after
  deploy, not just locally): football-data CSVs open with a UTF-8 BOM,
  so plain utf-8 decoding hid the Div header and the guard never fired
  — only the unmapped-team net was rejecting the mislabeled rows,
  which wouldn't save us once team names overlap (Championship data
  under E0 would import as EPL). Now decodes utf-8-sig; verified live:
  E0 12/12 and SP1 9/9 wrong-division rows rejected with loud errors —
  `15e8652`
- Team P/L readied for 26/27 data: all promoted clubs added to the
  name normalizer (football-data keys verified vs E1/SP2/D2/F2 25/26,
  canonicals vs the live Odds API feed; Schalke canonical is now
  "FC Schalke 04"), importer got a Div-column guard after
  football-data's 2627 folder was found serving National League data
  as E0.csv and Portuguese Liga as SP1.csv (guard tested against the
  real mislabeled files: 21/21 rows skipped), Polymarket promoted-club
  aliases corrected to verified canonicals — `bcd7191`
- Season switchover to 2026/27: Team P/L lock, importer DEFAULT_SEASONS,
  weekly refresh job, Understat season (2026), plus a "no 26/27 matches
  yet" empty state on Team P/L. Outrights/forecast engine were already
  on 26/27. New-season rows land via the Monday 09:00 UTC import or the
  admin import endpoint — `c63859e`
- INCIDENT 2026-08-15 evening: site-wide outage (~75 min), resolved
  (e4d7036, 3cbf962, 80dc6b1), then Power Rankings hidden per Neil
  (0db9f0c). Root cause — NOT the ratings code, despite the outage
  starting right after a ratings deploy: main.py's startup block ran a
  no-op "ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS" on every
  boot, which needs an ACCESS EXCLUSIVE lock just to evaluate the IF
  NOT EXISTS. A separate, pre-existing connection leak (sessions left
  "idle in transaction" holding read locks on odds_snapshots — still
  unfixed, tracked below) collided with it: the deploy's ALTER queued
  behind the leaked locks, and because Postgres queues every NEW query
  behind a waiting exclusive lock, the whole site's odds_snapshots
  queries froze — active container included. Every retry re-armed the
  trap (each failed deploy's container also left an eternal queued
  ALTER as a zombie), which is why reverting the ratings commit
  changed nothing — confirmed empirically mid-incident. Same failure
  shape as the 2026-06-30 in_play-backfill incident; that fix removed
  the slow backfill but left the ALTER on the blocking path.
  Fixes shipped: (1) every startup ALTER/CREATE INDEX now runs with
  SET LOCAL lock_timeout='5s' so it aborts cleanly instead of
  poisoning the lock queue; (2) the migration block runs in a real
  thread (asyncio.to_thread), never on the event loop — the first
  emergency fix used create_task with sync DB calls, which still
  blocked the healthcheck and taught us the difference; (3) DB pool
  widened (10/20) with pool_timeout=10 so exhaustion fails visibly.
  Diagnosis trail: pg_stat_activity lock-chain queries + the Railway
  dashboard's per-phase deploy view (CLI logs were silent because
  INFO-level records had no handler until startup completed).
  Follow-ups open: fix the idle-in-transaction leak (root cause,
  likely sessions held across awaited network I/O e.g.
  syndicate_alerter's Telegram/Twitter calls); DATABASE_URL currently
  points at the public proxy from mid-incident debugging — switch
  back to the internal hostname (postgres-qqax.railway.internal) in a
  calm moment, it was ruled out as a cause and internal is free/faster.

- Power Rankings hidden + weekly job paused (0db9f0c, 2026-08-15):
  per Neil after the outage above. /power-rankings redirects home,
  nav entries removed (desktop + mobile), the Monday 10:30 UTC
  refresh job is commented out in scheduler.py (admin diagnostics
  label it PAUSED). Everything else remains intact — fitter, admin
  trigger, API routes, tables, history. To restore: uncomment the
  scheduler add_job block, restore the App.tsx import + route and
  the two Layout.tsx nav entries. NOTE: the domestic-outright blend
  (Arsenal-above-Juventus fix) was reverted during firefighting and
  is preserved at bf7325c — re-apply when the feature comes back.

- Power Rankings: fix two compression bugs flattening every rating
  toward the mean (7d41a4a, 2026-08-15) — second external quant work
  order, verified against production data AND a from-scratch synthetic
  reproduction (prove_compression.py) before any code changed; every
  line number and diagnostic in the work order matched the live file
  exactly. Bug 1: WITHIN_LEAGUE_RIDGE_LAMBDA was 15.0 against Stage 1's
  actual sample (~9.8 weighted matches/team in the EPL) — ridge
  shrinkage scales ~n/(n+λ), so a perfect noiseless synthetic signal
  came back at only ~34% of its true spread. Split into
  WITHIN_LEAGUE_RIDGE_LAMBDA=2.0 (fixed) and
  CROSS_LEAGUE_RIDGE_LAMBDA=15.0 (Stage 2, left alone — not part of
  this diagnosis). Bug 2: all three team-level priors (ClubElo, squad
  value, UCL outright) were put on scale via np.polyfit(prior,
  our_ratings) then blended toward the fitted values — OLS fitted
  values have variance r²·Var(y), so this can only ever compress a
  rating's spread, at any blend weight, arithmetically incapable of
  ever widening it. Replaced with _scale_prior_to_target: a z-score
  rescale onto a target mean/SD instead of a regression against our
  own (possibly too flat) ratings; target is an interim stand-in read
  from the current ratings' own spread each time (properly-estimated
  target needs inverting each league's outright market via a season
  simulator this codebase doesn't have yet — flagged, not built).
  Verified locally before shipping, then live: PSG moved to 1st (was
  4th two sessions ago), Bayern 2nd, Barcelona 3rd, Arsenal 6th —
  matching the market pricing the work order cited — and overall
  rating spread nearly doubled (SD 0.18 → 0.36). Bug 3 (five domestic
  outright books already fetched hourly but never read by the fitter,
  plus a dead-book guard for when markets resolve) is documented in
  the module docstring but not implemented this pass.

- Power Rankings: mean-center ClubElo + squad value within league
  before blending (acbee12, 2026-08-15) — fix for a real bug an
  external quant review caught and fully verified against production:
  blending either signal in uncentered doesn't just reorder teams
  within a league, it drags the whole league's ratings toward that
  signal's own cross-league level (mean EPL squad value ~€689m vs
  ~€340m in Serie A). Confirmed before the fix: corr(log squad value,
  rating) = 0.965, EPL's Stage 2 offset (+0.210) was ~3x the combined
  spread of the other four leagues, every one of 31 teams missing a
  squad-value figure ranked 50th+. Root cause: domestic covariate data
  (ClubElo, squad value, and domestic AH lines/outrights) mathematically
  CANNOT identify a league's overall level — adding a constant to every
  team in a league leaves every within-league match probability
  unchanged — so any code path where it moves the league-level offset
  is a bug by construction (see the module's new IDENTIFICATION
  PRINCIPLE docstring section). Fix: ClubElo/squad value are now
  centered within league (_center_within_league, unit-tested against
  synthetic data) and blended into Stage 1's own mean-zero-within-league
  output BEFORE the Stage 2 offset (informed only by European bridge
  fixtures + the UEFA coefficient) is added back on. Verified: the
  spec's own flagship example, Bournemouth vs Napoli, went from
  Bournemouth clearly above to essentially tied. Honestly flagged
  in-commit: the aggregate within-league correlation barely moved
  (0.965 -> 0.957 overall) since a lot of that correlation is a
  legitimate within-league relationship, not the bug — properly fixing
  how HEAVILY a thin-sample league leans on money before real
  performance data accumulates needs estimated (not hand-picked) blend
  weights from a cross-validated backtest, which is a separate,
  larger follow-up (season simulator + outright-market ingestion +
  Shin's-method devig + validation harness — full spec on file,
  build order followed sequentially from here).

- Power Rankings UEFA country coefficient blend (70a653e, 2026-08-15):
  follow-up to a "for another day" idea floated during the UCL-blend
  discussion — triangulate Stage 2's cross-league bridge against UEFA's
  own published country coefficient, since that bridge is by far the
  thinnest-sample part of the whole fit (a few dozen European fixtures
  split across 5 leagues, vs. dozens of AH-line matches per team within
  a league). Unlike the four team-level blends, this nudges Stage 2's
  per-LEAGUE offsets directly, faded in/out via each league's own
  weighted bridge-fixture involvement (LEAGUE_COEFF_PRIOR_K=10.0).
  Sourcing: ruled out two scrapeable mirrors first — kassiesa.net's
  robots.txt explicitly disallows bots ("Disallow: /"), uefa.com blocks
  automated fetches outright (403 via Cloudflare) — landed on
  Wikipedia's "UEFA country coefficient" article (CC-BY-SA, robots.txt-
  permitted); hardcoded the 5 current values rather than build a
  fetcher, since they're static enough within a season to refresh by
  hand. Scale conversion matches mean/stddev rather than OLS (only 5
  leagues — a 2-parameter least-squares fit would overfit to noise).
  Verified locally against production data before shipping, then
  confirmed live: all 5 leagues blended, 0 errors. Effect is subtle,
  not a top-table reshuffle — Serie A's offset firmed up the most (its
  bridge sample was thinnest, Italy has the 2nd-highest coefficient),
  France eased down slightly (lowest coefficient of the 5).

- Power Rankings UCL outright-winner blend (6a247d9, 2026-08-15): a
  FOURTH fading prior, added after user pushback on PSG sitting 4th
  despite being back-to-back UCL winners and market favourites. Rather
  than tuning existing weights to force them up, wired in a genuinely
  new independent signal: Polymarket's live "UEFA Champions League:
  2027 Champion" market ($7.8M+ real volume), extending
  outright_fetcher.py (The Odds API has no outright market for this
  competition at all — checked its /v4/sports listing — so Polymarket
  is the only ToS-clean source, same as the domestic-league outrights
  already used elsewhere). Needed a merged all-five-domestic-leagues
  name index since the UCL field spans every UEFA nation; 21/29 team
  labels resolve to a tracked team, the rest (Porto, Sporting, PSV,
  etc.) are genuinely outside our tracked leagues. Given a DECENT
  weight per explicit request (UCL_WINNER_PRIOR_K=20.0, matching
  ClubElo rather than the lighter squad-value weight) since it's a real
  forward-looking market forecast, not a valuation proxy. Probabilities
  fit on the logit scale (heavily skewed 0-1 signal). Verified locally
  against production data before shipping, then confirmed live: 21/21
  matched teams blended, 0 errors. Result is genuinely market-driven —
  PSG moved from 4th to 2nd (Polymarket has them co-favourites at
  14.5%, tied with Barcelona), Arsenal still holds 1st.

- Power Rankings squad value now blended into the rating (6dad86c,
  2026-08-15) — supersedes the "informational only, not blended" design
  from the entry directly below, at explicit user request ("there is a
  correllation between squad value and success"). Added as a THIRD
  fading prior after the ClubElo blend (SQUAD_VALUE_PRIOR_K=8.0, lower
  than CLUBELO_PRIOR_K=20.0, since it's a valuation metric rather than
  an observed-performance one). Market value spans ~3 orders of
  magnitude, so the scale conversion fits against ln(value) rather than
  the raw figure so a handful of superclubs don't dominate the OLS fit.
  Only applies to the 67/98 tracked teams with a value on file. Caught
  and fixed a real bug during local verification: np.log(value)
  promotes the blended rating to np.float64, which psycopg2 can't adapt
  for the insert — wrapped in float(). Verified locally against
  production data, then confirmed live: 67/67 matched teams blended,
  0 errors. Result is an honest shift, not a forced one — Man City,
  PSG, Real Madrid and Chelsea all moved up (consistent with their
  squad values), but Arsenal held #1 and PSG did NOT become #1, since
  nothing was tuned toward any particular ordering.

- Power Rankings squad market value column (05f5607 + fb480f8,
  2026-08-15): a "Squad Value" column shown alongside the rating table,
  sourced from Transfermarkt (no public API, terms prohibit scraping —
  so entered by hand from a table paste via
  scripts/refresh_squad_values.py + the committed
  app/data/transfermarkt_squad_values.json snapshot, reloaded via
  POST /admin/load-squad-values; same pattern as the existing
  club_finance.py/valuball wage-bill snapshot). Deliberately kept
  informational-only and NOT blended into the rating: squad value is a
  spending/valuation metric (transfer fees, wages), not a performance
  signal the way the ClubElo prior below is — a team can carry a huge
  squad while underperforming, so folding it into `rating` would
  measure something other than what the page claims to. Name matching
  (transfermarkt_name_map.py) covers 67/98 tracked teams against a
  top-100-by-value snapshot; the other 31 simply fall outside that top
  100. EuroClubIndex was also considered as a second blend candidate
  earlier and remains parked (no API, no visible ToS) pending explicit
  risk-acceptance.

- Power Rankings ClubElo blend (e378250, 2026-08-15): after the
  two-stage Pinnacle-AH fit below, each team's rating is nudged toward
  a ClubElo-derived prior (api.clubelo.com — genuine free, no-key CSV
  API, verified live before building against it; no visible ToS page
  found, flagged but user approved proceeding). Blend weight fades as
  weighted_matches grows (CLUBELO_PRIOR_K / (CLUBELO_PRIOR_K +
  weighted_matches)), same shrinkage-toward-prior shape as
  K_SHRINK/PROMOTED_ATTACK — steadies thin early-season samples without
  overriding a well-established market-derived rating. ClubElo's Elo
  scale (~1000-2100) is converted onto ours via an OLS fit against our
  own already-computed ratings for the overlapping team set
  (_fit_clubelo_scale), not an assumed formula. Name mapping
  (clubelo_name_map.py) covers 45/98 tracked teams whose naming
  differs from ours; 3 teams (Girona, Mallorca, Oviedo) are confirmed
  absent from ClubElo entirely and are simply left unblended. Verified
  locally against production data before shipping, then confirmed live
  in prod after deploy: 95/98 teams matched and blended, 0 errors.
  Deliberately not tuned toward any particular ordering — PSG stayed
  4th (behind Arsenal/Bayern/Man City) both before and after the
  blend. EuroClubIndex was considered as a second blend source but has
  no API (HTML table only) and no visible ToS — same risk category as
  the previously-rejected Oddschecker — parked pending explicit
  risk-acceptance.

- Power Rankings (new /power-rankings page): cross-league team power
  ratings derived in-house from Pinnacle Asian Handicap closing lines
  (closing_lines, market_type=ASIAN_HANDICAP — already captured for
  every finished match by the existing closing_line_capturer.py job,
  zero new data collection needed). Two-stage ridge-regularised
  weighted least squares: Stage 1 fits each domestic league
  independently (paired-comparison regression over closing AH lines,
  Colley/Massey-style — closed-form, matches strength_model.py's
  numerical style rather than an order-dependent sequential Elo
  update); Stage 2 bridges the 5 league blocks onto ONE shared scale
  using Champions League/Europa League/Conference League fixtures as
  cross-league observations. This is the "Elo-based cross-league
  strengths" TODO.md has flagged for years as blocking CL/UEL
  restoration — nothing in the codebase put two teams from different
  leagues on a comparable scale before this. New power_ratings +
  power_rating_history tables, weekly Monday 10:30 UTC job (mirrors
  league_constants_refresher.py's exact pattern), admin trigger,
  GET /power-rankings + /power-rankings/{team}/history. Verified
  locally against production data before deploying (98 teams, 66
  bridge fixtures, 0 errors) — output is well-calibrated: Man City/
  Bayern/Arsenal/PSG/Barcelona at the top, freshly-promoted/
  relegation-threatened sides (Pisa, Cremonese, Metz, Oviedo) at the
  bottom, Bayern correctly slotting between City and Arsenal
  cross-league. One deploy hiccup: local `tsc --noEmit` missed a
  recharts Tooltip typing error that the real `npm run build` (tsc -b)
  caught — fixed, and switched to running the actual build script for
  verification going forward, not a hand-assembled tsc+vite check.
  Deliberately NOT wired into strength_model.py, season_simulator.py,
  or Match Predictor — ships as an independent feature; the other half
  of "CL/UEL restoration" (competition-specific avgGoalsPerTeam/
  homeAwayRatio constants) needs a NEW results-collection job and is a
  separate, deferred follow-up — `c77cd1f`, `56ba3c7`
- Syndicate alerts restricted to 1X2 market only — check_and_alert()
  no longer calls _check_totals_market/_check_spreads_market (left
  in place, just unused, in case they're wanted back). Telegram +
  tweet posting share one choke point so this disables both for
  Totals/Spreads at once. /admin/alert-diagnostics still shows
  Totals/Spreads move data for visibility but would_alert is now
  hardcoded false for those two rather than computing a value that
  no longer matches reality — `20f3a31`
- Wired up EFL Championship (soccer_efl_champ) + widened syndicate
  alert window from 3h to 12h pre-kickoff, both ahead of the domestic
  season restarting. Championship probed clean (11/11 events full
  Pinnacle coverage) before adding to backend leagues dict + frontend
  LEAGUE_CONFIG — nav/pickers all pull from VISIBLE_LEAGUES so no
  other wiring needed; reuses the England flag asset already used for
  EPL. SYNDICATE_ALERT_WINDOW_MINUTES: 180 -> 720; also fixed
  /admin/alert-diagnostics, which had its own separate hardcoded "3
  hours" + 3.0pp literals instead of importing the real constants —
  now imports SYNDICATE_ALERT_WINDOW_MINUTES/SYNDICATE_THRESHOLD_
  PROB_POINTS directly. Verified live: 11 leagues now fetch cleanly
  (was 10), Championship matches tracking on Pinnacle, diagnostics
  window boundary confirmed exact (12h cutoff sits 46min before the
  earliest Championship kickoff right now) — `db4103f`
- Club wage-bill source (`wages`) + top-scorer parser fix. Snapshotted
  valuball.co's club_season_financial_summary (ENG1) — figures derive
  from Companies House filings — into a committed JSON (660 PL rows,
  1993–FY24/25, £m) loaded into a new club_finances table on boot; NOT
  a live dependency on their backend (durable static snapshot,
  regenerate via scripts/refresh_valuball_finances.py). PL only:
  Companies House is England-only, valuball has ~0 rows for the other
  four leagues. New `wages` registry source (9th swarm node) surfaces
  the latest filed wage bills ranked for the current field, with a
  neutral rationale paragraph (top spenders + a model-vs-spend
  divergence line, gated OFF for relegation where the direction
  inverts) — explicitly context, NOT a model input (probabilities
  unchanged; the strength fit still reads results, not payroll).
  Promoted clubs with no PL filing shown as honestly missing.
  Admin: POST /admin/load-club-finances, GET
  /admin/club-finances-health. Separately: player-market questions
  (top scorer / golden boot / assists / Ballon d'Or) now return a
  specific "no player-level data" refusal instead of the generic
  outside-the-grammar fall-through Neil hit. Verified end-to-end.
- Polymarket season-outright source: hourly Gamma fetch of the five
  whitelisted "2027 Champion" events ($4.4M on EPL alone) into new
  outright_snapshots + content-addressed outright_captures (sha256 of
  the canonicalized price payload, deduped across fetches). Team
  labels resolve through the normalizer's names + a de-accenting
  alias layer — all 96 live club labels across the 5 leagues resolve,
  promoted-club guesses are harmless-if-wrong (non-joining), raw
  label always kept. Folded into the existing 'polymarket' registry
  source (swarm stays 8 nodes): league-winner forecasts now attach
  proportionally de-vigged market prices per club, a neutral
  divergence rationale paragraph (largest model-market gaps, no
  directional calls), and a staleness warning past 26h; top-4/
  relegation stay honestly market-free. Admin: /admin/outrights-health
  + POST /admin/fetch-outrights; scheduler hourly + 90s-after-boot
  one-shot. Verified with a LIVE Gamma fetch end-to-end.
- Forecast Engine v1 (/tools/forecast): FutureSearch-style question box
  over the Top 5 leagues built on a closed source registry (own-DB
  tables + Poisson strength fit + 10k-season Dixon-Coles Monte Carlo) —
  no open web search, no LLM. Rules-based question grammar (winner /
  top 4 / relegation / team outcome / A vs B), forecasts persisted to a
  new `forecasts` ledger table, research-swarm UI that replays the
  recorded stage timeline as the audit trail. Match questions compare
  model vs de-vigged Pinnacle; league questions state that no outright
  market source is registered yet. Verified end-to-end on seeded data
  (distributions sum correctly, ~0.4s/run) + Playwright screenshots of
  all three flows — `8af47da`
- Biggest Movers now measures movement over the trailing 48h instead
  of all-time since first-tracked: previously compared current odds
  to the very first snapshot ever recorded (often a month before
  kickoff for top-5-league fixtures), so a match could sit at the top
  showing the same stale figure for weeks. Baseline is now the
  snapshot closest to 48h ago (1X2 + Totals markets), falling back to
  the true opening snapshot for matches tracked <48h so new additions
  still show something. Frontend: "Open" column renamed "48h Ago",
  subtitle now reads "Sharp money signals · Last 48h". Verified live
  — leaderboard composition changed as expected (old EPL/Serie A
  entries with month-old moves replaced by matches with genuine
  recent 48h swings) — `20bea64`
- Bet Calculator compact redesign: user feedback ("too much dead
  space, looks vanilla"). Selections list was the worst offender —
  each selection was a full bordered card with per-field labels
  repeated on every row; at 15 selections that ran well past 1500px
  of scrolling. Replaced with a single divided list, one shared
  column header, one line per selection, and a colored left border
  per row (emerald/red/amber for Won/Lost/Void) instead of extra
  text. Also tightened settings/stake/results padding, switched to
  mono uppercase micro-labels matching the rest of the site, and
  added a gradient hero background + pulsing "live" dot + ticket
  emoji for visual consistency with MatchDetailPage. Verified live:
  15-selection layout now fits in ~965px, all bet types/odds
  formats/outcomes still calculate correctly — `3be73ac`
- Bet Calculator: added inline +/- selection controls so Accumulator
  can visibly grow past its default 4 (user report: "should be able
  to add up to 15 selections") — the math already supported up to 20,
  but nothing near the Selections list hinted at it. Also fixed a real
  bug caught while testing: rapid +/- clicks collapsed into a single
  +1/-1 because the handler read numSelections from a stale render
  closure; moved the resize/bet-type-revalidation into one useEffect
  keyed on numSelections and made the buttons use functional
  setState, so every click counts regardless of click speed. Verified
  live: +11 clicks from 4 correctly lands on 15/20 with 32768.00
  combined odds — `6edb0ac`
- Bet Calculator fix: Bet Type dropdown was only ever showing the one
  combined type that matched the CURRENT selection count, so at the
  default (2 selections) Treble and Accumulator were invisible — user
  report: "there's only a singles and double option". Flipped the
  direction: all 4 types always shown; picking one now drives the
  selection count (Double->2, Treble->3, Accumulator->4+, growing
  further without resetting), and changing the count directly
  auto-picks the natural fit instead of falling back to Single.
  Labeled Accumulator as "Accumulator (Parlay)" for US readers.
  Verified live — `0c15088`
- Bet Calculator tool: new /tools/bet-calculator page (linked in nav),
  modeled on AceOdds' calculator minus each-way and Rule 4 (horse-
  racing concepts, not relevant to a football-only site). Bet type
  limited to Single/Double/Treble/Accumulator — gated by selection
  count (Double=exactly 2 legs, Treble=3, Accumulator=4+) rather than
  the full Trixie/Patent/Yankee coverage-bet family. Odds format
  toggle (fraction/decimal/US, decimal default) keeps all three
  representations in sync per selection as you type. Math lives in
  frontend/src/utils/betCalculator.ts as pure functions. Verified live:
  conversions correct (5/2=3.50=+250), Won/Lost/Void handling correct
  (Lost zeroes a combined bet, Void drops out without killing it),
  both stake modes correct, bet-type options correctly reset on
  selection-count change — `d09867e`
- Betfair fallback bug: two Bundesliga matches (Freiburg v Werder
  Bremen, Augsburg v Schalke) showed Betfair Exchange odds with a
  nonsensical draw price (1.02 / 1.09) instead of Pinnacle. Root
  cause: both fixtures got rescheduled by a day: The Odds API issued
  new event IDs for the confirmed slots, Pinnacle migrated to the new
  IDs, but the old IDs stayed in the feed with no Pinnacle and a
  thin/dead Betfair Exchange order book — not a real coverage gap
  like UCLQ, just a stale event ID. Fixed: the Betfair fallback now
  only applies to events that have *never* had a Pinnacle snapshot;
  if Pinnacle previously priced an event and stops, the fetcher skips
  storing a new snapshot instead (odds history freezes rather than
  filling with garbage). Manually deleted the 46 already-stored
  garbage betfair_ex_eu rows on the two affected matches. Verified
  live — both now show current_odds_bookmaker=pinnacle, frozen at
  their last real price — `082f78b`
- World Cup data purge: tournament's over, wiped every soccer_fifa_world_cup
  row from prod so Steam Results / Drifters "All leagues" win-rate, P/L
  and rankings aren't diluted by finished-tournament history. Deleted
  105 matches (cascaded to 760 steam_moves, 312 closing_lines, 238K
  odds_snapshots, 245K totals_snapshots, 245K spreads_snapshots) plus
  266K polymarket_snapshots, 116 posted_tweets, 42 syndicate_alerts
  (no DB cascade on those three — deleted explicitly first). User
  confirmed destructive delete (no backup) after being shown exact
  row counts. Verified live: /steam-results and /drifter-results no
  longer return any soccer_fifa_world_cup rows.
- Betfair Exchange fallback for 1x2 odds when Pinnacle is absent: UCLQ
  matches showed zero odds all the way to kickoff — confirmed The Odds
  API's feed never carries Pinnacle for this competition at all (0/14
  events, even minutes before KO) despite Pinnacle pricing them live
  on its own site (13-14 other bookmakers, incl. betfair_ex_eu, WERE
  present — a provider gap, not "not posted yet"). odds_fetcher now
  requests both bookmakers in one call (confirmed free — quota is
  regions×markets, not bookmaker count) and stores whichever is
  present, Pinnacle preferred. Late-steam detection, syndicate_alerter
  1X2 checks, and closing_line_capturer are all guarded to Pinnacle-
  only rows so the Betfair fallback can't corrupt the calibrated
  thresholds or mislabel a closing line. current_odds_bookmaker
  exposed via API, shown as a "Betfair Exchange" badge on match
  card/detail; Bet105's "same odds as Pinnacle" claim gated off for
  those matches. Verified live: all 14 UCLQ matches now carry real
  Betfair-sourced odds and history — `dcd78cf`
- Hid In-Play Jumps from nav (desktop + mobile) instead of generalizing
  it — was WC-only from inception (hardcoded league filter, no
  fallback for other leagues). Route/page untouched, still loads
  directly, just not linked. Verified live in prod — `7dcf2bd`
- Fixed dead-end pages from old WC bookmarks/links: Home/SteamResults/
  DriftersPage now redirect to unfiltered whenever the resolved league
  is `hidden` in LEAGUE_CONFIG (generalizes to any future league hide,
  not just WC); /tools/world-cup redirects to "/" — `0d1721c`
- World Cup over: reverted every WC-tournament-window default back to
  normal (DEFAULT_LEAGUE redirect hack removed from Home/SteamResults/
  Drifters, CL/UEL/UECL unhidden + WC hidden in LEAGUE_CONFIG, featured
  gold WC pill removed from nav, LiveTicker generalized back to all
  leagues). Deleted WorldCupHubPage + components/wc/. Verified live in
  prod — clean "/" with no redirect, Top 5 + UCL/UCLQ/UEL/UECL in the
  picker, no "World Cup" text anywhere, zero console errors — `0da9253`
- Local/UTC kickoff-time toggle: fixed a real bug along the way — every
  page parsed the backend's marker-less UTC timestamp strings as browser
  LOCAL time (wrong by the viewer's UTC offset for anyone outside the
  UK), including countdown timers. New frontend/src/utils/time.ts is the
  single parse/format/day-grouping choke point every page now goes
  through; TimePreferenceContext persists the choice. Verified against
  live prod data — every time shifts by exactly the UTC offset when
  toggled, zero console errors. Mobile-menu toggle placement verified by
  code review only (matches the working desktop toggle + existing
  Account section pattern) — automated click-through testing was
  blocked by a browser-automation tooling issue in this session (even
  an unrelated pre-existing button didn't respond to simulated clicks);
  worth a quick manual phone check next time the site's touched — `5f3c647`
- Fixed NameError in syndicate_alerter totals check (opening_line ->
  line) + isolated per-match failures so one bad match can't blank
  Telegram/tweet checking for the whole cycle — found during the France
  v Spain steam-alert post-mortem — `e6a1319`
- Live league constants job: avgGoalsPerTeam/homeAwayRatio computed
  weekly from historical_matches (weighted 4-season rolling window),
  league_constants + league_constants_history tables, weekly scheduler
  job (Mon 10:00 UTC) + admin trigger, GET /league-constants, predictor
  fetches on load with hardcoded fallback (all 5 leagues verified live
  in prod, zero console errors) — `2449bd5`
- Steps 2-3 diagnosis + fallback-only H2+H5 correction — xG (production)
  pipeline exonerated, no production change; backtest-only correction
  applied to SECONDARY run — `0f4bb1a`
- xg_data season migration — `2b6d6a5`
- calibration harness + baseline — `cca2810`
- fit-v1 (rejected, gates held) — `ee9835e`
- input form cull — `7c871ea`
- AH/Totals/BTTS/CS markets — `b902e63`
- home advantage symmetric split — `d4b0d48`
- CL/UEL hidden — `b902e63`
- report-hygiene rule — `b902e63`
