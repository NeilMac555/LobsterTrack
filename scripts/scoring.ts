// Scoring for the calibration/backtest harness. All de-vigging uses the
// proportional method (each side's implied prob = its raw 1/odds share
// of the sum of 1/odds across all sides of that market) — no other
// de-vig method is used anywhere in this file.

export interface DevigResult3Way {
  a: number;
  b: number;
  c: number;
}
export interface DevigResult2Way {
  a: number;
  b: number;
}

export function devig3Way(oddsA: number, oddsB: number, oddsC: number): DevigResult3Way {
  const rawA = 1 / oddsA, rawB = 1 / oddsB, rawC = 1 / oddsC;
  const sum = rawA + rawB + rawC;
  return { a: rawA / sum, b: rawB / sum, c: rawC / sum };
}

export function devig2Way(oddsA: number, oddsB: number): DevigResult2Way {
  const rawA = 1 / oddsA, rawB = 1 / oddsB;
  const sum = rawA + rawB;
  return { a: rawA / sum, b: rawB / sum };
}

// ===== 1X2 (3-outcome) sample =====
export interface OutcomeSample3 {
  // Model's fair probability for each side.
  modelHome: number;
  modelDraw: number;
  modelAway: number;
  // Actual result.
  actual: 'home' | 'draw' | 'away';
  // De-vigged closing-implied probability, if closing odds were available
  // for this match (price_source !== 'missing'). Undefined => excluded
  // from every odds-comparison metric (log loss vs close, CLV) but still
  // used in the calibration table and draw-rate check.
  closeHome?: number;
  closeDraw?: number;
  closeAway?: number;
  // Actual decimal closing odds (not devigged) — needed for the CLV
  // flat-stake P/L simulation, which bets at the real market price.
  closeOddsHome?: number;
  closeOddsDraw?: number;
  closeOddsAway?: number;
}

export interface OutcomeSample2 {
  modelA: number; // e.g. "over"
  modelB: number; // e.g. "under"
  actualIsA: boolean;
  closeA?: number;
  closeB?: number;
  closeOddsA?: number;
  closeOddsB?: number;
}

function brierMulti(samples: { probs: number[]; actualIndex: number }[]): number {
  if (samples.length === 0) return NaN;
  let sum = 0;
  for (const s of samples) {
    for (let k = 0; k < s.probs.length; k++) {
      const y = k === s.actualIndex ? 1 : 0;
      sum += (s.probs[k] - y) ** 2;
    }
  }
  return sum / samples.length;
}

function logLossMulti(samples: { probs: number[]; actualIndex: number }[]): number {
  if (samples.length === 0) return NaN;
  const EPS = 1e-12;
  let sum = 0;
  for (const s of samples) {
    const p = Math.max(EPS, Math.min(1 - EPS, s.probs[s.actualIndex]));
    sum += -Math.log(p);
  }
  return sum / samples.length;
}

export interface ScoreBlock {
  n: number;
  brier: number;
  logLoss: number;
}

export function score1X2(samples: OutcomeSample3[], source: 'model' | 'close'): ScoreBlock {
  const rows = source === 'model'
    ? samples.map((s) => ({ probs: [s.modelHome, s.modelDraw, s.modelAway], actualIndex: idx3(s.actual) }))
    : samples
        .filter((s) => s.closeHome !== undefined && s.closeDraw !== undefined && s.closeAway !== undefined)
        .map((s) => ({ probs: [s.closeHome!, s.closeDraw!, s.closeAway!], actualIndex: idx3(s.actual) }));
  return { n: rows.length, brier: brierMulti(rows), logLoss: logLossMulti(rows) };
}

function idx3(actual: 'home' | 'draw' | 'away'): number {
  return actual === 'home' ? 0 : actual === 'draw' ? 1 : 2;
}

// ===== Calibration table (5%-wide buckets) =====
export interface CalibrationBucket {
  bucketLow: number; // e.g. 0.30
  bucketHigh: number; // e.g. 0.35
  n: number;
  meanPredicted: number;
  observedFrequency: number;
}

export function calibrationTable(
  predictedProbs: number[],
  actualIndicators: boolean[]
): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = [];
  for (let lo = 0; lo < 100; lo += 5) {
    const low = lo / 100, high = (lo + 5) / 100;
    const idxs: number[] = [];
    predictedProbs.forEach((p, i) => {
      // Last bucket is inclusive of 1.0; every other bucket is
      // half-open [low, high).
      if (p >= low && (high === 1 ? p <= high : p < high)) idxs.push(i);
    });
    if (idxs.length === 0) continue;
    const n = idxs.length;
    const meanPredicted = idxs.reduce((s, i) => s + predictedProbs[i], 0) / n;
    const observedFrequency = idxs.reduce((s, i) => s + (actualIndicators[i] ? 1 : 0), 0) / n;
    buckets.push({ bucketLow: low, bucketHigh: high, n, meanPredicted, observedFrequency });
  }
  return buckets;
}

// ===== CLV proxy =====
export interface CLVResult {
  n: number; // matches with closing odds available
  meanEdge: number; // mean (model prob - closing implied prob) on the highest-edge side
  betsPlaced: number; // edge > 2pp
  flatStakePL: number; // 1-unit flat stake, decimal odds
  roiPercent: number;
}

export function clvProxy1X2(samples: OutcomeSample3[]): CLVResult {
  const withClose = samples.filter(
    (s) => s.closeHome !== undefined && s.closeDraw !== undefined && s.closeAway !== undefined &&
           s.closeOddsHome !== undefined && s.closeOddsDraw !== undefined && s.closeOddsAway !== undefined
  );
  let edgeSum = 0;
  let betsPlaced = 0;
  let pl = 0;
  for (const s of withClose) {
    const edges: { side: 'home' | 'draw' | 'away'; edge: number; odds: number; won: boolean }[] = [
      { side: 'home', edge: s.modelHome - s.closeHome!, odds: s.closeOddsHome!, won: s.actual === 'home' },
      { side: 'draw', edge: s.modelDraw - s.closeDraw!, odds: s.closeOddsDraw!, won: s.actual === 'draw' },
      { side: 'away', edge: s.modelAway - s.closeAway!, odds: s.closeOddsAway!, won: s.actual === 'away' },
    ];
    const best = edges.reduce((a, b) => (b.edge > a.edge ? b : a));
    edgeSum += best.edge;
    if (best.edge > 0.02) {
      betsPlaced++;
      pl += best.won ? best.odds - 1 : -1;
    }
  }
  return {
    n: withClose.length,
    meanEdge: withClose.length ? edgeSum / withClose.length : NaN,
    betsPlaced,
    flatStakePL: pl,
    roiPercent: betsPlaced ? (pl / betsPlaced) * 100 : NaN,
  };
}

export function clvProxy2Way(samples: OutcomeSample2[]): CLVResult {
  const withClose = samples.filter(
    (s) => s.closeA !== undefined && s.closeB !== undefined && s.closeOddsA !== undefined && s.closeOddsB !== undefined
  );
  let edgeSum = 0;
  let betsPlaced = 0;
  let pl = 0;
  for (const s of withClose) {
    const edges = [
      { edge: s.modelA - s.closeA!, odds: s.closeOddsA!, won: s.actualIsA },
      { edge: s.modelB - s.closeB!, odds: s.closeOddsB!, won: !s.actualIsA },
    ];
    const best = edges.reduce((a, b) => (b.edge > a.edge ? b : a));
    edgeSum += best.edge;
    if (best.edge > 0.02) {
      betsPlaced++;
      pl += best.won ? best.odds - 1 : -1;
    }
  }
  return {
    n: withClose.length,
    meanEdge: withClose.length ? edgeSum / withClose.length : NaN,
    betsPlaced,
    flatStakePL: pl,
    roiPercent: betsPlaced ? (pl / betsPlaced) * 100 : NaN,
  };
}

export function score2Way(samples: OutcomeSample2[], source: 'model' | 'close'): ScoreBlock {
  const rows = source === 'model'
    ? samples.map((s) => ({ probs: [s.modelA, s.modelB], actualIndex: s.actualIsA ? 0 : 1 }))
    : samples
        .filter((s) => s.closeA !== undefined && s.closeB !== undefined)
        .map((s) => ({ probs: [s.closeA!, s.closeB!], actualIndex: s.actualIsA ? 0 : 1 }));
  return { n: rows.length, brier: brierMulti(rows), logLoss: logLossMulti(rows) };
}
