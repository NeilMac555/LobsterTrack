/**
 * Market-implied expected total goals.
 *
 * Over/Under price at one line isn't comparable to price at another line
 * (Over 2.75 @ 1.95 and Over 3.0 @ 1.95 mean different things). To get a
 * single number that IS comparable across the whole tracking window
 * regardless of which line Pinnacle happened to be quoting, we devig the
 * Over/Under odds into a true probability, then solve for the Poisson
 * lambda (expected goals) that would produce that probability against
 * that line. Total goals in soccer is well approximated by a Poisson
 * distribution — this is the same assumption Dixon-Coles is built on.
 *
 * IMPORTANT — quarter lines (X.25 / X.75) are NOT a simple binary
 * threshold. A "2.25" total is really a 50/50 blend of two sub-bets: the
 * whole-number line below it (which can push) and the half-line above it
 * (which can't). Treating a 2.25 quote the same as a 2.5 quote — i.e.
 * just flooring to the nearest integer — produces a systematically wrong
 * implied lambda and shows up as a false jump exactly when Pinnacle's
 * quoted line crosses from a half line to a quarter line (or vice versa),
 * even though nothing about the market's real goal-expectancy changed.
 * fairOverOdds below models each line type (whole/half/quarter) properly
 * so the solved lambda stays continuous across those transitions.
 */

function poissonPmf(k: number, lambda: number): number {
  // e^-lambda * lambda^k / k!  computed in log-space for stability at
  // larger k (total goals counts are small in soccer, but keep it safe).
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logPmf = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logPmf -= Math.log(i);
  return Math.exp(logPmf);
}

function poissonCdf(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += poissonPmf(i, lambda);
  return sum;
}

/**
 * Fair (no-vig) decimal odds for the Over side of `line` under
 * Poisson(lambda), correctly modelling the payout structure for each
 * line type:
 *
 *  - Half line (X.5): plain single bet, no push. Over wins iff
 *    goals > floor(line). Fair odds = 1 / P(win).
 *  - Whole line (X.0): single bet WITH a push at exactly `line` goals.
 *    Fair odds = (1 - P(push)) / P(win) — a push refunds the stake, so
 *    it doesn't count as a loss in the fair-odds equation.
 *  - Quarter line (X.25): half the stake on the whole line below
 *    (floor(line), pushable) + half on the half line above
 *    (floor(line)+0.5, not pushable). Both sub-bets win together once
 *    goals clear the half line; at exactly floor(line) goals the whole
 *    leg pushes while the half leg loses, so that outcome only refunds
 *    half the stake. Fair odds = (1 - 0.5*P(push)) / P(win).
 *  - Three-quarter line (X.75): half the stake on the half line below
 *    (floor(line)+0.5, not pushable) + half on the whole line above
 *    (floor(line)+1, pushable). At exactly floor(line)+1 goals the half
 *    leg already won while the whole leg pushes, so that outcome pays
 *    out the win on half the stake plus a refund on the other half.
 *    Fair odds = (1 - 0.5*P(push)) / (P(strict win) + 0.5*P(push)).
 */
function fairOverOdds(line: number, lambda: number): number {
  const floor = Math.floor(line);
  const frac = Number((line - floor).toFixed(2));

  if (frac === 0.5) {
    const pWin = 1 - poissonCdf(floor, lambda);
    return pWin > 0 ? 1 / pWin : Infinity;
  }
  if (frac === 0) {
    const pWin = 1 - poissonCdf(floor, lambda);
    const pPush = poissonPmf(floor, lambda);
    return pWin > 0 ? (1 - pPush) / pWin : Infinity;
  }
  if (frac === 0.25) {
    const pWin = 1 - poissonCdf(floor, lambda);
    const pPush = poissonPmf(floor, lambda);
    return pWin > 0 ? (1 - 0.5 * pPush) / pWin : Infinity;
  }
  if (frac === 0.75) {
    const intLine = floor + 1;
    const pWinStrict = 1 - poissonCdf(intLine, lambda);
    const pPush = poissonPmf(intLine, lambda);
    const denom = pWinStrict + 0.5 * pPush;
    return denom > 0 ? (1 - 0.5 * pPush) / denom : Infinity;
  }
  // Unexpected fraction — fall back to the simple half-line treatment
  // rather than throw; soccer totals should never hit this branch.
  const pWin = 1 - poissonCdf(floor, lambda);
  return pWin > 0 ? 1 / pWin : Infinity;
}

/** Multiplicative devig: strip the bookmaker's margin proportionally
 * across both sides so probabilities sum to exactly 1. */
function devig(overOdds: number, underOdds: number): { pOver: number; pUnder: number } | null {
  if (!overOdds || !underOdds || overOdds <= 1 || underOdds <= 1) return null;
  const rawOver = 1 / overOdds;
  const rawUnder = 1 / underOdds;
  const overround = rawOver + rawUnder;
  if (overround <= 0) return null;
  return { pOver: rawOver / overround, pUnder: rawUnder / overround };
}

/**
 * Solve for the Poisson lambda whose fair Over odds at `line` match the
 * devigged market odds. Binary search over a sane goals range — soccer
 * totals essentially never imply a fair lambda outside ~0.05–9. Fair
 * odds are a decreasing function of lambda (more expected goals -> Over
 * more likely -> shorter odds), so the search direction is inverted
 * relative to searching on probability directly.
 */
export function impliedExpectedGoals(
  line: number | null,
  overOdds: number | null,
  underOdds: number | null
): number | null {
  if (line == null || overOdds == null || underOdds == null) return null;
  const probs = devig(overOdds, underOdds);
  if (!probs || probs.pOver <= 0) return null;
  const targetOdds = 1 / probs.pOver;

  let lo = 0.05;
  let hi = 9;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const modelOdds = fairOverOdds(line, mid);
    if (modelOdds > targetOdds) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
