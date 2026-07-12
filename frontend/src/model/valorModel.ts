// ===== VALOR MODEL =====
// Pure calculation core of the SteamWatch Match Predictor (Dixon-Coles
// adjusted Poisson), extracted from MatchPredictorPage.tsx so it can be
// shared between the frontend page and the Node backtest harness
// (scripts/backtest.ts). No React, no DOM, no string parsing — every
// input here is already a number. The page is responsible for parsing
// its string form fields (via its own `v()`) before calling runModel();
// that parsing step happens at the exact same point in the pipeline it
// always did, so behaviour is unchanged.
//
// Step numbering matches the comments that used to live in
// MatchPredictorPage.tsx's calculate() — Steps 1 (red cards) and 5
// (motivation) were deleted entirely in an earlier change, so there are
// deliberate gaps between Step 0b/1b and Step 4/5b. Do not renumber.
//
// Step 9 (scalar 1X2 draw inflation) and Step 10 (cell-by-cell market
// matrix) are DELIBERATELY independent computations that both read the
// raw Step 7 matrix — Step 10 does not read Step 9's output and Step 9
// does not read Step 10's. Do not couple or "tidy" them; this was
// verified and confirmed correct (mathematically identical, differing
// only by IEEE-754 floating point rounding noise on the order of 1e-16).

export const MAX_GOALS = 10;

export interface TeamModelInputs {
  goalsAgainst: number;
  xgFor: number;
  xgAgainst: number;
  matchesPlayed: number;
  penaltiesReceived: number;
  penaltiesConceded: number;
  // Advanced inputs — 0 means "not provided", which is exactly how a
  // blank form field parses. Step 0b and Step 1b treat 0 as "skip".
  shotsFor: number;
  shotsAgainst: number;
  openPlayXG: number;
  setPieceXG: number;
  last6XGFor: number;
  last6XGAgainst: number;
  // 1 = None, 3 = Weakened, 5 = Severely weakened — applied equally to
  // this team's attack and defence via absenceWeight (Step 5b).
  absence: number;
}

export interface ModelInputs {
  home: TeamModelInputs;
  away: TeamModelInputs;
}

export interface LeagueParams {
  avgGoals: number;
  avgXG: number;
  avgShotsPerGame: number;
  avgGoalsPerTeam: number;
  homeAwayRatio: number;
}

export interface ModelParams {
  league: LeagueParams;
  drawInflation: number;
  rho: number;
  formWeight: number;
  spDiscount: number;
  qualityWeight: number;
  absenceWeight: number;
}

export interface AbsenceNote {
  team: 'home' | 'away';
  severity: number;
  pct: string;
}

export interface AHRow {
  line: number;
  homeProb: number;
  pushProb: number;
  awayProb: number;
  homeOdds: number | null;
  awayOdds: number | null;
}

export interface TotalsRow {
  line: number;
  overProb: number;
  pushProb: number;
  underProb: number;
  overOdds: number | null;
  underOdds: number | null;
}

export interface CorrectScoreRow {
  home: number;
  away: number;
  prob: number;
}

export interface ModelOutput {
  lambdaHome: number;
  lambdaAway: number;
  // Step 7 output — raw Dixon-Coles matrix, pre draw-inflation.
  matrix: number[][];
  // Step 10 output — post draw-inflation, renormalised. Everything
  // below (ahRows, totalsRows, bttsYesProb, correctScores) is derived
  // from this, not from `matrix`.
  marketMatrix: number[][];
  probHome: number;
  probDraw: number;
  probAway: number;
  absenceNotes: AbsenceNote[];
  calcLog: string[];
  ahRows: AHRow[];
  ahClosestLine: number;
  totalsRows: TotalsRow[];
  totalsClosestLine: number;
  bttsYesProb: number;
  bttsNoProb: number;
  bttsYesOdds: number | null;
  bttsNoOdds: number | null;
  correctScores: CorrectScoreRow[];
}

// ===== MATH =====
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function logFactorial(n: number) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
function poissonPMF(k: number, lambda: number) {
  if (lambda <= 0) return k === 0 ? 1.0 : 0.0;
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}

// ===== ASIAN HANDICAP / TOTALS / BTTS / CORRECT SCORE =====
// Derived from the 11x11 scoreline matrix computed at Step 7 (Dixon-Coles).
// Does not read or modify any Step 0-9 variable other than the matrix
// itself (read-only).
export const AH_LINES = [-2.5, -2.25, -2, -1.75, -1.5, -1.25, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
export const TOTALS_LINES = [1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.5];

// A line is "whole" (integer, push possible), "half" (x.5, no push), or
// "quarter" (x.25/x.75, settled as a 50/50 split across its two whole/half
// neighbours per standard sportsbook quarter-line settlement).
function classifyLine(line: number): 'whole' | 'half' | 'quarter' {
  const q = Math.round(Math.abs(line * 4)) % 4;
  if (q === 0) return 'whole';
  if (q === 2) return 'half';
  return 'quarter';
}

// Settles one Asian Handicap line (home team gets `line`) against the
// market matrix. d = home goals - away goals. Home covers if d+line>0,
// pushes if d+line===0 (only reachable for whole lines since d is an
// integer), away covers if d+line<0.
function settleAH(matrix: number[][], line: number): { home: number; push: number; away: number } {
  let home = 0, push = 0, away = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = matrix[i][j];
      const x = (i - j) + line;
      if (x > 0) home += p;
      else if (x === 0) push += p;
      else away += p;
    }
  }
  return { home, push, away };
}

// Settles one Totals line against the market matrix. t = home + away
// goals. Over covers if t-line>0, pushes if t-line===0 (whole lines
// only), under covers if t-line<0.
function settleTotals(matrix: number[][], line: number): { over: number; push: number; under: number } {
  let over = 0, push = 0, under = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = matrix[i][j];
      const x = (i + j) - line;
      if (x > 0) over += p;
      else if (x === 0) push += p;
      else under += p;
    }
  }
  return { over, push, under };
}

function ahOutcome(matrix: number[][], line: number): { home: number; push: number; away: number } {
  if (classifyLine(line) !== 'quarter') return settleAH(matrix, line);
  const lo = settleAH(matrix, line - 0.25);
  const hi = settleAH(matrix, line + 0.25);
  return { home: (lo.home + hi.home) / 2, push: (lo.push + hi.push) / 2, away: (lo.away + hi.away) / 2 };
}

function totalsOutcome(matrix: number[][], line: number): { over: number; push: number; under: number } {
  if (classifyLine(line) !== 'quarter') return settleTotals(matrix, line);
  const lo = settleTotals(matrix, line - 0.25);
  const hi = settleTotals(matrix, line + 0.25);
  return { over: (lo.over + hi.over) / 2, push: (lo.push + hi.push) / 2, under: (lo.under + hi.under) / 2 };
}

// Fair decimal odds from a cover probability and its push probability.
// (1-push)/cover collapses to 1/cover when push is 0, so this formula is
// used uniformly for push and no-push lines alike. Returns null (render
// as "-") for a ~zero-probability side rather than an Infinity odds.
function fairOdds(coverProb: number, pushProb: number): number | null {
  if (coverProb <= 1e-9) return null;
  return (1 - pushProb) / coverProb;
}

export function runModel(inputs: ModelInputs, params: ModelParams): ModelOutput {
  const lg = params.league;
  const h = inputs.home, a = inputs.away;
  const log: string[] = [];

  // Step 0: Penalty xG Adjustment
  function penAdjXGFor(t: TeamModelInputs) {
    const penXG = (t.penaltiesReceived / Math.max(1, t.matchesPlayed)) * 0.76;
    return Math.max(0, t.xgFor - penXG) + penXG * 0.50;
  }
  function penAdjXGAgainst(t: TeamModelInputs) {
    const penXGA = (t.penaltiesConceded / Math.max(1, t.matchesPlayed)) * 0.76;
    return Math.max(0, t.xgAgainst - penXGA) + penXGA * 0.50;
  }

  let exH = penAdjXGFor(h), exA = penAdjXGFor(a);
  let eaH = penAdjXGAgainst(h), eaA = penAdjXGAgainst(a);
  log.push(`Step 0 — Pen xG Adj: H_atk=${exH.toFixed(3)} A_atk=${exA.toFixed(3)} H_def=${eaH.toFixed(3)} A_def=${eaA.toFixed(3)}`);

  // Step 0b: Set Piece xG Discount (attack side only)
  const spDiscount = params.spDiscount;
  function applySpDiscount(adjXG: number, openPlay: number, setPiece: number): [number, boolean] {
    if (openPlay > 0 || setPiece > 0) {
      const total = openPlay + setPiece;
      if (total > 0) {
        const discounted = openPlay + (setPiece * spDiscount);
        return [adjXG * (discounted / total), true];
      }
    }
    return [adjXG, false];
  }
  const [exH2, spAppliedH] = applySpDiscount(exH, h.openPlayXG, h.setPieceXG);
  const [exA2, spAppliedA] = applySpDiscount(exA, a.openPlayXG, a.setPieceXG);
  exH = exH2; exA = exA2;
  if (spAppliedH || spAppliedA) {
    log.push(`Step 0b — SP Discount (${spDiscount}): H_atk=${exH.toFixed(3)} A_atk=${exA.toFixed(3)}`);
  } else {
    log.push(`Step 0b — SP Discount: SKIPPED — no component breakdown`);
  }

  // Step 1b: xG Per Shot Quality Modifier
  const qualityWeight = params.qualityWeight;
  const leagueAvgXGPerShot = lg.avgXG / lg.avgShotsPerGame;
  const shotsForH = h.shotsFor, shotsForA = a.shotsFor;
  const shotsAgainstH = h.shotsAgainst, shotsAgainstA = a.shotsAgainst;

  if (shotsForH > 0 && qualityWeight > 0) {
    const xgpsH = exH / shotsForH;
    const qRatioH = xgpsH / leagueAvgXGPerShot;
    const qModH = (1 - qualityWeight) + qualityWeight * qRatioH;
    exH *= qModH;
    log.push(`Step 1b — Quality (H atk): xG/shot=${xgpsH.toFixed(4)} ratio=${qRatioH.toFixed(3)} mod=${qModH.toFixed(3)}`);
  }
  if (shotsForA > 0 && qualityWeight > 0) {
    const xgpsA = exA / shotsForA;
    const qRatioA = xgpsA / leagueAvgXGPerShot;
    const qModA = (1 - qualityWeight) + qualityWeight * qRatioA;
    exA *= qModA;
    log.push(`Step 1b — Quality (A atk): xG/shot=${xgpsA.toFixed(4)} ratio=${qRatioA.toFixed(3)} mod=${qModA.toFixed(3)}`);
  }
  if (shotsAgainstH > 0 && qualityWeight > 0) {
    const xgpsDefH = eaH / shotsAgainstH;
    const qRatioDefH = xgpsDefH / leagueAvgXGPerShot;
    const qModDefH = (1 - qualityWeight) + qualityWeight * qRatioDefH;
    eaH *= qModDefH;
    log.push(`Step 1b — Quality (H def): xG/shot=${xgpsDefH.toFixed(4)} ratio=${qRatioDefH.toFixed(3)} mod=${qModDefH.toFixed(3)}`);
  }
  if (shotsAgainstA > 0 && qualityWeight > 0) {
    const xgpsDefA = eaA / shotsAgainstA;
    const qRatioDefA = xgpsDefA / leagueAvgXGPerShot;
    const qModDefA = (1 - qualityWeight) + qualityWeight * qRatioDefA;
    eaA *= qModDefA;
    log.push(`Step 1b — Quality (A def): xG/shot=${xgpsDefA.toFixed(4)} ratio=${qRatioDefA.toFixed(3)} mod=${qModDefA.toFixed(3)}`);
  }
  if (qualityWeight === 0) log.push(`Step 1b — Quality: SKIPPED — weight is 0`);

  // Step 1c: Form Weighting (Last 6 Blend)
  const formWeight = params.formWeight;
  const l6xgfH = h.last6XGFor, l6xgaH = h.last6XGAgainst;
  const l6xgfA = a.last6XGFor, l6xgaA = a.last6XGAgainst;

  let formApplied = false;
  if (formWeight > 0) {
    if (Math.abs(l6xgfH - exH) > 0.001 || Math.abs(l6xgaH - eaH) > 0.001) {
      exH = (1 - formWeight) * exH + formWeight * l6xgfH;
      eaH = (1 - formWeight) * eaH + formWeight * l6xgaH;
      formApplied = true;
    }
    if (Math.abs(l6xgfA - exA) > 0.001 || Math.abs(l6xgaA - eaA) > 0.001) {
      exA = (1 - formWeight) * exA + formWeight * l6xgfA;
      eaA = (1 - formWeight) * eaA + formWeight * l6xgaA;
      formApplied = true;
    }
  }
  if (formApplied) {
    log.push(`Step 1c — Form (${formWeight}): H_atk=${exH.toFixed(3)} H_def=${eaH.toFixed(3)} A_atk=${exA.toFixed(3)} A_def=${eaA.toFixed(3)}`);
  } else {
    log.push(`Step 1c — Form: SKIPPED — values match season data`);
  }

  // Step 2: Attack strength
  const atkH = exH / lg.avgXG, atkA = exA / lg.avgXG;
  log.push(`Step 2 — Attack Strength: H=${atkH.toFixed(3)} A=${atkA.toFixed(3)}`);

  // Step 3: Defence strength (80/20 blend)
  const dbH = 0.80 * eaH + 0.20 * h.goalsAgainst;
  const dbA = 0.80 * eaA + 0.20 * a.goalsAgainst;
  const avgDB = 0.80 * lg.avgXG + 0.20 * lg.avgGoals;
  const defH = dbH / avgDB, defA = dbA / avgDB;
  log.push(`Step 3 — Defence Strength: H=${defH.toFixed(3)} A=${defA.toFixed(3)}`);

  // Step 4: Lambda (base rate = league avg goals per team, home advantage
  // split symmetrically so the expected match total is preserved).
  //
  // The old version applied a single one-sided homeAdvantage multiplier
  // to home lambda only, leaving away lambda unscaled — that inflated
  // the expected match total by (homeAdvantage-1)/2 for every match
  // (roughly 5.5-9% with the old constants), which would have badly
  // mispriced Totals once built. Splitting the league's home/away goals
  // ratio `r` into two multipliers that sum to 2 fixes this: home is
  // boosted, away is suppressed by the same amount, and two
  // league-average teams (all strengths = 1.0) reproduce the league's
  // actual observed home/away split while landing on the league's
  // actual observed average total.
  const r = lg.homeAwayRatio;
  const homeMult = (2 * r) / (1 + r);
  const awayMult = 2 / (1 + r);
  let lH = clamp(atkH * defA * lg.avgGoalsPerTeam * homeMult, 0.05, 8);
  let lA = clamp(atkA * defH * lg.avgGoalsPerTeam * awayMult, 0.05, 8);
  log.push(`Step 4 — Lambda (raw): H=${lH.toFixed(3)} A=${lA.toFixed(3)} [r=${r.toFixed(3)} homeMult=${homeMult.toFixed(3)} awayMult=${awayMult.toFixed(3)}]`);

  // Step 5b: Absence severity — one severity value per team, applied
  // equally to that team's attack and defence via absenceWeight.
  const absWt = params.absenceWeight;
  lH *= (1 - ((h.absence - 1) * absWt));
  lA *= (1 + ((h.absence - 1) * absWt));
  lA *= (1 - ((a.absence - 1) * absWt));
  lH *= (1 + ((a.absence - 1) * absWt));
  lH = clamp(lH, 0.05, 8);
  lA = clamp(lA, 0.05, 8);

  // Build absence notes
  const absenceNotes: AbsenceNote[] = [];
  if (h.absence > 1) absenceNotes.push({ team: 'home', severity: h.absence, pct: ((h.absence - 1) * absWt * 100).toFixed(1) });
  if (a.absence > 1) absenceNotes.push({ team: 'away', severity: a.absence, pct: ((a.absence - 1) * absWt * 100).toFixed(1) });
  if (absenceNotes.length > 0) {
    log.push(`Step 5b — Absence: λH=${lH.toFixed(3)} λA=${lA.toFixed(3)}`);
  } else {
    log.push(`Step 5b — Absence: SKIPPED — both teams at None`);
  }

  // Step 6: Poisson marginals
  const hP: number[] = [], aP: number[] = [];
  for (let k = 0; k <= MAX_GOALS; k++) { hP[k] = poissonPMF(k, lH); aP[k] = poissonPMF(k, lA); }
  log.push(`Step 6 — Poisson: λH=${lH.toFixed(3)} λA=${lA.toFixed(3)}`);

  // Step 7: Dixon-Coles correction
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
  log.push(`Step 7 — Dixon-Coles: ρ=${rho}`);

  // Step 8: Aggregate 1X2
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i > j) pH += matrix[i][j];
      else if (i === j) pD += matrix[i][j];
      else pA += matrix[i][j];
    }
  log.push(`Step 8 — Raw 1X2: H=${(pH * 100).toFixed(1)}% D=${(pD * 100).toFixed(1)}% A=${(pA * 100).toFixed(1)}%`);

  // Step 9: Draw inflation
  pD *= params.drawInflation;
  const tot = pH + pD + pA;
  pH /= tot; pD /= tot; pA /= tot;
  log.push(`Step 9 — Draw Inflation (${params.drawInflation}): H=${(pH * 100).toFixed(1)}% D=${(pD * 100).toFixed(1)}% A=${(pA * 100).toFixed(1)}%`);

  // Step 10: Market matrix (AH / Totals / BTTS / Correct Score)
  // Read-only against `matrix` from Step 7 — does not touch any Step
  // 0-9 variable. Applies the same draw-inflation-and-renormalise
  // transform Step 9 applies to the 1X2 aggregate, but cell-by-cell
  // across the full scoreline grid, so every market derived here is
  // priced off the identical probability field the 1X2 box shows
  // (AH -0.5 cover, e.g., reproduces probHome exactly).
  const drawInfl = params.drawInflation;
  const marketMatrix: number[][] = [];
  let marketTotal = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    marketMatrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const val = matrix[i][j] * (i === j ? drawInfl : 1);
      marketMatrix[i][j] = val;
      marketTotal += val;
    }
  }
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      marketMatrix[i][j] /= marketTotal;
  log.push(`Step 10 — Market Matrix: raw sum=${matrix.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0).toFixed(6)} normalised sum=${marketMatrix.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0).toFixed(6)}`);

  const ahRows: AHRow[] = AH_LINES.map((line) => {
    const { home, push, away } = ahOutcome(marketMatrix, line);
    return { line, homeProb: home, pushProb: push, awayProb: away, homeOdds: fairOdds(home, push), awayOdds: fairOdds(away, push) };
  });
  const ahClosestLine = ahRows.reduce((best, row) =>
    Math.abs(row.homeProb - 0.5) < Math.abs(best.homeProb - 0.5) ? row : best
  ).line;

  const totalsRows: TotalsRow[] = TOTALS_LINES.map((line) => {
    const { over, push, under } = totalsOutcome(marketMatrix, line);
    return { line, overProb: over, pushProb: push, underProb: under, overOdds: fairOdds(over, push), underOdds: fairOdds(under, push) };
  });
  const totalsClosestLine = totalsRows.reduce((best, row) =>
    Math.abs(row.overProb - 0.5) < Math.abs(best.overProb - 0.5) ? row : best
  ).line;

  let bttsYesProb = 0;
  for (let i = 1; i <= MAX_GOALS; i++)
    for (let j = 1; j <= MAX_GOALS; j++)
      bttsYesProb += marketMatrix[i][j];
  const bttsNoProb = 1 - bttsYesProb;

  const correctScores: CorrectScoreRow[] = [];
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      correctScores.push({ home: i, away: j, prob: marketMatrix[i][j] });
  correctScores.sort((a, b) => b.prob - a.prob);
  const top8Scores = correctScores.slice(0, 8);

  log.push(`Step 10 — AH closest to 50/50: ${ahClosestLine > 0 ? '+' : ''}${ahClosestLine} (H=${(ahRows.find(r => r.line === ahClosestLine)!.homeProb * 100).toFixed(1)}%) | Totals closest to 50/50: ${totalsClosestLine} (O=${(totalsRows.find(r => r.line === totalsClosestLine)!.overProb * 100).toFixed(1)}%) | BTTS Y=${(bttsYesProb * 100).toFixed(1)}% N=${(bttsNoProb * 100).toFixed(1)}%`);

  return {
    lambdaHome: lH, lambdaAway: lA, matrix, marketMatrix,
    probHome: pH, probDraw: pD, probAway: pA, absenceNotes, calcLog: log,
    ahRows, ahClosestLine, totalsRows, totalsClosestLine,
    bttsYesProb, bttsNoProb, bttsYesOdds: fairOdds(bttsYesProb, 0), bttsNoOdds: fairOdds(bttsNoProb, 0),
    correctScores: top8Scores,
  };
}
