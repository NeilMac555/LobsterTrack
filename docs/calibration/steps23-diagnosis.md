# Steps 2-3 Diagnosis: 35-50% Home-Win Underprediction

Diagnostic only. No changes to `frontend/src/model/valorModel.ts` or any
shipped parameter. All numbers below come from `scripts/diagnose_steps23.ts`
(reproducible via `railway run npx tsx diagnose_steps23.ts`), backed by
`scripts/experimental-model.ts` (a diagnostic-only, never-imported copy of
the production math with three extra knobs) and a `calibrationTable()`
change in `scripts/scoring.ts` to support configurable bucket width
(default unchanged at 5pp; this diagnosis uses 2.5pp).

## tl;dr

The gap **does not reproduce with statistical significance in xG mode**
(production's primary pathway). In EPL fallback mode it's real but smaller
than fit-v1.md's headline number once you look bucket-by-bucket, and it's
concentrated in one or two hot buckets rather than a uniform slope across
the whole band. None of H1/H2/H3/H5 in isolation explains it; the closest
thing to a mechanism is over-allocation to the draw outcome (H4). See
**Recommendation** at the end — leans toward no production change, with one
cheap, low-risk fallback-mode-only option flagged for separate approval if
wanted.

## Step 1 — Characterisation (EPL fallback, 4 fit/holdout seasons pooled, n=1394)

### 1a. Where exactly, and is it symmetric?

Rebuilt the home-win calibration table at 2.5pp resolution (was 5pp in
fit-v1.md). Full table in the script output; the 30-50% region:

| bucket | n | predicted | observed | gap |
|---|---|---|---|---|
| 30.0-32.5% | 64 | 31.3% | 34.4% | +3.0pp |
| 32.5-35.0% | 55 | 33.7% | 38.2% | +4.5pp |
| 35.0-37.5% | 51 | 36.3% | 49.0% | **+12.7pp** |
| 37.5-40.0% | 61 | 38.8% | 41.0% | +2.2pp |
| 40.0-42.5% | 58 | 41.3% | 63.8% | **+22.5pp** ← only individually-significant bucket in the band (Wilson 95% CI [50.9%, 74.9%] excludes predicted, n≥20) |
| 42.5-45.0% | 63 | 43.6% | 42.9% | -0.8pp |
| 45.0-47.5% | 49 | 46.2% | 40.8% | -5.4pp |
| 47.5-50.0% | 56 | 48.6% | 48.2% | -0.4pp |

**Finding: the band is not a uniform underprediction.** It's dominated by
two hot buckets (35.0-37.5% and especially 40.0-42.5%, which is the only
bucket in the whole table that clears the Wilson-CI + n≥20 significance
bar). 42.5-50% is essentially flat to slightly overpredicted. Pooled across
the full 35-50% band (n=338): mean predicted 42.4%, actual 47.6%, gap
**+5.2pp** — real, but well short of fit-v1.md's 8-13pp per-5pp-bucket
figures, because pooling at finer resolution reveals the signal isn't
evenly spread.

A naive auto-flagging pass (|gap|>5pp, n≥15, no significance test) flags a
much wider, noisier, sign-flipping range across the whole table — this is
mostly small-bucket sampling noise from halving bucket width, not signal.
Discarded as a detection method; see script comments.

**Symmetry (above 50%):** the upper bands (55-90% predicted) skew
consistently *negative* (overprediction of strong favourites) — e.g.
60.0-62.5% (-13.9pp), 67.5-70.0% (-11.0pp), 72.5-75.0% (-13.8pp),
80.0-82.5% (-19.9pp), 87.5-90.0% (-21.8pp) — though none individually
clears the significance bar (n too small per bucket, 13-45). So
qualitatively: strong favourites tend to be overpredicted, mid-range
35-50% favourites (specifically ~35-42.5%) tend to be underpredicted. This
pattern is suggestive of "insufficient spread" (H1 territory) but Step 3
shows it isn't fixable by the exponent knob alone (see below).

### 1b. Where did the missing home-win mass go? (n=338, band 35-50%)

| | mean predicted | actual rate | gap |
|---|---|---|---|
| Home | 42.44% | 47.63% | +5.19pp |
| Draw | 26.94% | 22.78% | **-4.16pp** |
| Away | 30.62% | 29.59% | -1.04pp |

Most of the missing home mass (4.16 of 5.19pp) is coming from **over-
allocated draw probability**, not away. Away is close to accurate. Direct
evidence for H4.

### 1c. Home-specific or general mid-range compression?

Marginal draw/away calibration tables (i.e. bucketed on the *draw* or
*away* model probability, not conditioned on the home band) don't show the
same clean pattern — sample sizes at 30-40% predicted-draw or
predicted-away are much smaller (n=2-93) and noisier, no consistent
signal. The clean, well-powered evidence for cross-outcome leakage is 1b's
band decomposition (conditioned on the home band), not these marginal
tables. Best read: **this presents as a home-band-specific effect**, best
diagnosed via 1b, not as a general "all mid-range favourites in any
market" compression.

## Step 2 — Does this appear in xG mode? (PRIMARY, 5 leagues pooled, 2025/26, n=1368)

Same band (predicted home 35-50%), same computation, xG-mode data:

- n=371, mean predicted 42.51%, observed 43.13%, gap **+0.62pp**
- Wilson 95% CI: **[38.18%, 48.21%]** — comfortably contains the predicted
  value. Not statistically significant.

More specific: the exact bucket that's individually significant in
fallback mode (40.0-42.5%, +22.5pp there) shows **-0.8pp** in xG mode at
the same bucket (n=74) — the anomaly does not replicate. The neighbouring
35.0-37.5% xG bucket does show a positive gap (+11.8pp, n=54) but it's
immediately offset by 37.5-40.0% (-6.1pp, n=61) and 47.5-50.0% (-7.2pp,
n=53), netting out to the ~0pp band average above.

xG mode's own auto-detected flagged buckets (informational) span a wide,
noisy, sign-alternating range from ~12.5% to ~80% — consistent with
small-sample noise from a single-season, ~1,368-match dataset spread
across 39 buckets, not a specific structural issue at 35-50%.

**Conclusion: the gap does not clearly appear in xG mode.** This is
consistent with "fallback-mode goals-based strengths (or the fallback
pathway's specific data shape) produce this artifact, and the production
xG pathway may be fine" — stated explicitly per the task's request, in
either direction. The xG sample is still fairly small (CI width ~10pp), so
this isn't proof of perfect calibration — only that there's no significant
evidence of the fallback-mode gap in the production pathway today. Worth
re-checking as the 2025/26 (and future) xG sample grows.

## Step 3 — Hypothesis tests (EPL fallback, n=1394, band 35-50%)

Baseline (production knobs, run through `experimental-model.ts`, verified
~1e-15 relative match to the real `runModel()`): band gap **+5.19pp**,
n=338, overall log loss 0.9874.

### H1 — Strength compression (exponent k on both strength ratios)

Spec range (spread further, k>1):

| k | band gap | n in band | overall log loss |
|---|---|---|---|
| 1.1 | +4.94pp | 318 | 0.9951 |
| 1.2 | +4.47pp | 294 | 1.0058 |
| 1.3 | +4.18pp | 265 | 1.0194 |
| 1.4 | +4.54pp | 246 | 1.0359 |

Supplementary (compress toward 1, k<1 — tested because the upper-band
overprediction pattern in 1a looked like an "insufficient spread"
signature, the opposite direction from the literal H1 spec):

| k | band gap | n in band | overall log loss |
|---|---|---|---|
| 0.7 | +4.45pp | 482 | 0.9813 |
| 0.8 | +4.68pp | 420 | 0.9804 |
| 0.9 | +5.34pp | 376 | 0.9825 |

**Rejected as primary cause, either direction.** k>1 nudges the gap down
slightly but degrades overall log loss monotonically and substantially
(0.987→1.036, ~5% worse). k<1 doesn't clearly help the gap at all (0.9's
gap is *worse* than baseline) despite a marginal log-loss improvement at
0.7-0.8. Caveat: n-in-band shifts with k (probabilities redistribute), so
these aren't a fully apples-to-apples comparison — but the direction and
size of the effect is clear enough that H1 isn't the answer either way.

### H2 — Defence blend weight (production 80/20 xG-against/goals-against)

| weight | band gap | n in band | overall log loss |
|---|---|---|---|
| 1.0 (100/0) | +4.54pp | 333 | 0.9876 |
| 0.6 (60/40) | +4.64pp | 351 | 0.9875 |
| 0.5 (50/50) | +3.94pp | 348 | 0.9877 |

**Partial, real, cheap effect.** 50/50 shaves ~1.25pp off the gap with
essentially zero log-loss cost (0.9874→0.9877, noise-level). Not a full
fix on its own, but the only knob tested here that improves the band
*without* a log-loss trade-off.

### H3 — Lambda clamp

0 of 1394 matches hit the [0.05, 8] clamp. **Eliminated**, as expected.

### H4 — Draw mass

Covered in 1b: draws over-predicted by ~4.16pp in this exact band, ~80% of
the total 5.19pp gap. **Best-supported single mechanism** of the ones
tested, though it's a decomposition/correlation, not an isolated parameter
sweep — no `drawInflation`-specific knob was tested in this diagnosis (out
of scope for the specified H1-H5 set).

### H5 — Home/away ratio (r) perturbation

| delta | band gap | n in band | overall log loss |
|---|---|---|---|
| -0.05 | +5.94pp | 344 | 0.9880 |
| -0.025 | +5.41pp | 347 | 0.9876 |
| +0.025 | +4.76pp | 346 | 0.9874 |
| +0.05 | +3.52pp | 340 | 0.9875 |

**Partial, real, cheap effect**, similar shape to H2. +0.05 shaves ~1.67pp
off the gap with no log-loss cost. Directionally consistent (more home
weight in the multiplicative split reduces home underprediction) but not a
full fix alone.

## Synthesis

1. **Production (xG mode) shows no significant version of this gap.**
   Step 2 is the headline finding. The specific bucket that's anomalous in
   fallback mode is flat in xG mode; the band-level CI contains the
   predicted value.
2. **In fallback mode, the "8-10pp band" from fit-v1.md is really one or
   two hot buckets (~35-42.5%, esp. 40-42.5%) sitting inside an otherwise
   roughly-calibrated 35-50% range**, pooling to +5.2pp on average.
3. **No single H1-H5 hypothesis fully explains it.** H3 is eliminated. H1
   makes things worse (log loss) or doesn't help. H2 and H5 each recover
   ~1.2-1.7pp with no cost — combined (not tested together, but both
   directionally independent — one reweights defence, one reweights the
   home/away split) they might recover something like half the fallback
   gap. The largest single correlate is H4: draws are over-allocated by
   ~4pp in this exact band, eating most of the missing home mass.
4. No test here isolates *why* draws are over-allocated specifically in
   this band (e.g. a `drawInflation`-vs-probability-range interaction) —
   that would need a new, not-yet-specified hypothesis test.

## Recommendation (fix proposal — for approval, not implemented)

**Primary: no production model change.** The pathway that matters
(xG mode) doesn't show a significant gap. Changing `valorModel.ts` to fix
a fallback-mode-only artifact risks trading a real problem (none currently
evidenced in production) for a manufactured one (H1's log-loss cost, or
an under-tested drawInflation change). Two follow-ups instead:

- **Measure fallback-mode incidence in live predictions.** This diagnosis
  doesn't know how often production actually falls back to goals-based
  strength (missing xG data) vs runs the primary xG pathway. If fallback
  is rare in practice, this whole finding is low-priority by construction.
  If it's common, escalate to the option below.
- **Re-run this same script periodically as 2025/26 (and later seasons')
  xG sample grows.** n=371 in-band today gives a ~10pp-wide CI — not
  enough to rule out a smaller-but-real xG-mode gap; a larger sample
  could tighten this and change the verdict.

**Secondary, only if fallback usage turns out to be non-trivial:** a
fallback-mode-only (not production-xG-mode) parameter change combining
H2's defence-blend reweighting (80/20 → 50/50, or somewhere between) and
H5's homeAwayRatio delta (+0.05), which together are the only two knobs
tested that reduce the band gap with zero log-loss cost. This would need:
(a) its own dedicated hypothesis test run together (not just independently
as done here) to check they don't interact or double-count, (b) a check
that it doesn't move fit-v1.md's other gate metrics (draw-rate check,
Brier, CLV proxy) out of range, (c) explicit confirmation it's scoped to
fallback mode only and doesn't touch the xG pathway, since Step 2 found
no problem there to fix.

**Not recommended:** any H1 (strength-exponent) change — it doesn't
resolve the gap and costs log loss in the tested direction.

**Not investigated, flagged for a future diagnosis if this is picked up
again:** a `drawInflation`-focused hypothesis test targeting the
mid-range-favourite draw over-allocation found in H4/1b directly, since
that's the best-supported mechanism but wasn't one of the five knobs this
task specified.
