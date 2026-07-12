// Fits rho, drawInflation, and (advisory) formWeight against historical
// EPL data. Does NOT change any pipeline structure — only searches over
// parameter VALUES passed into the existing, unmodified runModel().
//
//   railway run npx tsx fit.ts
//
// Data plan (per the task):
//   FIT SET   — EPL fallback mode, seasons 2122/2223/2324
//   HOLDOUT 1 — EPL fallback mode, season 2425 (never touched while fitting)
//   HOLDOUT 2 — PRIMARY xG mode, 2025/26, all 5 leagues (never touched
//               while fitting; transfer check only)

import { buildDataset, type DatasetRow } from './dataset';
import { LEAGUE_PARAMS, CURRENT_ADVANCED_PARAMS, SUPPORTED_LEAGUES, CURRENT_XG_SEASON } from './model-params';
import { runModel } from '../frontend/src/model/valorModel';
import { score1X2, calibrationTable, clvProxy1X2, type OutcomeSample3 } from './scoring';
import { closePool } from './db';

interface AdvParams {
  drawInflation: number;
  rho: number;
  formWeight: number;
  spDiscount: number;
  qualityWeight: number;
  absenceWeight: number;
}

function pooledLogLoss(dataset: DatasetRow[], adv: AdvParams): number {
  const EPS = 1e-12;
  let sum = 0;
  for (const row of dataset) {
    const lg = LEAGUE_PARAMS[row.league];
    const out = runModel(row.inputs, { league: lg, ...adv });
    const p = row.actual === 'home' ? out.probHome : row.actual === 'draw' ? out.probDraw : out.probAway;
    sum += -Math.log(Math.max(EPS, Math.min(1 - EPS, p)));
  }
  return sum / dataset.length;
}

function toOutcomeSamples(dataset: DatasetRow[], adv: AdvParams): OutcomeSample3[] {
  return dataset.map((row) => {
    const lg = LEAGUE_PARAMS[row.league];
    const out = runModel(row.inputs, { league: lg, ...adv });
    const sample: OutcomeSample3 = {
      modelHome: out.probHome, modelDraw: out.probDraw, modelAway: out.probAway, actual: row.actual,
    };
    if (row.priceSource !== 'missing' && row.psch !== null && row.pscd !== null && row.psca !== null) {
      const ra = 1 / row.psch, rb = 1 / row.pscd, rc = 1 / row.psca;
      const sum = ra + rb + rc;
      sample.closeHome = ra / sum; sample.closeDraw = rb / sum; sample.closeAway = rc / sum;
      sample.closeOddsHome = row.psch; sample.closeOddsDraw = row.pscd; sample.closeOddsAway = row.psca;
    }
    return sample;
  });
}

function drawStatsOf(samples: OutcomeSample3[]) {
  const n = samples.length;
  const meanPredictedDraw = n ? samples.reduce((s, x) => s + x.modelDraw, 0) / n : NaN;
  const actualDrawRate = n ? samples.filter((x) => x.actual === 'draw').length / n : NaN;
  return { n, meanPredictedDraw, actualDrawRate, gap: Math.abs(meanPredictedDraw - actualDrawRate) };
}

function range(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  // Round to avoid float accumulation drift (e.g. 0.1 + 0.01 !== 0.11).
  const decimals = Math.max(
    (step.toString().split('.')[1] || '').length,
    (lo.toString().split('.')[1] || '').length
  );
  const mul = 10 ** decimals;
  for (let v = Math.round(lo * mul); v <= Math.round(hi * mul); v += Math.round(step * mul)) {
    out.push(v / mul);
  }
  return out;
}

async function main() {
  console.error('Building datasets...');
  const fitSet = await buildDataset('soccer_epl', 'fallback', (s) => ['2122', '2223', '2324'].includes(s));
  const holdout1 = await buildDataset('soccer_epl', 'fallback', (s) => s === '2425');

  const holdout2ByLeague: Record<string, DatasetRow[]> = {};
  for (const league of SUPPORTED_LEAGUES) {
    holdout2ByLeague[league] = await buildDataset(league, 'xg', (s) => s === '2526', CURRENT_XG_SEASON);
  }
  const holdout2Pooled = Object.values(holdout2ByLeague).flat();

  // ===== Verification 1: prove no overlap =====
  const dateRange = (ds: DatasetRow[]) => ({
    n: ds.length,
    minDate: ds.length ? ds.reduce((m, r) => (r.matchDate < m ? r.matchDate : m), ds[0].matchDate) : null,
    maxDate: ds.length ? ds.reduce((m, r) => (r.matchDate > m ? r.matchDate : m), ds[0].matchDate) : null,
    seasons: [...new Set(ds.map((r) => r.matchDate.slice(0, 4)))].sort(),
  });
  const proof = {
    fitSet: dateRange(fitSet),
    holdout1: dateRange(holdout1),
    holdout2Pooled: dateRange(holdout2Pooled),
  };
  console.error('Date-range proof:', JSON.stringify(proof, null, 2));

  // ===== Coarse grid: rho x drawInflation, formWeight held at production =====
  console.error(`Fit set size: ${fitSet.length}. Starting coarse grid search...`);
  const rhoCoarse = range(-0.10, 0.10, 0.01);
  const drawInflCoarse = range(0.90, 1.20, 0.02);
  let coarseSurface: { rho: number; drawInflation: number; logLoss: number }[] = [];
  for (const rho of rhoCoarse) {
    for (const drawInflation of drawInflCoarse) {
      const adv: AdvParams = { ...CURRENT_ADVANCED_PARAMS, rho, drawInflation };
      const ll = pooledLogLoss(fitSet, adv);
      coarseSurface.push({ rho, drawInflation, logLoss: ll });
    }
  }
  const coarseBest = coarseSurface.reduce((a, b) => (b.logLoss < a.logLoss ? b : a));
  console.error('Coarse best:', JSON.stringify(coarseBest));

  // ===== Fine grid around coarse optimum =====
  const rhoFine = range(
    Math.round((coarseBest.rho - 0.02) * 1000) / 1000,
    Math.round((coarseBest.rho + 0.02) * 1000) / 1000,
    0.002
  );
  const drawInflFine = range(
    Math.round((coarseBest.drawInflation - 0.04) * 1000) / 1000,
    Math.round((coarseBest.drawInflation + 0.04) * 1000) / 1000,
    0.005
  );
  let fineSurface: { rho: number; drawInflation: number; logLoss: number }[] = [];
  for (const rho of rhoFine) {
    for (const drawInflation of drawInflFine) {
      const adv: AdvParams = { ...CURRENT_ADVANCED_PARAMS, rho, drawInflation };
      const ll = pooledLogLoss(fitSet, adv);
      fineSurface.push({ rho, drawInflation, logLoss: ll });
    }
  }
  const fineBest = fineSurface.reduce((a, b) => (b.logLoss < a.logLoss ? b : a));
  console.error('Fine best:', JSON.stringify(fineBest));

  // ===== Decision rule: snap drawInflation to 1.0 if within [0.98, 1.02] =====
  let fittedRho = fineBest.rho;
  let fittedDrawInflation = fineBest.drawInflation;
  let snappedTo1 = false;
  if (fittedDrawInflation >= 0.98 && fittedDrawInflation <= 1.02) {
    fittedDrawInflation = 1.0;
    snappedTo1 = true;
  }
  const logLossAtFitted = pooledLogLoss(fitSet, { ...CURRENT_ADVANCED_PARAMS, rho: fittedRho, drawInflation: fittedDrawInflation });

  // Flatness characterization: how many grid points within 0.5% relative
  // of the minimum (both coarse and fine surfaces).
  const flatnessThreshold = fineBest.logLoss * 1.005;
  const nearOptimalFine = fineSurface.filter((p) => p.logLoss <= flatnessThreshold);
  const rhoSpread = nearOptimalFine.length
    ? [Math.min(...nearOptimalFine.map((p) => p.rho)), Math.max(...nearOptimalFine.map((p) => p.rho))]
    : null;
  const drawInflSpread = nearOptimalFine.length
    ? [Math.min(...nearOptimalFine.map((p) => p.drawInflation)), Math.max(...nearOptimalFine.map((p) => p.drawInflation))]
    : null;

  // ===== formWeight grid, holding rho/drawInflation fixed at fitted values =====
  console.error('Fitting formWeight...');
  const formWeightGrid = range(0, 0.50, 0.05);
  let formWeightSurface: { formWeight: number; logLoss: number }[] = [];
  for (const formWeight of formWeightGrid) {
    const adv: AdvParams = { ...CURRENT_ADVANCED_PARAMS, rho: fittedRho, drawInflation: fittedDrawInflation, formWeight };
    formWeightSurface.push({ formWeight, logLoss: pooledLogLoss(fitSet, adv) });
  }
  const formWeightBest = formWeightSurface.reduce((a, b) => (b.logLoss < a.logLoss ? b : a));

  // ===== Diagnostic: does the 35-50% home-win underprediction survive? =====
  const prodSamplesFitSet = toOutcomeSamples(fitSet, CURRENT_ADVANCED_PARAMS);
  const fittedAdvForDiag: AdvParams = { ...CURRENT_ADVANCED_PARAMS, rho: fittedRho, drawInflation: fittedDrawInflation };
  const fittedSamplesFitSet = toOutcomeSamples(fitSet, fittedAdvForDiag);
  const prodCalHome = calibrationTable(prodSamplesFitSet.map((s) => s.modelHome), prodSamplesFitSet.map((s) => s.actual === 'home'));
  const fittedCalHome = calibrationTable(fittedSamplesFitSet.map((s) => s.modelHome), fittedSamplesFitSet.map((s) => s.actual === 'home'));
  const bucket3540Prod = prodCalHome.find((b) => Math.abs(b.bucketLow - 0.35) < 1e-9);
  const bucket4045Prod = prodCalHome.find((b) => Math.abs(b.bucketLow - 0.40) < 1e-9);
  const bucket3540Fitted = fittedCalHome.find((b) => Math.abs(b.bucketLow - 0.35) < 1e-9);
  const bucket4045Fitted = fittedCalHome.find((b) => Math.abs(b.bucketLow - 0.40) < 1e-9);

  // ===== Final evaluation (run ONCE) =====
  const finalAdv: AdvParams = { ...CURRENT_ADVANCED_PARAMS, rho: fittedRho, drawInflation: fittedDrawInflation };
  // formWeight is advisory-only per the protocol — NOT folded into finalAdv
  // unless it later passes the "compelling AND improves Holdout 2" bar,
  // decided after seeing these numbers. Report formWeightBest separately.

  function evalOn(dataset: DatasetRow[], adv: AdvParams) {
    const samples = toOutcomeSamples(dataset, adv);
    return {
      n: samples.length,
      modelScore: score1X2(samples, 'model'),
      closeScore: score1X2(samples, 'close'),
      drawStats: drawStatsOf(samples),
      clv: clvProxy1X2(samples),
      calibrationHome: calibrationTable(samples.map((s) => s.modelHome), samples.map((s) => s.actual === 'home')),
      calibrationDraw: calibrationTable(samples.map((s) => s.modelDraw), samples.map((s) => s.actual === 'draw')),
    };
  }

  const holdout1Fitted = evalOn(holdout1, finalAdv);
  const holdout1Prod = evalOn(holdout1, CURRENT_ADVANCED_PARAMS);

  const holdout2Fitted = evalOn(holdout2Pooled, finalAdv);
  const holdout2Prod = evalOn(holdout2Pooled, CURRENT_ADVANCED_PARAMS);

  const holdout2ByLeagueFitted: Record<string, ReturnType<typeof evalOn>> = {};
  const holdout2ByLeagueProd: Record<string, ReturnType<typeof evalOn>> = {};
  for (const [league, ds] of Object.entries(holdout2ByLeague)) {
    holdout2ByLeagueFitted[league] = evalOn(ds, finalAdv);
    holdout2ByLeagueProd[league] = evalOn(ds, CURRENT_ADVANCED_PARAMS);
  }

  // ===== Acceptance rules =====
  const holdout1LogLossImproves = holdout1Fitted.modelScore.logLoss < holdout1Prod.modelScore.logLoss;
  const holdout2LogLossNotDegraded = holdout2Fitted.modelScore.logLoss <= holdout2Prod.modelScore.logLoss;
  const holdout1DrawNotWorse = holdout1Fitted.drawStats.gap <= holdout1Prod.drawStats.gap;
  const holdout2DrawNotWorse = holdout2Fitted.drawStats.gap <= holdout2Prod.drawStats.gap;
  const accepted = holdout1LogLossImproves && holdout2LogLossNotDegraded && holdout1DrawNotWorse && holdout2DrawNotWorse;

  const result = {
    proof,
    fitSetSize: fitSet.length,
    coarseGrid: { rhoValues: rhoCoarse, drawInflationValues: drawInflCoarse, best: coarseBest, surface: coarseSurface },
    fineGrid: { rhoValues: rhoFine, drawInflationValues: drawInflFine, best: fineBest, surface: fineSurface },
    fitted: { rho: fittedRho, drawInflation: fittedDrawInflation, snappedTo1, logLossAtFitted },
    flatness: { thresholdLogLoss: flatnessThreshold, nearOptimalCount: nearOptimalFine.length, totalFinePoints: fineSurface.length, rhoSpread, drawInflSpread },
    formWeight: { grid: formWeightSurface, best: formWeightBest, currentProduction: CURRENT_ADVANCED_PARAMS.formWeight },
    diagnostic3550: {
      production: { bucket3540: bucket3540Prod, bucket4045: bucket4045Prod },
      fitted: { bucket3540: bucket3540Fitted, bucket4045: bucket4045Fitted },
    },
    holdout1: { fitted: holdout1Fitted, production: holdout1Prod },
    holdout2Pooled: { fitted: holdout2Fitted, production: holdout2Prod },
    holdout2ByLeague: { fitted: holdout2ByLeagueFitted, production: holdout2ByLeagueProd },
    acceptance: {
      holdout1LogLossImproves, holdout2LogLossNotDegraded, holdout1DrawNotWorse, holdout2DrawNotWorse, accepted,
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => closePool());
