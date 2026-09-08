/** Market-implied home-minus-away goal gap under independent Poisson scores.
 * The paired totals quote identifies their sum; the handicap identifies their split.
 * Quarter lines split stakes over adjacent whole/half contracts. This is a
 * conversion of recorded prices, not an independent match-strength forecast.
 */
import type { SpreadsPoint, TotalsPoint } from '../types';
import { impliedExpectedGoals } from './impliedTotal';
import { parseUtc } from './time';

export const MAX_PAIR_AGE_MS = 30 * 60 * 1000;
const MAX_GOALS = 40; // At the supported total <=9, omitted mass is below 1e-13.
const isQuarterLine = (line: number) => Number.isFinite(line) && Math.abs(line * 4 - Math.round(line * 4)) < 1e-6;
const validOdds = (odds: number | null): odds is number => odds !== null && Number.isFinite(odds) && odds > 1;

function poisson(mean: number) {
  const probabilities = [Math.exp(-mean)];
  for (let k = 1; k <= MAX_GOALS; k++) probabilities.push(probabilities[k - 1] * mean / k);
  return probabilities;
}

/** Probability share of winning stake among settled (non-refunded) stakes. */
function homeShare(line: number, homeGoals: number, awayGoals: number) {
  const home = poisson(homeGoals), away = poisson(awayGoals);
  const cumulative: number[] = []; let mass = 0;
  for (const p of away) { mass += p; cumulative.push(mass); }
  const cdf = (k: number) => k < 0 ? 0 : cumulative[Math.min(k, MAX_GOALS)];
  const legs = Math.abs(Math.round(line * 4)) % 2 === 1 ? [line - .25, line + .25] : [line];
  let win = 0, loss = 0;
  for (const leg of legs) {
    for (let h = 0; h <= MAX_GOALS; h++) {
      win += home[h] * cdf(Math.ceil(h + leg) - 1) / legs.length;
      loss += home[h] * (mass - cdf(Math.floor(h + leg))) / legs.length;
    }
  }
  return win / (win + loss);
}

export function impliedGoalGap(line: number, homeOdds: number | null, awayOdds: number | null, totalGoals: number | null): number | null {
  if (!isQuarterLine(line) || Math.abs(line) > 8 || !validOdds(homeOdds) || !validOdds(awayOdds) || totalGoals === null || !Number.isFinite(totalGoals) || totalGoals < .05 || totalGoals > 9) return null;
  line = Math.round(line * 4) / 4;
  // Proportional margin removal acts on fair inverse odds, including push contracts.
  const target = (1 / homeOdds) / (1 / homeOdds + 1 / awayOdds);
  let lo = .000001, hi = totalGoals - .000001;
  if (target < homeShare(line, lo, totalGoals - lo) || target > homeShare(line, hi, totalGoals - hi)) return null;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    if (homeShare(line, mid, totalGoals - mid) < target) lo = mid;
    else hi = mid;
  }
  return lo + hi - totalGoals;
}

export interface HandicapTrendPoint {
  timestamp: string; time: number; homeGap: number | null; totalGoals: number | null;
  totalTimestamp: string | null; line: number; reason: string | null;
}

export function impliedHandicapHistory(spreads: SpreadsPoint[], totals: TotalsPoint[]): HandicapTrendPoint[] {
  const orderedTotals = totals.map(p => ({ ...p, time: parseUtc(p.timestamp).getTime() }))
    .filter(p => Number.isFinite(p.time)).sort((a, b) => a.time - b.time)
    // The API orders main totals first if multiple lines share a fetch timestamp.
    .filter((p, i, rows) => i === 0 || rows[i - 1].time !== p.time);
  const history = spreads.map(p => ({ ...p, time: parseUtc(p.timestamp).getTime() }))
    .filter(p => Number.isFinite(p.time)).sort((a, b) => a.time - b.time);
  const points: HandicapTrendPoint[] = [];
  const totalCache = new Map<string, number | null>(), gapCache = new Map<string, number | null>();
  let index = -1;
  for (const p of history) {
    const time = p.time;
    while (index + 1 < orderedTotals.length && orderedTotals[index + 1].time <= time) index++;
    const total = orderedTotals[index];
    let totalGoals: number | null = null, homeGap: number | null = null;
    let reason: string | null = !total ? 'No earlier totals quote' : time - total.time > MAX_PAIR_AGE_MS ? 'Totals quote more than 30 minutes old' : null;
    if (!reason) {
      const totalKey = JSON.stringify([total.line, total.over_odds, total.under_odds]);
      if (!totalCache.has(totalKey)) totalCache.set(totalKey, impliedExpectedGoals(total.line, total.over_odds, total.under_odds));
      totalGoals = totalCache.get(totalKey)!;
      const gapKey = JSON.stringify([p.line, p.home_odds, p.away_odds, totalGoals]);
      if (!gapCache.has(gapKey)) gapCache.set(gapKey, impliedGoalGap(p.line, p.home_odds, p.away_odds, totalGoals));
      homeGap = gapCache.get(gapKey)!;
      if (homeGap === null) reason = 'Prices incomplete or outside the supported model range';
    }
    const previous = points.at(-1);
    if (previous && time - previous.time > MAX_PAIR_AGE_MS) points.push({ ...previous,
      timestamp: new Date(previous.time + MAX_PAIR_AGE_MS).toISOString(), time: previous.time + MAX_PAIR_AGE_MS,
      homeGap: null, reason: 'Gap in handicap observations' });
    points.push({ timestamp: new Date(time).toISOString(), time, homeGap, totalGoals,
      totalTimestamp: total ? new Date(total.time).toISOString() : null, line: p.line, reason });
  }
  return points;
}
