# Match Predictor — Parameter Fit v1 (REJECTED — not shipped)

Generated 2026-07-12 by `scripts/fit.ts`, read-only against production
Postgres via `railway run` (Postgres service's public URL — see
`scripts/db.ts`). No pipeline structure changed — this run only ever
varies the numeric values passed into the existing, unmodified
`runModel()`. **No writes to production. No code shipped as a result of
this run** — see Acceptance below.

## Result in one line

The grid search found a joint (rho, drawInflation) point that improves
log loss on the fit set and Holdout 1, but it does so by pushing both
parameters to the edge of the searched range (rho=0.12, drawInflation=1.24)
and that combination **worsens draw calibration on both holdouts** and
doesn't clearly beat production on Holdout 2 log loss either. Per the
acceptance rules, this fails on 3 of 4 conditions. **Not shipped.**
Production `ModelParams` are unchanged.

---

## Data plan and verification 1 — no lookahead across the fit/holdout split

| Set | League(s) | Mode | Seasons | n | Date range |
|---|---|---|---|---|---|
| FIT SET | EPL | fallback | 2122, 2223, 2324 | 1,022 | 2021-10-22 → 2024-05-19 |
| HOLDOUT 1 | EPL | fallback | 2425 | 300 | 2024-10-25 → 2025-05-25 |
| HOLDOUT 2 | All 5 leagues | xG | 2526 | 1,368 | 2025-10-17 → 2026-05-24 |

Clean temporal separation, verified from the actual per-row dates in
each dataset (not just the season labels): the fit set ends
2024-05-19, Holdout 1 doesn't begin until 2024-10-25 (a full summer
break later) — same gap between Holdout 1 and Holdout 2. Neither
holdout's data was read by any code path during grid search — `fit.ts`
builds all three datasets once at the top of the script and only ever
passes `fitSet` into the grid-search loops; `holdout1`/`holdout2*` are
untouched until the single final `evalOn()` call each, after every
parameter decision was already locked in.

---

## Fitting protocol as run

**Coarse grid** (rho: -0.10 to 0.10 step 0.01 × drawInflation: 0.90 to
1.20 step 0.02, formWeight held at production 0.25) — 21×16 = 336
points against the 1,022-match fit set.

Coarse best: **rho=0.10, drawInflation=1.20**, log loss 0.98028 — sitting
exactly at the top-right corner of the searched rectangle.

**Fine grid**: centered on the coarse optimum, extending ±0.02 (rho,
step 0.002) and ±0.04 (drawInflation, step 0.005) — this deliberately
reaches slightly past the original coarse bounds (rho up to 0.12,
drawInflation up to 1.24) specifically *because* the coarse optimum was
already at the edge, to check whether the true optimum was just outside
the originally-specified range. It was:

Fine best: **rho=0.12, drawInflation=1.24**, log loss 0.97997 — again at
the edge of the (now-extended) search window.

### This is a real finding, not a clean convergence

Slicing the coarse surface confirms the joint optimum is edge-seeking,
not interior:

- **At rho=0** (varying drawInflation): a proper interior minimum at
  drawInflation≈1.06-1.08 (log loss 0.9819-0.9820), rising again toward
  1.20 (0.9829). This slice alone would have landed almost exactly on
  today's production drawInflation=1.08.
- **At drawInflation=1.08** (varying rho): a wide, flat interior
  minimum across rho≈0.05-0.08 (log loss 0.9813), not runaway.
- **At rho=0.10** (varying drawInflation): log loss decreases
  *monotonically* all the way from drawInflation=0.90 (0.9875) to
  1.20 (0.9803) — still falling at the edge of the grid.

So each parameter has a sane, bounded optimum on its own, but the
*joint* surface has a ridge that the grid search rides toward the
extreme corner rather than settling into it. Given the known fallback-mode
approximation flagged in `docs/calibration/baseline.md` (goals-shaped
inputs divided by the league's xG-shaped constant in Step 2), this
combination — unusually large positive rho, drawInflation pushed a
quarter above production — looks like the optimizer compensating for
that dataset-specific bias rather than finding a parameter setting that
would generalize. The holdout evaluation below confirms this suspicion
directly rather than leaving it as speculation.

**Flatness**: 357/357 fine-grid points fall within 0.5% relative log
loss of the fine optimum — i.e. the *entire* fine grid is "near
optimal" by that threshold, because the surface is still sloping toward
the corner rather than curving into a bowl. This is the opposite of a
well-identified flat optimum; it's an unbounded-in-the-searched-direction
one. Reporting exactly as found rather than either quietly re-running
with a wider grid or rounding this off as "flat and fine."

**Decision rule check**: fitted drawInflation (1.24) is nowhere near the
[0.98, 1.02] snap-to-1.0 window, so that rule did not fire.

### formWeight (advisory, fit after fixing rho/drawInflation at 0.12/1.24)

| formWeight | Log loss |
|---|---|
| 0.00 | 0.9822 |
| 0.05 | 0.9807 |
| 0.10 | 0.9796 |
| **0.15** | **0.9792** |
| 0.20 | 0.9793 |
| 0.25 (current production) | 0.9800 |
| 0.30 | 0.9812 |
| 0.35 | 0.9830 |
| 0.40 | 0.9854 |
| 0.45 | 0.9883 |
| 0.50 | 0.9919 |

This one *is* a clean interior optimum (0.15, smooth bowl either side),
unlike the rho/drawInflation ridge above — but per the protocol,
formWeight was fitted on a goals-based "form" signal (fallback mode),
which is explicitly a different signal from the live model's xG-based
last-6 blend. Advisory finding only: **0.15 vs current 0.25**, worth a
second look with real xG-based form data once more seasons are
available, but not acted on here regardless of the overall
acceptance outcome below.

---

## Diagnostic — does the 35-50% home-win underprediction survive fitting?

Recomputed the calibration table on the fit set itself, production
params vs fitted (rho=0.12, drawInflation=1.24):

| Bucket | n | Predicted (production) | Observed (production) | Predicted (fitted) | Observed (fitted) |
|---|---|---|---|---|---|
| 35-40% | 80-82 | 37.6% | 51.2% | 37.6% | 50.0% |
| 40-45% | 93-99 | 42.5% | 53.8% | 42.5% | 52.5% |

**Answer: the underprediction survives essentially unchanged.** Mean
predicted probability in both buckets is identical to 3 significant
figures before and after fitting; observed frequency shifts by only
1-1.5 percentage points (well within noise for n≈80-100), not remotely
enough to close an 8-13pp gap.

**Diagnosis: this is not reducible by rho or drawInflation, and that's
expected from the pipeline structure, not a fitting failure.** rho only
reweights 4 specific low-scoring cells of the Dixon-Coles matrix (0-0,
1-0, 0-1, 1-1) and drawInflation only rescales the diagonal
(draw) cells before renormalizing — neither one touches Step 4's lambda
calculation or Steps 2-3's attack/defence strength, which is what
actually determines *where* a match's home-win probability lands before
the draw/correlation adjustments are even applied. A team correctly
priced at "the model thinks this is roughly a 37-45% home win" event is
being handed a systematically-too-low number by the **strength
calculation upstream**, not by how the draw mass gets allocated
afterward. Confirming this analytically: the draw-pair parameters can
shift *how much* mass sits in the draw column and *how correlated* the
extremes are, but they cannot move a match's home-cover mass from the
40% bucket into the 50% bucket — only Steps 2-4 (attack strength,
defence strength, lambda) can do that, and per this task's brief, those
were explicitly off-limits to touch. **This points the next
investigation squarely at Steps 2-3** (not diagnosed further here per
instruction — do not modify).

---

## Evaluation (run once, final fitted params: rho=0.12, drawInflation=1.24, formWeight left at 0.25)

### Holdout 1 — EPL 2425 (n=300)

| Metric | Fitted | Production | Fitted better? |
|---|---|---|---|
| Model Brier | 0.6116 | 0.6123 | yes (marginal) |
| Model Log loss | 1.0201 | 1.0218 | **yes** |
| Close Brier | 0.5966 | 0.5966 | (unchanged — market data) |
| Close Log loss | 0.9932 | 0.9932 | (unchanged — market data) |
| Mean predicted draw % | 21.4% | 22.0% | — |
| Actual draw rate | 24.0% | 24.0% | — |
| \|predicted − actual\| draw gap | **2.55pp** | **1.97pp** | **no — fitted is worse** |

### Holdout 2 pooled — 2025/26, all 5 leagues, xG mode (n=1,368)

| Metric | Fitted | Production | Fitted better? |
|---|---|---|---|
| Model Brier | 0.59970 | 0.59970 | essentially tied |
| Model Log loss | 1.004637 | 1.004610 | **no — fitted is (trivially) worse** |
| Mean predicted draw % | 23.4% | 24.2% | — |
| Actual draw rate | 25.4% | 25.4% | — |
| \|predicted − actual\| draw gap | **2.04pp** | **1.27pp** | **no — fitted is worse** |

---

## Acceptance

| Rule | Result |
|---|---|
| Holdout 1 log loss improves | ✅ true (1.0201 < 1.0218) |
| Holdout 2 pooled log loss not degraded | ❌ false (1.004637 > 1.004610 — degraded, if trivially) |
| Holdout 1 draw calibration not worsened | ❌ false (gap grew from 1.97pp to 2.55pp) |
| Holdout 2 draw calibration not worsened | ❌ false (gap grew from 1.27pp to 2.04pp) |

**3 of 4 rules fail. Per the brief's explicit instruction ("If any
fails, DO NOT ship"): rejected. No changes made to
`frontend/src/model/valorModel.ts`, `MatchPredictorPage.tsx`, or any
production default.**

### Why this happened, plainly

The fitted rho/drawInflation combination bought a small log-loss
improvement on the fit set and Holdout 1 by inflating the draw mass
further than the actual draw rate calls for on the holdouts (both
holdout draw gaps roughly doubled under the fitted params). That's
exactly the failure mode the fallback-mode bias flagged in
`baseline.md` predicts: a fit that partially compensates for a
data-quality problem specific to the fit set rather than genuinely
improving the model, so it doesn't transfer. The grid search did its
job correctly — it found the fit set's true optimum — the optimum
itself just wasn't a good one to generalize from, and the holdout
protocol caught it exactly as designed.

---

## Verification

1. **No-lookahead / no-overlap across fit and holdouts**: date-range
   table above, generated from the actual per-row `matchDate` values
   pulled from Postgres (not season labels) — fit set ends 2024-05-19,
   Holdout 1 starts 2024-10-25; Holdout 1 ends 2025-05-25, Holdout 2
   starts 2025-10-17. No code path in `fit.ts` reads either holdout
   dataset before the single final `evalOn()` call per holdout, after
   every fitting decision was already locked in.
2. **Neutral-team PL test** — `valorModel.ts` was not modified in this
   task (rejected fit ⇒ nothing to ship). Re-ran the exact isolated
   test anyway: λ_home=1.528, λ_away=1.222 — passes exactly, as
   expected since rho/drawInflation don't enter Step 4's calculation at
   all.
3. **Live calculation per league, zero console errors** — not
   re-verified against production because nothing was deployed; the
   site is running the same code verified after the previous commit
   (`cca2810`). Re-running this check would only be meaningful after an
   actual code change ships.

## What this means for next steps

1. **Steps 2-3 (attack/defence strength) are the real target** for
   closing the 35-50% home-win gap — this fit conclusively ruled out
   the draw-pair parameters as the fix. Any future work on that gap
   needs a separate, structural investigation (out of scope for a
   parameters-only pass).
2. **A second fitting attempt should not reuse the fallback-mode fit
   set as-is.** Either wait for more xG-mode seasons to accumulate (the
   `xg_data` schema TODO from `baseline.md` blocks this), or explicitly
   model/correct for the fallback-mode Step 2 bias before fitting
   against goals-based data again — otherwise a re-run grid search is
   likely to find the same kind of edge-seeking, non-generalizing
   optimum.
3. **formWeight=0.15 is a mild, clean signal** worth revisiting once
   real xG-based form data supports a proper fit (not shipped here,
   holding at current production 0.25).
