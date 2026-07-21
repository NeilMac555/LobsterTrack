// Pure math for the Bet Calculator (frontend/src/pages/BetCalculatorPage.tsx).
// No each-way, no Rule 4 — just Single/Double/Treble/Accumulator across
// fraction/decimal/American odds. Everything here is pure functions over
// plain data so the page component stays a thin UI layer.

export type OddsFormat = 'fraction' | 'decimal' | 'american';
export type Outcome = 'won' | 'lost' | 'void';
export type BetType = 'single' | 'double' | 'treble' | 'accumulator';
export type StakeMode = 'perBet' | 'totalCombined';

export interface Selection {
  id: string;
  outcome: Outcome;
  /** Canonical odds storage — always decimal, regardless of display format. */
  oddsDecimal: number;
}

// ---- Odds format conversions ----------------------------------------

export function fractionToDecimal(numerator: number, denominator: number): number {
  return numerator / denominator + 1;
}

export function decimalToFraction(decimal: number, maxDenominator = 100): { numerator: number; denominator: number } {
  const value = decimal - 1;
  if (value <= 0) return { numerator: 0, denominator: 1 };

  // Continued-fraction expansion, capped at maxDenominator — real bookmaker
  // fractional odds always reduce to something small (5/2, 11/4, 8/13...),
  // so this converges to the "obvious" fraction rather than a huge ratio.
  let bestNum = Math.round(value);
  let bestDen = 1;
  let bestError = Math.abs(value - bestNum);

  for (let den = 1; den <= maxDenominator; den++) {
    const num = Math.round(value * den);
    if (num <= 0) continue;
    const error = Math.abs(value - num / den);
    if (error < bestError - 1e-9) {
      bestError = error;
      bestNum = num;
      bestDen = den;
    }
    if (error < 1e-9) break;
  }

  const divisor = gcd(bestNum, bestDen);
  return { numerator: bestNum / divisor, denominator: bestDen / divisor };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function americanToDecimal(american: number): number {
  if (american > 0) return 1 + american / 100;
  return 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  const value = decimal - 1;
  if (value <= 0) return 0;
  return value >= 1 ? Math.round(value * 100) : Math.round(-100 / value);
}

// ---- Bet type <-> selection count -------------------------------------

/** Which bet types are valid for a given number of selections. Single is
 *  always available; the "combined" type is fixed to its exact fold size
 *  (a Double is inherently 2 legs, a Treble 3) rather than AceOdds' fuller
 *  "N choose K" coverage bets (Trixie/Patent/Yankee/...), which this
 *  calculator deliberately doesn't support. */
export function availableBetTypes(numSelections: number): BetType[] {
  if (numSelections <= 1) return ['single'];
  if (numSelections === 2) return ['single', 'double'];
  if (numSelections === 3) return ['single', 'treble'];
  return ['single', 'accumulator'];
}

export function betTypeLabel(betType: BetType, numSelections: number): string {
  switch (betType) {
    case 'single': return numSelections > 1 ? 'Singles' : 'Single';
    case 'double': return 'Double';
    case 'treble': return 'Treble';
    case 'accumulator': return `${numSelections}-Fold Accumulator`;
  }
}

// ---- Calculation --------------------------------------------------------

export interface SelectionResult {
  id: string;
  stake: number;
  return: number;
  profit: number;
}

export interface CalcResult {
  numberOfBets: number;
  stakePerBet: number;
  totalOutlay: number;
  totalReturn: number;
  totalProfit: number;
  /** Only populated for Single — one line per selection. */
  selectionResults?: SelectionResult[];
  /** Combined odds for Double/Treble/Accumulator (void legs excluded). */
  combinedOdds?: number;
}

export function calculateBet(params: {
  betType: BetType;
  selections: Selection[];
  stake: number;
  stakeMode: StakeMode;
}): CalcResult | null {
  const { betType, selections, stake, stakeMode } = params;

  if (!selections.length || !isFinite(stake) || stake <= 0) return null;
  if (selections.some((s) => !isFinite(s.oddsDecimal) || s.oddsDecimal < 1.01)) return null;

  if (betType === 'single') {
    const numberOfBets = selections.length;
    const stakePerBet = stakeMode === 'perBet' ? stake : stake / numberOfBets;
    const totalOutlay = stakePerBet * numberOfBets;

    const selectionResults: SelectionResult[] = selections.map((s) => {
      let ret = 0;
      if (s.outcome === 'won') ret = stakePerBet * s.oddsDecimal;
      else if (s.outcome === 'void') ret = stakePerBet;
      return { id: s.id, stake: stakePerBet, return: ret, profit: ret - stakePerBet };
    });

    const totalReturn = selectionResults.reduce((sum, r) => sum + r.return, 0);

    return {
      numberOfBets,
      stakePerBet,
      totalOutlay,
      totalReturn,
      totalProfit: totalReturn - totalOutlay,
      selectionResults,
    };
  }

  // Double / Treble / Accumulator: one combined bet, all non-void legs must
  // win. A void leg is dropped from the combination (its odds don't count)
  // rather than voiding the whole bet — standard multiples handling.
  const anyLost = selections.some((s) => s.outcome === 'lost');
  const combinedOdds = selections
    .filter((s) => s.outcome !== 'void')
    .reduce((product, s) => product * s.oddsDecimal, 1);

  const totalReturn = anyLost ? 0 : stake * combinedOdds;

  return {
    numberOfBets: 1,
    stakePerBet: stake,
    totalOutlay: stake,
    totalReturn,
    totalProfit: totalReturn - stake,
    combinedOdds,
  };
}
