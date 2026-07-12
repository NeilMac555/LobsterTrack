# TODO

Lightweight kanban maintained by Claude Code. Read at the start of every
session; update before finishing (move cards, add new ones, trim Done).

## Now

- Steps 2-3 diagnosis DONE (see docs/calibration/steps23-diagnosis.md):
  gap does not reproduce with significance in xG (production) mode;
  in fallback mode it's 2 hot buckets (~35-42.5%) not a uniform slope,
  mostly explained by draw over-allocation (H4), not strength exponent
  (H1, rejected) or lambda clamp (H3, eliminated). Recommendation is
  "no production change" pending: (a) measuring how often fallback mode
  actually fires in live predictions, (b) Neil's decision on whether to
  approve a fallback-only H2+H5 tweak. Awaiting Neil's go/no-go.

## Next

- Live league constants job: scheduled query computing avgGoalsPerTeam
  and homeAwayRatio per league from historical_matches (rolling 3
  seasons), written to a league_constants table, predictor reads live
  values instead of hardcoded 2025/26.
- Team name normalizer gaps: Bielefeld, Greuther Fürth, Holstein Kiel,
  Ajaccio unmapped (flagged during backfill).

## Later

- Re-fit rho/drawInflation in xG mode once 2026/27 accumulates enough
  matches (fallback fit was rejected — see fit-v1.md).
- CL/UEL restoration: needs Elo-based cross-league strengths +
  competition-specific constants. Blocked until then.
- qualityWeight/spDiscount: fit or delete once shots/SP historical
  data exists (currently unfittable).

## Done

(newest first)

- xg_data season migration — `2b6d6a5`
- calibration harness + baseline — `cca2810`
- fit-v1 (rejected, gates held) — `ee9835e`
- input form cull — `7c871ea`
- AH/Totals/BTTS/CS markets — `b902e63`
- home advantage symmetric split — `d4b0d48`
- CL/UEL hidden — `b902e63`
- report-hygiene rule — `b902e63`
