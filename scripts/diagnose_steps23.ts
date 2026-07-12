// Diagnostic-only investigation of the 35-50% home-win underprediction
// found in fit-v1.md. NO model/parameter changes are shipped by this
// script — it only reads Postgres (via railway run) and runs
// experiments through experimental-model.ts (diagnostic-only, never
// imported by production code) and the real, unmodified runModel().
//
//   railway run npx tsx diagnose_steps23.ts

import { buildDataset, type DatasetRow } from './dataset';
import { LEAGUE_PARAMS, CURRENT_ADVANCED_PARAMS, SUPPORTED_LEAGUES, CURRENT_XG_SEASON } from './model-params';
import { runModel } from '../frontend/src/model/valorModel';
import { runExperimentalModel, PRODUCTION_KNOBS, type ExperimentalKnobs } from './experimental-model';
import { calibrationTable, score1X2, type OutcomeSample3 } from './scoring';
import { closePool } from './db';

interface Row {
  modelHome: number; modelDraw: number; modelAway: number;
  actual: 'home' | 'draw' | 'away';
  lambdaHome: number; lambdaAway: number;
}

function computeRows(dataset: DatasetRow[]): Row[] {
  return dataset.map((d) => {
    const lg = LEAGUE_PARAMS[d.league];
    const out = runModel(d.inputs, { league: lg, ...CURRENT_ADVANCED_PARAMS });
    return {
      modelHome: out.probHome, modelDraw: out.probDraw, modelAway: out.probAway,
      actual: d.actual, lambdaHome: out.lambdaHome, lambdaAway: out.lambdaAway,
    };
  });
}

// Normal-approximation 95% CI on an observed proportion. Fine for the
// bucket sizes here (report exact n alongside so the reader can judge
// small-sample buckets themselves).
function wilsonCI(observed: number, n: number): [number, number] {
  if (n === 0) return [NaN, NaN];
  const z = 1.96;
  const phat = observed;
  const denom = 1 + (z * z) / n;
  const center = phat + (z * z) / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));
  return [(center - margin) / denom, (center + margin) / denom];
}

function calWithCI(probs: number[], indicators: boolean[], bucketWidthPct: number) {
  return calibrationTable(probs, indicators, bucketWidthPct).map((b) => {
    const [lo, hi] = wilsonCI(b.observedFrequency, b.n);
    return { ...b, ci95Low: lo, ci95High: hi, gap: b.observedFrequency - b.meanPredicted };
  });
}

// Identify contiguous buckets where the model is meaningfully wrong:
// |gap| > 0.05 and n >= 15 (avoid flagging noise from tiny buckets).
function findMiscalibratedBand(table: ReturnType<typeof calWithCI>) {
  const flagged = table.filter((b) => Math.abs(b.gap) > 0.05 && b.n >= 15);
  if (flagged.length === 0) return null;
  return { low: Math.min(...flagged.map((b) => b.bucketLow)), high: Math.max(...flagged.map((b) => b.bucketHigh)), buckets: flagged };
}

async function main() {
  console.error('Building EPL fallback dataset (the 4 fit/holdout seasons pooled: 2122/2223/2324/2425)...');
  // Deliberately excludes 2526 — that season has real xG data and is
  // covered separately by the PRIMARY xG dataset below; pooling it into
  // fallback mode here would mix a season this diagnosis has no
  // business scoring in fallback mode into the "known-good" EPL sample.
  const FIT_HOLDOUT_SEASONS = ['2122', '2223', '2324', '2425'];
  const eplAll = await buildDataset('soccer_epl', 'fallback', (s) => FIT_HOLDOUT_SEASONS.includes(s));
  console.error(`EPL fallback pooled: ${eplAll.length} matches`);

  console.error('Building PRIMARY xG dataset (5 leagues pooled, 2025/26)...');
  const xgDatasets = await Promise.all(
    SUPPORTED_LEAGUES.map((lg) => buildDataset(lg, 'xg', (s) => s === '2526', CURRENT_XG_SEASON))
  );
  const xgAll = xgDatasets.flat();
  console.error(`PRIMARY xG pooled: ${xgAll.length} matches`);

  // ===== STEP 1: characterise on EPL fallback =====
  const eplRows = computeRows(eplAll);
  const eplHomeCal = calWithCI(eplRows.map((r) => r.modelHome), eplRows.map((r) => r.actual === 'home'), 2.5);
  const eplDrawCal = calWithCI(eplRows.map((r) => r.modelDraw), eplRows.map((r) => r.actual === 'draw'), 2.5);
  const eplAwayCal = calWithCI(eplRows.map((r) => r.modelAway), eplRows.map((r) => r.actual === 'away'), 2.5);

  // Auto-detected significant buckets (n>=15, |gap|>5pp) — reported for
  // Step 1a's "where exactly" question, but NOT used to define the band
  // for Step 1b/Step 3 below. At 2.5pp resolution individual buckets are
  // noisier (half the n of the original 5pp buckets fit-v1.md flagged),
  // so auto-detection here is unstable — see the full table + CI
  // significance flags in the report for the honest picture.
  const autoDetected = findMiscalibratedBand(eplHomeCal);
  console.error('Auto-detected flagged buckets (informational only):', JSON.stringify(autoDetected?.buckets.map(b => ({ lo: b.bucketLow, hi: b.bucketHigh, n: b.n, gap: b.gap }))));

  // The band this diagnosis actually targets: 35-50%, matching
  // fit-v1.md's original 5pp-resolution finding and the TODO.md task.
  const band = { low: 0.35, high: 0.50 };

  let bandDecomposition = null;
  if (band) {
    const inBand = eplRows.filter((r) => r.modelHome >= band.low && r.modelHome < band.high);
    const n = inBand.length;
    bandDecomposition = {
      n,
      band: [band.low, band.high],
      meanPredictedHome: inBand.reduce((s, r) => s + r.modelHome, 0) / n,
      meanPredictedDraw: inBand.reduce((s, r) => s + r.modelDraw, 0) / n,
      meanPredictedAway: inBand.reduce((s, r) => s + r.modelAway, 0) / n,
      actualHomeRate: inBand.filter((r) => r.actual === 'home').length / n,
      actualDrawRate: inBand.filter((r) => r.actual === 'draw').length / n,
      actualAwayRate: inBand.filter((r) => r.actual === 'away').length / n,
    };
  }

  // ===== STEP 2: check PRIMARY xG mode for the same band =====
  const xgRows = computeRows(xgAll);
  const xgHomeCal = calWithCI(xgRows.map((r) => r.modelHome), xgRows.map((r) => r.actual === 'home'), 2.5);
  const xgBand = findMiscalibratedBand(xgHomeCal);
  // Also report the SAME band range found in fallback mode, evaluated
  // on xG data (even if it doesn't independently trigger the n>=15
  // flag threshold — small xG sample may not).
  let xgSameBandCheck = null;
  if (band) {
    const inBand = xgRows.filter((r) => r.modelHome >= band.low && r.modelHome < band.high);
    const n = inBand.length;
    if (n > 0) {
      const observedHome = inBand.filter((r) => r.actual === 'home').length / n;
      const meanPred = inBand.reduce((s, r) => s + r.modelHome, 0) / n;
      const [ciLo, ciHi] = wilsonCI(observedHome, n);
      xgSameBandCheck = { n, band: [band.low, band.high], meanPredicted: meanPred, observedFrequency: observedHome, ci95: [ciLo, ciHi] };
    }
  }

  // ===== STEP 3: hypothesis tests (EPL fallback data) =====
  function experimentalRows(knobs: ExperimentalKnobs): Row[] {
    return eplAll.map((d) => {
      const lg = LEAGUE_PARAMS[d.league];
      const out = runExperimentalModel(d.inputs, { league: lg, ...CURRENT_ADVANCED_PARAMS }, knobs);
      return { modelHome: out.probHome, modelDraw: out.probDraw, modelAway: out.probAway, actual: d.actual, lambdaHome: out.lambdaHome, lambdaAway: out.lambdaAway };
    });
  }
  function bandGapFor(rows: Row[]): { gap: number; n: number; overallLogLoss: number } | null {
    if (!band) return null;
    const inBand = rows.filter((r) => r.modelHome >= band.low && r.modelHome < band.high);
    const n = inBand.length;
    const observed = inBand.filter((r) => r.actual === 'home').length / n;
    const predicted = inBand.reduce((s, r) => s + r.modelHome, 0) / n;
    const samples: OutcomeSample3[] = rows.map((r) => ({ modelHome: r.modelHome, modelDraw: r.modelDraw, modelAway: r.modelAway, actual: r.actual }));
    const overallLogLoss = score1X2(samples, 'model').logLoss;
    return { gap: observed - predicted, n, overallLogLoss };
  }

  const baselineRows = experimentalRows(PRODUCTION_KNOBS);
  const baselineBandGap = bandGapFor(baselineRows);

  // H1: strength exponent (as specified — k>1 spreads strength ratios
  // further from 1, i.e. makes favourites MORE extreme).
  const h1Results = [1.1, 1.2, 1.3, 1.4].map((k) => {
    const rows = experimentalRows({ ...PRODUCTION_KNOBS, strengthExponent: k });
    return { k, ...bandGapFor(rows) };
  });
  // Supplementary, NOT in the original H1 spec: the full calibration
  // table (see report) shows strong favourites (55-90% predicted) are
  // OVERpredicted while this 35-50% band is UNDERpredicted — the
  // opposite-direction signature of k<1 (compress strengths toward 1),
  // not k>1. Testing both directions rather than assuming H1's stated
  // range is the only one worth checking.
  const h1SupplementaryResults = [0.7, 0.8, 0.9].map((k) => {
    const rows = experimentalRows({ ...PRODUCTION_KNOBS, strengthExponent: k });
    return { k, ...bandGapFor(rows) };
  });

  // H2: defence blend weight (1.0=100/0, 0.6=60/40, 0.5=50/50)
  const h2Results = [1.0, 0.6, 0.5].map((w) => {
    const rows = experimentalRows({ ...PRODUCTION_KNOBS, defenceBlendWeight: w });
    return { defenceBlendWeight: w, ...bandGapFor(rows) };
  });

  // H3: clamp hits
  const clampCheck = eplAll.map((d) => {
    const lg = LEAGUE_PARAMS[d.league];
    const out = runExperimentalModel(d.inputs, { league: lg, ...CURRENT_ADVANCED_PARAMS }, PRODUCTION_KNOBS);
    return out.clampHit;
  });
  const clampHitCount = clampCheck.filter(Boolean).length;

  // H4: draw mass in the band (from Step 1 decomposition directly)
  // — no separate computation needed, cross-referenced in the report.

  // H5: homeAwayRatio delta
  const h5Results = [-0.05, -0.025, 0.025, 0.05].map((delta) => {
    const rows = experimentalRows({ ...PRODUCTION_KNOBS, homeAwayRatioDelta: delta });
    return { homeAwayRatioDelta: delta, ...bandGapFor(rows) };
  });

  const result = {
    step1: {
      eplPooledN: eplAll.length,
      eplHomeCalibration: eplHomeCal,
      eplDrawCalibration: eplDrawCal,
      eplAwayCalibration: eplAwayCal,
      autoDetectedFlaggedBuckets: autoDetected,
      targetBand: band,
      bandDecomposition,
    },
    step2: {
      xgPooledN: xgAll.length,
      xgHomeCalibration: xgHomeCal,
      xgOwnBandFlag: xgBand,
      xgSameBandAsEplCheck: xgSameBandCheck,
    },
    step3: {
      baselineBandGap,
      h1StrengthExponent: h1Results,
      h1SupplementaryCompression: h1SupplementaryResults,
      h2DefenceBlend: h2Results,
      h3ClampHits: { totalMatches: eplAll.length, clampHitCount },
      h5HomeAwayRatioDelta: h5Results,
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => closePool());
