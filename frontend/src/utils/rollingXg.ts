import type { XGDataPoint } from '../types';

type Window = 5 | 10;

interface ChartPoint {
  matchNumber: number;
  label: string;
  season: string;
  rollingFor: number | null;
  rollingAgainst: number | null;
  trendFor: number | null;
  trendAgainst: number | null;
}

export function computeChartData(matches: XGDataPoint[], window: Window, currentSeason: string): ChartPoint[] {
  const points: ChartPoint[] = [];
  const covered: { index: number; created: number; conceded: number }[] = [];
  for (let end = window; end <= matches.length; end++) {
    const match = matches[end - 1];
    const sample = matches.slice(end - window, end);
    const point: ChartPoint = {
      matchNumber: match.match_number, season: match.season,
      label: match.season === currentSeason ? String(match.match_number) : `L${match.match_number}`,
      rollingFor: null, rollingAgainst: null, trendFor: null, trendAgainst: null,
    };
    let created = 0;
    let conceded = 0;
    let complete = true;
    for (const row of sample) {
      if (row.xg_for === null || row.xg_against === null) {
        complete = false;
        break;
      }
      created += row.xg_for;
      conceded += row.xg_against;
    }
    if (complete) {
      created /= window;
      conceded /= window;
      point.rollingFor = Number(created.toFixed(2));
      point.rollingAgainst = Number(conceded.toFixed(2));
      covered.push({ index: points.length, created, conceded });
    }
    points.push(point);
  }

  // Keep real match positions when fitting across gaps in provider coverage.
  if (!covered.length) return points;
  const meanX = covered.reduce((sum, row) => sum + row.index, 0) / covered.length;
  const variance = covered.reduce((sum, row) => sum + (row.index - meanX) ** 2, 0);
  for (const [metric, field] of [['created', 'trendFor'], ['conceded', 'trendAgainst']] as const) {
    const meanY = covered.reduce((sum, row) => sum + row[metric], 0) / covered.length;
    const covariance = covered.reduce((sum, row) => sum + (row.index - meanX) * (row[metric] - meanY), 0);
    const slope = variance ? covariance / variance : 0;
    for (const row of covered) {
      points[row.index][field] = Number((meanY + slope * (row.index - meanX)).toFixed(2));
    }
  }
  return points;
}
