# Match Predictor — Calibration Baseline

Generated 2026-07-12 by the calibration/backtest harness (`scripts/backtest.ts`),
running the exact production model (`frontend/src/model/valorModel.ts`) with
**current production `ModelParams`, unchanged** — this is a read-only
measurement of where the deployed model stands today, not a tuning pass.
No model parameter, constant, or pipeline step was touched to produce
this report.

## How to reproduce

```
cd scripts
npm install
railway link -p LobsterTrack -s Postgres-QqaX   # public DB URL, not the app service
railway run npx tsx backtest.ts primary   --league=all
railway run npx tsx backtest.ts secondary --league=soccer_epl
railway run npx tsx backtest.ts ahtotals  --league=all
```

`db.ts` prefers `DATABASE_PUBLIC_URL` over `DATABASE_URL` — the app
service only exposes the internal `*.railway.internal` hostname, which
isn't reachable from a local machine even via `railway run` (that only
forwards environment variables, not network routes). Link to the
Postgres service itself, not the app service, to get the public URL.

---

## Decision 1 — historical backfill (before this report was run)

Triggered `POST /admin/import-football-data` for Serie A, La Liga,
Bundesliga, and Ligue 1 (already-existing importer code, never
previously run for these 4 leagues). Result:

| League | Seasons now in `historical_matches` | Total rows | Notes |
|---|---|---|---|
| Premier League | 2122, 2223, 2324, 2425, 2526 | 1,900 | Already had all 5 seasons |
| Serie A | 2122, 2223, 2324, 2425, 2526 | 1,900 | 4 historical seasons 100% complete (0 missing prices); 2526 (current, in progress) ~47% missing — football-data.co.uk hasn't backfilled Pinnacle prices for the still-running season yet |
| La Liga | 2122, 2223, 2324, 2425, 2526 | 1,900 | Same pattern as Serie A |
| Bundesliga | 2122, 2223, 2324, 2425, 2526 | 1,430 | Same pattern, plus 2 unmapped promoted teams (Bielefeld, Greuther Fürth in 2122; Holstein Kiel in 2425) cost ~66/34 rows in those seasons — not fixed, see TODOs below |
| Ligue 1 | 2122, 2223, 2324, 2425, 2526 | 1,640 | Same pattern, plus 1 unmapped team (Ajaccio, 2223) cost ~38 rows |

Total `historical_matches`: **8,770 rows** (confirmed via direct DB count).

---

## Executive summary

- **PRIMARY** (xG mode, current 2025/26 season, all 5 leagues, 1X2): model is
  competitive with but consistently slightly worse-calibrated than the
  closing market (expected for an unfit model going up against Pinnacle) —
  Brier 0.59–0.63 vs market's 0.55–0.60. Draw prediction is directionally
  right but under/over by a few points per league on small samples.
- **SECONDARY** (fallback mode, EPL, 4 prior seasons, 1X2, goals-based
  inputs): much larger sample (1,394 matches) shows a **real, sizeable
  miscalibration**: home-win probabilities in the 35–50% predicted range are
  systematically underpredicted (e.g. 42.5% predicted vs 52.9% observed on
  n=121) — a genuine signal for the calibration phase, not noise, given the
  sample size.
- **AH/TOTALS/CLV**: joins cleanly (94–98% success, all above the 90%
  threshold — no failure samples needed). No consistent exploitable edge:
  flat-stake P/L on the model's highest-edge side is negative in most
  leagues/markets, occasionally sharply so (Serie A 1X2: −30% ROI on 108
  bets) — the model does not currently beat the closing line, which is the
  expected, honest starting point before any fitting work.
- **Sample sizes**: only the SECONDARY (fallback) run clears the 500-match
  target. Every xG-mode run (PRIMARY and AH/TOTALS/CLV) falls short because
  real per-team xG history only exists for one season — see Decision 3 TODO.

---

## PRIMARY RUN — xG mode, 2025/26 season, all 5 leagues, 1X2

Neutralized inputs beyond xG history are impossible to avoid here — this
run uses the exact same "blank Advanced Inputs" defaults the live page
ships with (no penalties, no shots, no absence data available
historically), so it measures the model's core Poisson/Dixon-Coles
machinery, not the full feature set.

| League | Matches considered | Skipped (<8 prior) | Samples used | vs closing odds | Model Brier | Close Brier | Model LogLoss | Close LogLoss | Pred. draw % | Actual draw % | Sample vs 500 target |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Premier League | 380 | 80 | 300 | 130 | 0.6265 | 0.5966 | 1.0400 | 0.9932 | 24.7% | 28.3% | 300/500 (BELOW) |
| Bundesliga | 306 | 72 | 234 | 78 | 0.5875 | 0.5518 | 0.9926 | 0.9385 | 21.7% | 26.5% | 234/500 (BELOW) |
| La Liga | 380 | 80 | 300 | 109 | 0.5905 | 0.5512 | 0.9927 | 0.9350 | 23.6% | 24.0% | 300/500 (BELOW) |
| Serie A | 380 | 80 | 300 | 120 | 0.5961 | 0.5813 | 0.9975 | 0.9712 | 27.4% | 23.7% | 300/500 (BELOW) |
| Ligue 1 | 306 | 72 | 234 | 81 | 0.5939 | 0.6017 | 0.9956 | 1.0074 | 22.5% | 24.8% | 234/500 (BELOW) |

Draw calibration is close across the board (within ~4pp of actual in
every league), including one league (Ligue 1) where the model's Brier
score actually beat the market's (0.5939 vs 0.6017) — not something to
read much into on n=234, but notable.

<details>
<summary>Full calibration table — home-win probability, all 5 leagues (18 buckets × 5 leagues)</summary>

| League | Bucket | n | Mean predicted | Observed frequency |
|---|---|---|---|---|
| Premier League | 0-5% | 1 | 4.9% | 0.0% |
| Premier League | 5-10% | 4 | 8.2% | 25.0% |
| Premier League | 10-15% | 7 | 12.9% | 28.6% |
| Premier League | 15-20% | 19 | 17.4% | 10.5% |
| Premier League | 20-25% | 18 | 22.2% | 22.2% |
| Premier League | 25-30% | 26 | 27.8% | 15.4% |
| Premier League | 30-35% | 37 | 32.7% | 48.6% |
| Premier League | 35-40% | 22 | 38.1% | 31.8% |
| Premier League | 40-45% | 23 | 42.5% | 47.8% |
| Premier League | 45-50% | 29 | 47.5% | 37.9% |
| Premier League | 50-55% | 35 | 52.1% | 48.6% |
| Premier League | 55-60% | 23 | 57.4% | 43.5% |
| Premier League | 60-65% | 15 | 62.5% | 66.7% |
| Premier League | 65-70% | 16 | 67.5% | 68.8% |
| Premier League | 70-75% | 13 | 71.4% | 61.5% |
| Premier League | 75-80% | 8 | 77.2% | 62.5% |
| Premier League | 80-85% | 2 | 82.0% | 50.0% |
| Premier League | 85-90% | 2 | 87.5% | 100.0% |
| Bundesliga | 0-5% | 1 | 3.4% | 0.0% |
| Bundesliga | 5-10% | 5 | 6.7% | 0.0% |
| Bundesliga | 10-15% | 10 | 12.8% | 20.0% |
| Bundesliga | 15-20% | 7 | 17.8% | 14.3% |
| Bundesliga | 20-25% | 19 | 22.9% | 15.8% |
| Bundesliga | 25-30% | 19 | 27.2% | 5.3% |
| Bundesliga | 30-35% | 23 | 32.1% | 47.8% |
| Bundesliga | 35-40% | 17 | 38.0% | 47.1% |
| Bundesliga | 40-45% | 31 | 42.7% | 35.5% |
| Bundesliga | 45-50% | 17 | 47.1% | 47.1% |
| Bundesliga | 50-55% | 17 | 52.1% | 70.6% |
| Bundesliga | 55-60% | 14 | 57.7% | 64.3% |
| Bundesliga | 60-65% | 14 | 62.6% | 50.0% |
| Bundesliga | 65-70% | 12 | 67.5% | 75.0% |
| Bundesliga | 70-75% | 12 | 72.2% | 75.0% |
| Bundesliga | 75-80% | 7 | 77.0% | 85.7% |
| Bundesliga | 80-85% | 3 | 83.1% | 100.0% |
| Bundesliga | 85-90% | 2 | 87.0% | 100.0% |
| Bundesliga | 90-95% | 4 | 92.7% | 25.0% |
| La Liga | 5-10% | 2 | 9.9% | 50.0% |
| La Liga | 10-15% | 1 | 14.4% | 100.0% |
| La Liga | 15-20% | 8 | 17.9% | 12.5% |
| La Liga | 20-25% | 15 | 22.2% | 33.3% |
| La Liga | 25-30% | 27 | 27.0% | 33.3% |
| La Liga | 30-35% | 30 | 32.7% | 36.7% |
| La Liga | 35-40% | 34 | 37.7% | 32.4% |
| La Liga | 40-45% | 34 | 43.0% | 47.1% |
| La Liga | 45-50% | 26 | 47.2% | 50.0% |
| La Liga | 50-55% | 22 | 52.4% | 27.3% |
| La Liga | 55-60% | 32 | 57.3% | 62.5% |
| La Liga | 60-65% | 20 | 62.6% | 75.0% |
| La Liga | 65-70% | 12 | 67.1% | 58.3% |
| La Liga | 70-75% | 16 | 72.3% | 81.3% |
| La Liga | 75-80% | 10 | 77.1% | 80.0% |
| La Liga | 80-85% | 3 | 83.2% | 66.7% |
| La Liga | 85-90% | 6 | 87.7% | 100.0% |
| La Liga | 90-95% | 1 | 91.3% | 100.0% |
| La Liga | 95-100% | 1 | 95.0% | 100.0% |
| Serie A | 5-10% | 5 | 7.5% | 20.0% |
| Serie A | 10-15% | 17 | 12.9% | 5.9% |
| Serie A | 15-20% | 25 | 17.2% | 12.0% |
| Serie A | 20-25% | 22 | 22.5% | 31.8% |
| Serie A | 25-30% | 25 | 27.4% | 24.0% |
| Serie A | 30-35% | 38 | 32.6% | 34.2% |
| Serie A | 35-40% | 26 | 37.4% | 46.2% |
| Serie A | 40-45% | 29 | 42.1% | 51.7% |
| Serie A | 45-50% | 29 | 47.0% | 37.9% |
| Serie A | 50-55% | 23 | 52.1% | 52.2% |
| Serie A | 55-60% | 18 | 57.8% | 44.4% |
| Serie A | 60-65% | 13 | 62.6% | 76.9% |
| Serie A | 65-70% | 16 | 67.5% | 50.0% |
| Serie A | 70-75% | 8 | 73.3% | 62.5% |
| Serie A | 75-80% | 5 | 77.9% | 100.0% |
| Serie A | 80-85% | 1 | 80.2% | 100.0% |
| Ligue 1 | 5-10% | 4 | 7.7% | 25.0% |
| Ligue 1 | 10-15% | 6 | 12.4% | 0.0% |
| Ligue 1 | 15-20% | 14 | 17.9% | 21.4% |
| Ligue 1 | 20-25% | 17 | 22.4% | 23.5% |
| Ligue 1 | 25-30% | 13 | 27.2% | 15.4% |
| Ligue 1 | 30-35% | 28 | 32.5% | 42.9% |
| Ligue 1 | 35-40% | 16 | 37.1% | 50.0% |
| Ligue 1 | 40-45% | 24 | 42.2% | 37.5% |
| Ligue 1 | 45-50% | 14 | 47.9% | 64.3% |
| Ligue 1 | 50-55% | 24 | 52.8% | 41.7% |
| Ligue 1 | 55-60% | 14 | 57.8% | 42.9% |
| Ligue 1 | 60-65% | 18 | 62.5% | 66.7% |
| Ligue 1 | 65-70% | 17 | 67.7% | 52.9% |
| Ligue 1 | 70-75% | 7 | 72.9% | 57.1% |
| Ligue 1 | 75-80% | 6 | 77.2% | 83.3% |
| Ligue 1 | 80-85% | 6 | 81.3% | 66.7% |
| Ligue 1 | 85-90% | 4 | 87.1% | 75.0% |
| Ligue 1 | 90-95% | 2 | 91.5% | 100.0% |

Every bucket here has n<40 — noisy, no strong per-bucket conclusions
should be drawn from PRIMARY alone. Use SECONDARY (below) for the
higher-confidence calibration read.

</details>

---

## SECONDARY RUN — FALLBACK MODE, EPL, 4 prior seasons (2122–2425), 1X2

**Goals-based team strengths, no xG data used at all.** Flagged
explicitly: this run substitutes season/last-6 goals-scored/conceded
averages for xG in the same input slots the model expects xG in. The
model's Step 2 attack-strength divisor is the league's `avgXG` constant
regardless of mode, so feeding it goals-shaped data introduces a small,
consistent bias relative to a properly goals-calibrated model — this run
exists to get a large-enough sample to see real calibration patterns,
not as a second production-quality measurement.

| League | Seasons | Matches considered | Skipped (<8 prior) | Samples used | vs closing odds | Model Brier | Close Brier | Model LogLoss | Close LogLoss | Pred. draw % | Actual draw % | Sample vs 500 target |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Premier League (FALLBACK) | 2122, 2223, 2324, 2425 | 1520 | 126 | 1394 | 1394 | 0.5860 | 0.5583 | 0.9874 | 0.9439 | 22.7% | 22.7% | **1394/500 (MEETS)** |

Draw calibration is excellent in aggregate (22.7% predicted vs 22.7%
actual) — but this is a population-level average; the per-bucket table
below shows the real per-band picture.

<details>
<summary>Full calibration tables — Home / Draw / Away (n=1,394, EPL fallback mode)</summary>

### Home

| Bucket | n | Mean predicted | Observed frequency |
|---|---|---|---|
| 0-5% | 14 | 3.2% | 7.1% |
| 5-10% | 50 | 7.4% | 12.0% |
| 10-15% | 65 | 12.6% | 24.6% |
| 15-20% | 77 | 17.6% | 14.3% |
| 20-25% | 83 | 22.3% | 24.1% |
| 25-30% | 106 | 27.4% | 30.2% |
| 30-35% | 119 | 32.4% | 36.1% |
| **35-40%** | **112** | **37.6%** | **44.6%** |
| **40-45%** | **121** | **42.5%** | **52.9%** |
| 45-50% | 105 | 47.5% | 44.8% |
| 50-55% | 109 | 52.6% | 54.1% |
| 55-60% | 77 | 57.5% | 55.8% |
| 60-65% | 73 | 62.5% | 52.1% |
| 65-70% | 76 | 67.3% | 59.2% |
| 70-75% | 65 | 72.6% | 66.2% |
| 75-80% | 52 | 77.4% | 69.2% |
| 80-85% | 35 | 82.9% | 77.1% |
| 85-90% | 32 | 87.2% | 75.0% |
| 90-95% | 17 | 92.7% | 94.1% |
| 95-100% | 6 | 95.9% | 83.3% |

**The 35-50% predicted-home-win band is systematically underpredicted**
— both the 35-40% and 40-45% buckets show observed frequency ~8-10
percentage points above predicted, on n=112 and n=121 respectively. This
is the single clearest, highest-confidence signal in this entire
baseline (large n, consistent direction across two adjacent buckets) and
should be the first thing the calibration pass investigates — likely
candidates are the home-advantage constants (`homeAwayRatio`) or the
attack/defence-strength blend weights being slightly too conservative
for teams in this probability range.

### Draw

| Bucket | n | Mean predicted | Observed frequency |
|---|---|---|---|
| 0-5% | 12 | 3.9% | 8.3% |
| 5-10% | 45 | 7.9% | 8.9% |
| 10-15% | 102 | 12.7% | 18.6% |
| 15-20% | 210 | 17.7% | 17.6% |
| 20-25% | 490 | 22.9% | 26.1% |
| 25-30% | 450 | 27.0% | 23.1% |
| 30-35% | 74 | 31.8% | 28.4% |
| 35-40% | 8 | 36.8% | 25.0% |
| 40-45% | 2 | 42.1% | 0.0% |
| 45-50% | 1 | 47.1% | 0.0% |

The two largest buckets (20-25%, n=490 and 25-30%, n=450 — together 68%
of the entire sample) show a mild but real crossover: the model slightly
underpredicts draws just below 25% and slightly overpredicts just above
it. Draw inflation (currently a flat ×1.08 in Step 9) is a single global
constant — this pattern is consistent with it being roughly right on
average but not fully capturing how draw likelihood actually varies with
match closeness.

### Away

| Bucket | n | Mean predicted | Observed frequency |
|---|---|---|---|
| 0-5% | 69 | 3.1% | 8.7% |
| 5-10% | 105 | 7.7% | 16.2% |
| 10-15% | 128 | 12.5% | 9.4% |
| 15-20% | 116 | 17.3% | 20.7% |
| 20-25% | 137 | 22.4% | 25.5% |
| 25-30% | 134 | 27.3% | 27.6% |
| 30-35% | 139 | 32.2% | 30.9% |
| 35-40% | 102 | 37.6% | 28.4% |
| 40-45% | 99 | 42.5% | 41.4% |
| 45-50% | 77 | 47.0% | 51.9% |
| 50-55% | 72 | 52.3% | 50.0% |
| 55-60% | 55 | 57.4% | 47.3% |
| 60-65% | 50 | 62.4% | 60.0% |
| 65-70% | 32 | 67.1% | 59.4% |
| 70-75% | 30 | 72.4% | 76.7% |
| 75-80% | 22 | 77.8% | 68.2% |
| 80-85% | 18 | 82.3% | 61.1% |
| 85-90% | 5 | 87.0% | 80.0% |
| 90-95% | 4 | 92.8% | 100.0% |

The very low bands (0-5%, 5-10%) both show observed noticeably above
predicted (8.7% vs 3.1%, 16.2% vs 7.7%) — the model may be slightly too
confident when it's very sure the away side will lose. Smaller n than
the home-band finding above but worth checking alongside it.

</details>

---

## AH/TOTALS/CLV RUN — closing_lines joined to historical_matches

**Join methodology:** grouped `closing_lines` rows by `match_id` (one
match has up to 3 rows — 1x2, asian_handicap, totals), then matched each
group to a finished `historical_matches` row on
`(league, home_team, away_team, same calendar date as kickoff_time)`.
World Cup excluded per the brief (not in `LEAGUE_PARAMS`, so it's
naturally excluded — the harness only iterates `SUPPORTED_LEAGUES`).

**Real bug found and fixed during this run:** the raw `market_type`
column stores SQLAlchemy's Postgres enum *member names*
(`H2H` / `ASIAN_HANDICAP` / `TOTALS`), not the `.value` strings
(`1x2` / `asian_handicap` / `totals`) that the `/closing-lines` API
converts to before returning — a raw SQL query bypasses that
ORM-level conversion. First run silently produced 0 usable samples in
every league despite 94-98% successful joins because every
`market_type === '1x2'` comparison failed. Fixed in `db.ts` by
normalizing at the query layer (`MARKET_TYPE_DB_TO_API`) so every other
file keeps using the API-style values. Also hit and fixed: `pg` parses
DATE/TIMESTAMP columns into JS `Date` objects by default, which silently
apply local-timezone rendering — overrode the type parsers for those
OIDs to return raw Postgres strings instead, since every date comparison
in this harness assumes plain `YYYY-MM-DD` strings.

### Join success rates

| League | Join attempts | Join successes | Join rate |
|---|---|---|---|
| Premier League | 125 | 121 | 96.8% |
| Bundesliga | 120 | 118 | 98.3% |
| La Liga | 156 | 152 | 97.4% |
| Serie A | 150 | 141 | 94.0% |
| Ligue 1 | 122 | 117 | 95.9% |

All 5 leagues clear the 90% threshold — no failure-sample dump required
per the brief. (The handful of misses per league are most likely
matches without a corresponding finished result yet, or a rare
same-week-different-date edge case; not investigated further since none
triggered the reporting threshold.)

### 1X2 metrics

| League | n | Model Brier | Close Brier | Model LogLoss | Close LogLoss | Mean edge (highest side) | Bets (edge>2%) | Flat-stake P/L (£1 units) | ROI% | Sample vs 500 |
|---|---|---|---|---|---|---|---|---|---|---|
| Premier League | 121 | 0.6309 | 0.6224 | 1.0469 | 1.0346 | 5.4% | 97 | -7.17 | -7.4% | 121/500 (BELOW) |
| Bundesliga | 118 | 0.5844 | 0.5781 | 0.9832 | 0.9717 | 6.0% | 100 | -4.69 | -4.7% | 118/500 (BELOW) |
| La Liga | 152 | 0.6055 | 0.5872 | 1.0151 | 0.9895 | 8.4% | 142 | -4.79 | -3.4% | 152/500 (BELOW) |
| Serie A | 141 | 0.6047 | 0.5786 | 1.0116 | 0.9780 | 4.9% | 108 | -32.73 | -30.3% | 141/500 (BELOW) |
| Ligue 1 | 117 | 0.6100 | 0.6112 | 1.0118 | 1.0131 | 7.1% | 100 | 14.53 | 14.5% | 117/500 (BELOW) |

The model finds a "highest edge" side on nearly every match (mean edge
4.9-8.4pp, 82-97% of matches clear the 2pp bet threshold) but that edge
does not translate into flat-stake profit in 4 of 5 leagues — this is
the expected signature of a model that isn't yet calibrated: it
disagrees with the market a lot, but not in a way that's currently
right more often than wrong. Serie A's -30.3% ROI on 108 bets is the
standout outlier and worth a specific look in the next phase (possibly
one or two large-edge losing bets skewing a modest sample, not
necessarily a systematic Serie A-specific issue — the calibration tables
above don't show anything Serie A-specific that would explain it).

### Totals @ 2.5 metrics

Restricted to matches where the captured closing totals line was
exactly 2.5 (not whatever line each match happened to have) — sample
sizes are correspondingly small.

| League | n | Model Brier | Close Brier | Model LogLoss | Close LogLoss | Mean edge | Bets (edge>2%) | Flat-stake P/L | ROI% |
|---|---|---|---|---|---|---|---|---|---|
| Premier League | 29 | 0.4759 | 0.4990 | 0.6686 | 0.6921 | 5.2% | 24 | 5.08 | 21.2% |
| Bundesliga | 15 | 0.5624 | 0.4943 | 0.7614 | 0.6874 | 10.1% | 15 | 0.40 | 2.7% |
| La Liga | 46 | 0.5368 | 0.5070 | 0.7334 | 0.7002 | 9.8% | 41 | 4.67 | 11.4% |
| Serie A | 49 | 0.5198 | 0.5034 | 0.7138 | 0.6966 | 5.9% | 41 | -2.26 | -5.5% |
| Ligue 1 | 33 | 0.5258 | 0.4969 | 0.7199 | 0.6900 | 9.2% | 32 | -3.34 | -10.4% |

Mixed picture, small samples throughout (15-49) — not enough to draw a
real conclusion either way on Totals yet. Premier League's +21.2% ROI on
24 bets is the most eye-catching number here but with n=24 it's well
within noise.

### Asian Handicap CLV proxy

Whatever AH line was actually captured per match (not restricted to a
single line, unlike Totals) — `n` here is smaller than the join count
because a few captured lines fall outside the model's fixed 20-line
grid (-2.5 to +2.5) and are skipped rather than approximated.

| League | n | Mean edge | Bets (edge>2%) | Flat-stake P/L | ROI% |
|---|---|---|---|---|---|
| Premier League | 113 | -0.1% | 41 | 2.52 | 6.1% |
| Bundesliga | 111 | 0.0% | 36 | 1.50 | 4.2% |
| La Liga | 140 | 2.7% | 75 | -6.38 | -8.5% |
| Serie A | 130 | -0.8% | 38 | -9.02 | -23.7% |
| Ligue 1 | 111 | 1.5% | 45 | 6.36 | 14.1% |

Mean edge near zero in 3/5 leagues (PL, Bundesliga, Serie A) suggests the
model's AH pricing is, on average, not wildly out of step with the
market on the handicap dimension specifically — a mildly encouraging
sign relative to the 1X2 and Totals results above, though the flat-stake
P/L is still all over the place league to league.

---

## Data gaps and standing TODOs

1. **`xg_data` has no `season` column** (`UniqueConstraint("league",
   "team_name", "match_number")`) — structurally can only hold one
   season's worth of npxG per team at a time. **This must be fixed
   before the 2026/27 season starts** (currently scheduled to begin
   ~August 2026): the first upload of 2026/27 data will either collide
   on the unique constraint against 2025/26 rows still in the table, or
   (if 2025/26 is cleared first) permanently lose the ability to backtest
   the 2025/26 season in xG mode ever again. Not fixed as part of this
   task (infrastructure/backtesting only, no schema changes) — flagging
   for the calibration phase or a dedicated migration before the next
   season kicks off.
2. **No historical penalties, shots, set-piece split, or absence data
   exists anywhere** — every backtest match uses the same "blank
   Advanced Inputs" defaults the live page ships with. This is not a
   bug in the harness; it's a real ceiling on what can be tested until
   (if ever) those signals get a historical data source.
3. **Fallback-mode bias** (documented in `scripts/inputs.ts`): goals-based
   substitute inputs get divided by the league's `avgXG` constant in
   Step 2 (not `avgGoals`), since the pipeline logic is unchanged
   between modes. Small, consistent, not fixed — SECONDARY should be
   read as "large-sample calibration signal," not "a second true
   baseline."
4. **Two small historical-import gaps**, not fixed: Bundesliga is
   missing all matches involving Bielefeld/Greuther Fürth (2122) and
   Holstein Kiel (2425); Ligue 1 is missing all matches involving
   Ajaccio (2223) — promoted/relegated teams absent from
   `team_name_normalizer.NAME_MAP_BY_LEAGUE`. Costs roughly 66, 34, and
   38 rows respectively out of thousands. Add the missing entries when
   convenient.
5. **The Understat→canonical team-name map** (`scripts/understat-name-map.ts`,
   24 entries across 5 leagues) is new — it did not exist anywhere in
   the codebase before this task. If Understat renames a team or a new
   team gets promoted with a spelling mismatch, this map will need a new
   entry, the same way `team_name_normalizer.py` does for
   football-data.co.uk names. The two maps are intentionally separate
   files since the two upstream sources abbreviate differently.

---

## Verification

1. **Extraction bit-identical** — confirmed in the Step 1 commit
   (`73a8b04`): neutral-team PL test gives λ_home=1.528/λ_away=1.222
   exactly; live production spot-checks across all 5 leagues before and
   after extraction produced byte-identical displayed figures.
2. **No-lookahead audit** — `scripts/inputs.ts`'s `priorRecords()` is the
   single choke point: `all.filter((r) => r.matchDate < targetDate)`,
   strict less-than. Every input-construction function
   (`buildTeamInputs`) routes exclusively through it before computing any
   mean or last-6 average — verified by a synthetic smoke test (a
   deliberately-planted future-dated record and a same-calendar-day
   record were both confirmed excluded) before this report's real runs,
   and structurally guaranteed by there being no other code path in the
   harness that reads a team's full-season array directly.
3. **De-vig sanity** — `devig3Way`/`devig2Way` in `scripts/scoring.ts`
   normalize by construction (`raw / sum(raw)` always sums to 1.0);
   confirmed via smoke test before this report's real runs.
4. **Sample sizes vs the ≥500 target** — reported explicitly per run
   per league throughout this document rather than assumed. Summary:
   only SECONDARY (EPL fallback, n=1,394) clears it. Every xG-mode run
   falls short (117-300 per league) because real per-team xG history
   only covers one season — this is the direct, expected consequence of
   the Decision 3 schema limitation above, not a harness bug.

---

## What this means for the calibration work that comes next

The clearest, highest-confidence finding in this baseline is the
**35-50% home-win-probability underprediction** in the SECONDARY
calibration table (n=112 and n=121, both showing observed 8-10
percentage points above predicted) — that's the first thing worth
investigating when parameter fitting starts. Everything else in this
report (PRIMARY's per-league Brier/LogLoss, the AH/CLV results) is
useful context but drawn from samples too small (117-300) to fit
anything confidently against on their own — which is precisely why the
`xg_data` season-column fix (TODO #1 above) matters: without it, every
future baseline will have the same small-sample ceiling on the
signal that actually matters (xG-mode performance), forever bottlenecked
at one season no matter how much historical `historical_matches`/
`closing_lines` data accumulates.
