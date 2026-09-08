import type { SpreadsPoint } from '../types';
import { parseUtc } from './time';

export const sameHandicap = (a: number, b: number) => Math.abs(a - b) < 0.001;
export const formatHandicap = (line: number) => Math.abs(line) < 0.001 ? '0' : `${line > 0 ? '+' : ''}${line}`;
const validOdds = (odds: number | null): odds is number => odds !== null && Number.isFinite(odds) && odds > 1;

export function orderedHandicaps(history: SpreadsPoint[]) {
  return history.filter(p => Number.isFinite(p.line) && Number.isFinite(parseUtc(p.timestamp).getTime()))
    .map(p => ({ ...p, timestamp: parseUtc(p.timestamp).toISOString(), home_odds: validOdds(p.home_odds) ? p.home_odds : null, away_odds: validOdds(p.away_odds) ? p.away_odds : null }))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function handicapLines(history: SpreadsPoint[]) {
  return history.reduce<number[]>((lines, point) => lines.some(line => sameHandicap(line, point.line)) ? lines : [...lines, point.line], []).sort((a, b) => a - b);
}

export function handicapView(history: SpreadsPoint[], line: number) {
  const matching = history.filter(p => sameHandicap(p.line, line));
  const first = matching[0];
  const last = matching.at(-1);
  const changes = (['home_odds', 'away_odds'] as const).map(side =>
    matching.length >= 2 && first && last && validOdds(first[side]) && validOdds(last[side])
      ? ((last[side] - first[side]) / first[side]) * 100 : null);
  const [home, away] = changes;
  const direction = home === null || away === null ? 'insufficient'
    : Math.abs(home) < 0.1 && Math.abs(away) < 0.1 ? 'unchanged'
    : home < -0.1 && away > 0.1 ? 'home'
    : away < -0.1 && home > 0.1 ? 'away' : 'mixed';
  return { first, last, changes, direction, count: matching.length,
    // Preserve every timestamp. Removing other lines would bridge an unobserved interval.
    chart: history.map(p => ({ ...p, time: Date.parse(p.timestamp),
      home_odds: sameHandicap(p.line, line) ? p.home_odds : null,
      away_odds: sameHandicap(p.line, line) ? p.away_odds : null })) };
}
