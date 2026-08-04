# TODO

Lightweight kanban maintained by Claude Code. Read at the start of every
session; update before finishing (move cards, add new ones, trim Done).

## Now

- Forecast engine: JOINT refit of rho + drawInflation on our own
  window — external review flags a likely double-correction (negative
  rho already boosts the draw-adjacent cells; multiplying the diagonal
  by 1.08 on top is the same fix applied twice). Refit both jointly
  with the existing harness (gates held), including the "drop
  drawInflation entirely" candidate. Then optimise the season-bucket
  recency weights out of sample — currently inherited from the
  league-constants job, never validated for forecasting. NOTE: the
  strength fit has NO within-season time decay, only season buckets;
  evaluate adding exponential day-decay while at it.
- Team name normalizer gaps: Bielefeld, Greuther Fürth, Holstein Kiel,
  Ajaccio unmapped (flagged during backfill).

## Next

- Forecast engine: register an outright market source (Polymarket
  league-winner / top-4 / relegation markets via the Gamma API) so
  league-level forecasts get a real model-vs-market comparison.
  Per external review: capture ORDER-BOOK DEPTH at snapshot time,
  not just midpoint — thin-venue performance is only scoreable as
  realised paper P/L at executable size. Edge Screen presentation
  must be neutral divergence ("model above/below market" + magnitude
  + liquidity), NO directional BACK/FADE calls — tipster-territory
  regulatory constraint, not a naming preference.
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
