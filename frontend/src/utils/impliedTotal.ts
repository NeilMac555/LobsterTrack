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
 * The result, lambda, is a continuous "market-implied total goals"
 * figure that trends smoothly even as the traded line moves underneath
 * it — exactly the apples-to-apples signal a raw price chart can't give.
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

/** P(total goals > line) under Poisson(lambda). Soccer totals lines are
 * always at .25/.5/.75 fractions, so "> line" === "> floor(line)". */
function probOver(line: number, lambda: number): number {
  return 1 - poissonCdf(Math.floor(line), lambda);
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
 * Solve for the Poisson lambda whose Over probability at `line` matches
 * the devigged market probability. Binary search over a sane goals range
 * — soccer totals essentially never imply a fair lambda outside ~0.3–8.
 */
export function impliedExpectedGoals(
  line: number | null,
  overOdds: number | null,
  underOdds: number | null
): number | null {
  if (line == null || overOdds == null || underOdds == null) return null;
  const probs = devig(overOdds, underOdds);
  if (!probs) return null;
  const target = probs.pOver;

  let lo = 0.05;
  let hi = 9;
  // probOver is monotonically increasing in lambda, so binary search works.
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const p = probOver(line, mid);
    if (p < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
