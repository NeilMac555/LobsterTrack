// DIAGNOSTIC-ONLY parameterized copy of valorModel.ts's Steps 0-9
// (1X2 only — no AH/Totals/BTTS/Correct Score, not needed for this
// diagnosis). NEVER imported by production code (frontend or backend).
// Exists solely so docs/calibration/steps23-diagnosis.md's hypothesis
// tests (H1 strength exponent, H2 defence blend, H5 home/away ratio
// delta) can vary knobs that the real, unmodified runModel() does not
// expose as parameters — production pipeline structure is untouched.
//
// At every knob's default value (exponent=1, defenceBlendWeight=0.80,
// homeAwayRatioDelta=0) this function is verified bit-identical to
// runModel() from frontend/src/model/valorModel.ts — see
// verify_experimental_model.ts. If you change this file, re-run that
// verification before trusting any hypothesis-test output.

import type { ModelInputs, ModelParams } from '../frontend/src/model/valorModel';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function logFactorial(n: number) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
function poissonPMF(k: number, lambda: number) {
  if (lambda <= 0) return k === 0 ? 1.0 : 0.0;
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}

const MAX_GOALS = 10;

export interface ExperimentalKnobs {
  // H1: exponent applied to both attack and defence strength ratios
  // (atk^k, def^k) between Steps 2/3 and Step 4. Production = 1.
  strengthExponent: number;
  // H2: weight on the xG-against side of Step 3's defence blend
  // (currently a fixed 80/20 split in production). Production = 0.80.
  defenceBlendWeight: number;
  // H5: added directly to the league's homeAwayRatio (r) before Step
  // 4's homeMult/awayMult split. Production = 0.
  homeAwayRatioDelta: number;
}

export const PRODUCTION_KNOBS: ExperimentalKnobs = {
  strengthExponent: 1,
  defenceBlendWeight: 0.80,
  homeAwayRatioDelta: 0,
};

export interface ExperimentalResult {
  lambdaHome: number;
  lambdaAway: number;
  probHome: number;
  probDraw: number;
  probAway: number;
  // H3: true if the RAW (pre-clamp) lambda for either side fell outside
  // [0.05, 8] and the clamp actually changed the value.
  clampHit: boolean;
}

export function runExperimentalModel(
  inputs: ModelInputs,
  params: ModelParams,
  knobs: ExperimentalKnobs
): ExperimentalResult {
  const lg = params.league;
  const h = inputs.home, a = inputs.away;

  // Step 0
  function penAdjXGFor(t: typeof h) {
    const penXG = (t.penaltiesReceived / Math.max(1, t.matchesPlayed)) * 0.76;
    return Math.max(0, t.xgFor - penXG) + penXG * 0.50;
  }
  function penAdjXGAgainst(t: typeof h) {
    const penXGA = (t.penaltiesConceded / Math.max(1, t.matchesPlayed)) * 0.76;
    return Math.max(0, t.xgAgainst - penXGA) + penXGA * 0.50;
  }
  let exH = penAdjXGFor(h), exA = penAdjXGFor(a);
  let eaH = penAdjXGAgainst(h), eaA = penAdjXGAgainst(a);

  // Step 0b
  const spDiscount = params.spDiscount;
  function applySpDiscount(adjXG: number, openPlay: number, setPiece: number): number {
    if (openPlay > 0 || setPiece > 0) {
      const total = openPlay + setPiece;
      if (total > 0) {
        const discounted = openPlay + (setPiece * spDiscount);
        return adjXG * (discounted / total);
      }
    }
    return adjXG;
  }
  exH = applySpDiscount(exH, h.openPlayXG, h.setPieceXG);
  exA = applySpDiscount(exA, a.openPlayXG, a.setPieceXG);

  // Step 1b
  const qualityWeight = params.qualityWeight;
  const leagueAvgXGPerShot = lg.avgXG / lg.avgShotsPerGame;
  if (h.shotsFor > 0 && qualityWeight > 0) {
    const ratio = (exH / h.shotsFor) / leagueAvgXGPerShot;
    exH *= (1 - qualityWeight) + qualityWeight * ratio;
  }
  if (a.shotsFor > 0 && qualityWeight > 0) {
    const ratio = (exA / a.shotsFor) / leagueAvgXGPerShot;
    exA *= (1 - qualityWeight) + qualityWeight * ratio;
  }
  if (h.shotsAgainst > 0 && qualityWeight > 0) {
    const ratio = (eaH / h.shotsAgainst) / leagueAvgXGPerShot;
    eaH *= (1 - qualityWeight) + qualityWeight * ratio;
  }
  if (a.shotsAgainst > 0 && qualityWeight > 0) {
    const ratio = (eaA / a.shotsAgainst) / leagueAvgXGPerShot;
    eaA *= (1 - qualityWeight) + qualityWeight * ratio;
  }

  // Step 1c
  const formWeight = params.formWeight;
  if (formWeight > 0) {
    if (Math.abs(h.last6XGFor - exH) > 0.001 || Math.abs(h.last6XGAgainst - eaH) > 0.001) {
      exH = (1 - formWeight) * exH + formWeight * h.last6XGFor;
      eaH = (1 - formWeight) * eaH + formWeight * h.last6XGAgainst;
    }
    if (Math.abs(a.last6XGFor - exA) > 0.001 || Math.abs(a.last6XGAgainst - eaA) > 0.001) {
      exA = (1 - formWeight) * exA + formWeight * a.last6XGFor;
      eaA = (1 - formWeight) * eaA + formWeight * a.last6XGAgainst;
    }
  }

  // Step 2: Attack strength (H1 knob applies AFTER this, matching "both
  // strength ratios" — exponentiating the ratio, not the underlying xG).
  const atkHRaw = exH / lg.avgXG, atkARaw = exA / lg.avgXG;

  // Step 3: Defence strength (H2 knob varies the blend weight; production 0.80/0.20).
  const w = knobs.defenceBlendWeight;
  const dbH = w * eaH + (1 - w) * h.goalsAgainst;
  const dbA = w * eaA + (1 - w) * a.goalsAgainst;
  const avgDB = w * lg.avgXG + (1 - w) * lg.avgGoals;
  const defHRaw = dbH / avgDB, defARaw = dbA / avgDB;

  // H1: exponent on strength ratios.
  const k = knobs.strengthExponent;
  const atkH = Math.pow(atkHRaw, k), atkA = Math.pow(atkARaw, k);
  const defH = Math.pow(defHRaw, k), defA = Math.pow(defARaw, k);

  // Step 4: Lambda. H5 knob perturbs r directly.
  const r = lg.homeAwayRatio + knobs.homeAwayRatioDelta;
  const homeMult = (2 * r) / (1 + r);
  const awayMult = 2 / (1 + r);
  const lHRaw = atkH * defA * lg.avgGoalsPerTeam * homeMult;
  const lARaw = atkA * defH * lg.avgGoalsPerTeam * awayMult;
  let lH = clamp(lHRaw, 0.05, 8);
  let lA = clamp(lARaw, 0.05, 8);
  const clampHit = lH !== lHRaw || lA !== lARaw;

  // Step 5b: absence — always 1 in the backtest harness (no historical
  // absence data), so this is a mathematical no-op here, kept for
  // structural fidelity with valorModel.ts.
  const absWt = params.absenceWeight;
  lH *= (1 - ((h.absence - 1) * absWt));
  lA *= (1 + ((h.absence - 1) * absWt));
  lA *= (1 - ((a.absence - 1) * absWt));
  lH *= (1 + ((a.absence - 1) * absWt));
  lH = clamp(lH, 0.05, 8);
  lA = clamp(lA, 0.05, 8);

  // Step 6: Poisson marginals
  const hP: number[] = [], aP: number[] = [];
  for (let kk = 0; kk <= MAX_GOALS; kk++) { hP[kk] = poissonPMF(kk, lH); aP[kk] = poissonPMF(kk, lA); }

  // Step 7: Dixon-Coles
  const rho = params.rho;
  const matrix: number[][] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      let p = hP[i] * aP[j];
      if (i === 0 && j === 0) p *= Math.max(0, 1 - lH * lA * rho);
      else if (i === 1 && j === 0) p *= Math.max(0, 1 + lA * rho);
      else if (i === 0 && j === 1) p *= Math.max(0, 1 + lH * rho);
      else if (i === 1 && j === 1) p *= Math.max(0, 1 - rho);
      matrix[i][j] = p;
    }
  }

  // Step 8: raw 1X2
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i > j) pH += matrix[i][j];
      else if (i === j) pD += matrix[i][j];
      else pA += matrix[i][j];
    }

  // Step 9: draw inflation
  pD *= params.drawInflation;
  const tot = pH + pD + pA;
  pH /= tot; pD /= tot; pA /= tot;

  return { lambdaHome: lH, lambdaAway: lA, probHome: pH, probDraw: pD, probAway: pA, clampHit };
}
