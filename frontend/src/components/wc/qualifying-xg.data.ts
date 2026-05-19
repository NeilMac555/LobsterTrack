// Per-team qualifying campaign xG data, sourced from Wyscout team-stats exports.
// Each TeamXg holds the full match list; aggregates are computed at render time.
export interface XgMatch {
  date: string;
  opponent: string;
  venue: 'H' | 'A';
  gf: number;
  ga: number;
  xg: number;
  xga: number;
  shots: number;
  shotsOn: number;
  oppShots: number;
  oppShotsOn: number;
}

export interface TeamXg {
  team: string;
  matches: XgMatch[];
  /** Optional caveat shown on the team panel — small sample, missing data, etc. */
  note?: string;
}

export interface XgAggregate {
  matches: number;
  goalsFor: number;
  xgFor: number;
  goalsAgainst: number;
  xgAgainst: number;
  shots: number;
  shotsOn: number;
  cleanSheets: number;
  // per-match
  xgPer: number;
  xgaPer: number;
  goalsPer: number;
  goalsAgainstPer: number;
  // deltas (signed; positive = good)
  finishing: number;   // GF - xG  (positive = clinical)
  defending: number;   // xGA - GA (positive = solid)
  // verdict labels for visual treatment
  finishingTier: 'CLINICAL' | 'MET' | 'WASTEFUL';
  defendingTier: 'SOLID' | 'MET' | 'LEAKY';
  // window
  fromDate: string;
  toDate: string;
}

export function aggregate(t: TeamXg): XgAggregate {
  const m = t.matches;
  const sum = (k: keyof XgMatch) => m.reduce((acc, x) => acc + (x[k] as number), 0);
  const goalsFor = sum('gf');
  const xgFor = sum('xg');
  const goalsAgainst = sum('ga');
  const xgAgainst = sum('xga');
  const shots = sum('shots');
  const shotsOn = sum('shotsOn');
  const finishing = goalsFor - xgFor;
  const defending = xgAgainst - goalsAgainst;
  const tier = (delta: number, kind: 'fin' | 'def'): 'CLINICAL' | 'MET' | 'WASTEFUL' | 'SOLID' | 'LEAKY' => {
    const norm = delta / m.length;
    if (kind === 'fin') {
      if (norm >= 0.10) return 'CLINICAL';
      if (norm <= -0.10) return 'WASTEFUL';
      return 'MET';
    } else {
      if (norm >= 0.10) return 'SOLID';
      if (norm <= -0.10) return 'LEAKY';
      return 'MET';
    }
  };
  const cleanSheets = m.filter((x) => x.ga === 0).length;
  return {
    matches: m.length,
    goalsFor, xgFor, goalsAgainst, xgAgainst, shots, shotsOn, cleanSheets,
    xgPer: xgFor / m.length,
    xgaPer: xgAgainst / m.length,
    goalsPer: goalsFor / m.length,
    goalsAgainstPer: goalsAgainst / m.length,
    finishing, defending,
    finishingTier: tier(finishing, 'fin') as 'CLINICAL' | 'MET' | 'WASTEFUL',
    defendingTier: tier(defending, 'def') as 'SOLID' | 'MET' | 'LEAKY',
    fromDate: m[0].date,
    toDate: m[m.length - 1].date,
  };
}

export const QUAL_XG_SOURCE = {
  url: 'https://www.wyscout.com/',
  asOf: '2026-05-02',
};

// ============================================================
// TEAM DATA — adding teams as Wyscout exports arrive
// ============================================================

export const QUAL_XG: TeamXg[] = [
  {
    team: 'Colombia',
    matches: [
      { date: '2023-09-08', opponent: 'Venezuela', venue: 'H', gf: 1, ga: 0, xg: 1.08, xga: 0.62, shots: 12, shotsOn:  3, oppShots:  7, oppShotsOn: 2 },
      { date: '2023-09-13', opponent: 'Chile',     venue: 'A', gf: 0, ga: 0, xg: 0.25, xga: 1.39, shots:  7, shotsOn:  2, oppShots:  9, oppShotsOn: 5 },
      { date: '2023-10-12', opponent: 'Uruguay',   venue: 'H', gf: 2, ga: 2, xg: 1.69, xga: 2.43, shots: 13, shotsOn:  4, oppShots: 15, oppShotsOn: 6 },
      { date: '2023-10-18', opponent: 'Ecuador',   venue: 'A', gf: 0, ga: 0, xg: 1.22, xga: 0.51, shots:  7, shotsOn:  3, oppShots:  7, oppShotsOn: 2 },
      { date: '2023-11-17', opponent: 'Brazil',    venue: 'H', gf: 2, ga: 1, xg: 1.66, xga: 0.81, shots: 22, shotsOn: 10, oppShots: 11, oppShotsOn: 3 },
      { date: '2023-11-22', opponent: 'Paraguay',  venue: 'A', gf: 1, ga: 0, xg: 2.49, xga: 0.70, shots: 11, shotsOn:  4, oppShots: 11, oppShotsOn: 2 },
      { date: '2024-09-07', opponent: 'Peru',      venue: 'A', gf: 1, ga: 1, xg: 1.16, xga: 0.67, shots: 14, shotsOn:  5, oppShots:  8, oppShotsOn: 2 },
      { date: '2024-09-10', opponent: 'Argentina', venue: 'H', gf: 2, ga: 1, xg: 1.58, xga: 1.34, shots:  7, shotsOn:  5, oppShots: 11, oppShotsOn: 1 },
      { date: '2024-10-10', opponent: 'Bolivia',   venue: 'A', gf: 0, ga: 1, xg: 2.58, xga: 0.40, shots: 19, shotsOn:  8, oppShots: 12, oppShotsOn: 8 },
      { date: '2024-10-15', opponent: 'Chile',     venue: 'H', gf: 4, ga: 0, xg: 3.12, xga: 0.31, shots: 19, shotsOn:  9, oppShots:  8, oppShotsOn: 2 },
      { date: '2024-11-16', opponent: 'Uruguay',   venue: 'A', gf: 2, ga: 3, xg: 1.64, xga: 1.21, shots: 10, shotsOn:  4, oppShots: 10, oppShotsOn: 5 },
      { date: '2024-11-20', opponent: 'Ecuador',   venue: 'H', gf: 0, ga: 1, xg: 3.06, xga: 0.27, shots: 24, shotsOn:  7, oppShots:  4, oppShotsOn: 1 },
      { date: '2025-03-21', opponent: 'Brazil',    venue: 'A', gf: 1, ga: 2, xg: 1.05, xga: 2.15, shots: 10, shotsOn:  2, oppShots: 13, oppShotsOn: 7 },
      { date: '2025-03-26', opponent: 'Paraguay',  venue: 'H', gf: 2, ga: 2, xg: 1.10, xga: 1.99, shots:  9, shotsOn:  5, oppShots: 20, oppShotsOn: 5 },
      { date: '2025-06-06', opponent: 'Peru',      venue: 'H', gf: 0, ga: 0, xg: 0.90, xga: 0.44, shots: 13, shotsOn:  0, oppShots:  4, oppShotsOn: 1 },
      { date: '2025-06-11', opponent: 'Argentina', venue: 'A', gf: 1, ga: 1, xg: 1.05, xga: 1.68, shots:  8, shotsOn:  5, oppShots: 12, oppShotsOn: 4 },
      { date: '2025-09-05', opponent: 'Bolivia',   venue: 'H', gf: 3, ga: 0, xg: 1.34, xga: 0.26, shots: 12, shotsOn:  8, oppShots:  7, oppShotsOn: 3 },
      { date: '2025-09-10', opponent: 'Venezuela', venue: 'A', gf: 6, ga: 3, xg: 2.65, xga: 1.59, shots: 12, shotsOn:  9, oppShots: 10, oppShotsOn: 7 },
    ],
  },
  {
    team: 'Mexico',
    note: 'Host nation — no WC qualifying matches. Sample is 19 friendlies (incl. Brazil, Uruguay x2, Switzerland, Türkiye, Japan, South Korea, Colombia, Portugal, Belgium) plus 3 Copa America 2024 matches (Jamaica, Venezuela, Ecuador). Heavy quality-of-opposition exposure.',
    matches: [
      { date: '2024-06-01', opponent: 'Bolivia',        venue: 'H', gf: 1, ga: 0, xg: 2.18, xga: 0.37, shots: 15, shotsOn:  4, oppShots:  9, oppShotsOn: 1 },
      { date: '2024-06-06', opponent: 'Uruguay',        venue: 'H', gf: 0, ga: 4, xg: 0.39, xga: 2.44, shots:  8, shotsOn:  3, oppShots:  8, oppShotsOn: 4 },
      { date: '2024-06-09', opponent: 'Brazil',         venue: 'H', gf: 2, ga: 3, xg: 0.86, xga: 1.16, shots: 10, shotsOn:  4, oppShots:  8, oppShotsOn: 5 },
      { date: '2024-06-23', opponent: 'Jamaica',        venue: 'H', gf: 1, ga: 0, xg: 1.12, xga: 0.39, shots: 17, shotsOn:  9, oppShots: 14, oppShotsOn: 4 },
      { date: '2024-06-27', opponent: 'Venezuela',      venue: 'A', gf: 0, ga: 1, xg: 3.05, xga: 1.10, shots: 17, shotsOn:  6, oppShots: 10, oppShotsOn: 2 },
      { date: '2024-07-01', opponent: 'Ecuador',        venue: 'H', gf: 0, ga: 0, xg: 1.91, xga: 0.28, shots: 19, shotsOn:  4, oppShots:  7, oppShotsOn: 2 },
      { date: '2024-09-08', opponent: 'New Zealand',    venue: 'H', gf: 3, ga: 0, xg: 2.19, xga: 0.01, shots: 13, shotsOn:  6, oppShots:  2, oppShotsOn: 0 },
      { date: '2024-09-11', opponent: 'Canada',         venue: 'H', gf: 0, ga: 0, xg: 1.11, xga: 0.19, shots: 10, shotsOn:  3, oppShots:  4, oppShotsOn: 1 },
      { date: '2024-10-16', opponent: 'United States',  venue: 'H', gf: 2, ga: 0, xg: 1.27, xga: 0.23, shots: 17, shotsOn:  4, oppShots:  3, oppShotsOn: 1 },
      { date: '2025-06-07', opponent: 'Switzerland',    venue: 'H', gf: 2, ga: 4, xg: 1.33, xga: 2.03, shots: 10, shotsOn:  5, oppShots: 13, oppShotsOn: 6 },
      { date: '2025-06-11', opponent: 'Türkiye',        venue: 'H', gf: 1, ga: 0, xg: 0.90, xga: 0.81, shots:  6, shotsOn:  3, oppShots: 16, oppShotsOn: 1 },
      { date: '2025-09-07', opponent: 'Japan',          venue: 'H', gf: 0, ga: 0, xg: 0.47, xga: 0.73, shots:  8, shotsOn:  1, oppShots:  8, oppShotsOn: 1 },
      { date: '2025-09-10', opponent: 'Korea Republic', venue: 'H', gf: 2, ga: 2, xg: 1.02, xga: 0.99, shots: 17, shotsOn:  6, oppShots:  8, oppShotsOn: 3 },
      { date: '2025-10-12', opponent: 'Colombia',       venue: 'H', gf: 0, ga: 4, xg: 0.83, xga: 1.39, shots: 11, shotsOn:  3, oppShots:  8, oppShotsOn: 5 },
      { date: '2025-10-15', opponent: 'Ecuador',        venue: 'H', gf: 1, ga: 1, xg: 1.38, xga: 1.00, shots: 11, shotsOn:  4, oppShots:  6, oppShotsOn: 3 },
      { date: '2025-11-16', opponent: 'Uruguay',        venue: 'H', gf: 0, ga: 0, xg: 0.50, xga: 0.18, shots: 10, shotsOn:  3, oppShots:  3, oppShotsOn: 2 },
      { date: '2025-11-19', opponent: 'Paraguay',       venue: 'H', gf: 1, ga: 2, xg: 2.23, xga: 2.52, shots:  9, shotsOn:  5, oppShots: 12, oppShotsOn: 7 },
      { date: '2026-01-23', opponent: 'Panama',         venue: 'A', gf: 1, ga: 0, xg: 1.05, xga: 0.07, shots: 11, shotsOn:  3, oppShots:  4, oppShotsOn: 1 },
      { date: '2026-01-25', opponent: 'Bolivia',        venue: 'A', gf: 1, ga: 0, xg: 0.72, xga: 0.65, shots:  3, shotsOn:  2, oppShots:  8, oppShotsOn: 2 },
      { date: '2026-02-26', opponent: 'Iceland',        venue: 'H', gf: 4, ga: 0, xg: 2.44, xga: 0.40, shots: 23, shotsOn: 10, oppShots:  3, oppShotsOn: 2 },
      { date: '2026-03-29', opponent: 'Portugal',       venue: 'H', gf: 0, ga: 0, xg: 0.27, xga: 1.24, shots:  7, shotsOn:  1, oppShots:  9, oppShotsOn: 2 },
      { date: '2026-04-01', opponent: 'Belgium',        venue: 'H', gf: 1, ga: 1, xg: 0.54, xga: 0.10, shots:  6, shotsOn:  2, oppShots:  4, oppShotsOn: 2 },
    ],
  },
  {
    team: 'United States',
    note: 'Host nation — no WC qualifying matches. Sample is 17 friendlies (incl. Brazil, Türkiye, Switzerland, South Korea, Japan, Australia, Belgium, Portugal, Uruguay) plus 3 Copa America 2024 matches (Bolivia, Panama, Uruguay). Heavy quality-of-opposition exposure.',
    matches: [
      { date: '2024-06-13', opponent: 'Brazil',         venue: 'H', gf: 1, ga: 1, xg: 1.10, xga: 1.60, shots: 12, shotsOn:  7, oppShots: 22, oppShotsOn: 10 },
      { date: '2024-06-24', opponent: 'Bolivia',        venue: 'H', gf: 2, ga: 0, xg: 3.05, xga: 0.21, shots: 19, shotsOn:  8, oppShots:  6, oppShotsOn:  3 },
      { date: '2024-06-28', opponent: 'Panama',         venue: 'A', gf: 1, ga: 2, xg: 1.28, xga: 0.91, shots:  5, shotsOn:  3, oppShots: 11, oppShotsOn:  4 },
      { date: '2024-07-02', opponent: 'Uruguay',        venue: 'H', gf: 0, ga: 1, xg: 0.50, xga: 1.63, shots:  6, shotsOn:  0, oppShots: 12, oppShotsOn:  4 },
      { date: '2024-09-07', opponent: 'Canada',         venue: 'H', gf: 1, ga: 2, xg: 1.45, xga: 1.93, shots:  7, shotsOn:  5, oppShots: 16, oppShotsOn:  6 },
      { date: '2024-09-11', opponent: 'New Zealand',    venue: 'H', gf: 1, ga: 1, xg: 0.93, xga: 0.64, shots: 16, shotsOn:  5, oppShots:  7, oppShotsOn:  4 },
      { date: '2024-10-13', opponent: 'Panama',         venue: 'H', gf: 2, ga: 0, xg: 1.88, xga: 2.12, shots: 11, shotsOn:  4, oppShots: 13, oppShotsOn:  3 },
      { date: '2024-10-16', opponent: 'Mexico',         venue: 'A', gf: 0, ga: 2, xg: 0.23, xga: 1.27, shots:  3, shotsOn:  1, oppShots: 17, oppShotsOn:  4 },
      { date: '2025-01-18', opponent: 'Venezuela',      venue: 'H', gf: 3, ga: 1, xg: 2.18, xga: 1.00, shots: 14, shotsOn: 10, oppShots: 11, oppShotsOn:  4 },
      { date: '2025-01-23', opponent: 'Costa Rica',     venue: 'H', gf: 3, ga: 0, xg: 1.19, xga: 0.34, shots: 11, shotsOn:  5, oppShots:  9, oppShotsOn:  3 },
      { date: '2025-06-07', opponent: 'Türkiye',        venue: 'H', gf: 1, ga: 2, xg: 1.13, xga: 1.92, shots: 13, shotsOn:  3, oppShots: 10, oppShotsOn:  5 },
      { date: '2025-06-11', opponent: 'Switzerland',    venue: 'H', gf: 0, ga: 4, xg: 0.25, xga: 2.54, shots:  5, shotsOn:  0, oppShots: 11, oppShotsOn:  7 },
      { date: '2025-09-06', opponent: 'Korea Republic', venue: 'H', gf: 0, ga: 2, xg: 2.87, xga: 0.76, shots: 17, shotsOn:  3, oppShots:  5, oppShotsOn:  4 },
      { date: '2025-09-10', opponent: 'Japan',          venue: 'H', gf: 2, ga: 0, xg: 3.22, xga: 1.86, shots: 19, shotsOn: 11, oppShots: 11, oppShotsOn:  6 },
      { date: '2025-10-11', opponent: 'Ecuador',        venue: 'H', gf: 1, ga: 1, xg: 1.82, xga: 0.54, shots: 11, shotsOn:  5, oppShots:  8, oppShotsOn:  4 },
      { date: '2025-10-15', opponent: 'Australia',      venue: 'H', gf: 2, ga: 1, xg: 1.27, xga: 1.05, shots: 10, shotsOn:  4, oppShots:  8, oppShotsOn:  3 },
      { date: '2025-11-15', opponent: 'Paraguay',       venue: 'H', gf: 2, ga: 1, xg: 1.53, xga: 0.52, shots:  8, shotsOn:  4, oppShots:  7, oppShotsOn:  3 },
      { date: '2025-11-19', opponent: 'Uruguay',        venue: 'H', gf: 5, ga: 1, xg: 1.41, xga: 0.84, shots:  9, shotsOn:  7, oppShots: 10, oppShotsOn:  2 },
      { date: '2026-03-28', opponent: 'Belgium',        venue: 'H', gf: 2, ga: 5, xg: 1.62, xga: 2.69, shots: 11, shotsOn:  5, oppShots: 20, oppShotsOn:  9 },
      { date: '2026-04-01', opponent: 'Portugal',       venue: 'H', gf: 0, ga: 2, xg: 0.73, xga: 1.06, shots: 12, shotsOn:  3, oppShots: 11, oppShotsOn:  5 },
    ],
  },
  {
    team: 'Canada',
    note: 'Host nation — no WC qualifying matches. Sample is Copa America 2024 (6 matches: Argentina x2, Uruguay, Chile, Peru, Venezuela) + 13 friendlies (Netherlands, France, USA, Mexico, Ukraine, Romania, Wales, Australia, Colombia, Ecuador, Venezuela, Iceland, Tunisia). Heavy top-tier opposition — directly comparable to WC quality.',
    matches: [
      { date: '2024-06-06', opponent: 'Netherlands',   venue: 'A', gf: 0, ga: 4, xg: 0.71, xga: 2.55, shots:  6, shotsOn: 2, oppShots: 19, oppShotsOn: 11 },
      { date: '2024-06-09', opponent: 'France',        venue: 'A', gf: 0, ga: 0, xg: 0.19, xga: 1.25, shots:  9, shotsOn: 0, oppShots: 10, oppShotsOn:  4 },
      { date: '2024-06-21', opponent: 'Argentina',     venue: 'A', gf: 0, ga: 2, xg: 1.50, xga: 2.46, shots: 10, shotsOn: 2, oppShots: 19, oppShotsOn:  9 },
      { date: '2024-06-26', opponent: 'Peru',          venue: 'A', gf: 1, ga: 0, xg: 0.83, xga: 0.74, shots:  3, shotsOn: 2, oppShots:  8, oppShotsOn:  4 },
      { date: '2024-06-30', opponent: 'Chile',         venue: 'H', gf: 0, ga: 0, xg: 1.13, xga: 0.51, shots: 10, shotsOn: 3, oppShots:  8, oppShotsOn:  3 },
      { date: '2024-07-06', opponent: 'Venezuela',     venue: 'A', gf: 1, ga: 1, xg: 1.55, xga: 0.77, shots: 16, shotsOn: 7, oppShots: 12, oppShotsOn:  3 },
      { date: '2024-07-10', opponent: 'Argentina',     venue: 'A', gf: 0, ga: 2, xg: 0.66, xga: 1.38, shots:  9, shotsOn: 2, oppShots: 10, oppShotsOn:  3 },
      { date: '2024-07-14', opponent: 'Uruguay',       venue: 'H', gf: 2, ga: 2, xg: 2.68, xga: 0.93, shots: 11, shotsOn: 6, oppShots: 10, oppShotsOn:  5 },
      { date: '2024-09-07', opponent: 'United States', venue: 'A', gf: 2, ga: 1, xg: 1.93, xga: 1.45, shots: 16, shotsOn: 6, oppShots:  7, oppShotsOn:  5 },
      { date: '2024-09-11', opponent: 'Mexico',        venue: 'A', gf: 0, ga: 0, xg: 0.19, xga: 1.11, shots:  4, shotsOn: 1, oppShots: 10, oppShotsOn:  3 },
      { date: '2025-06-07', opponent: 'Ukraine',       venue: 'H', gf: 4, ga: 2, xg: 2.95, xga: 2.26, shots: 11, shotsOn: 6, oppShots: 13, oppShotsOn:  8 },
      { date: '2025-09-05', opponent: 'Romania',       venue: 'A', gf: 3, ga: 0, xg: 1.80, xga: 1.04, shots: 14, shotsOn: 8, oppShots: 11, oppShotsOn:  2 },
      { date: '2025-09-09', opponent: 'Wales',         venue: 'A', gf: 1, ga: 0, xg: 0.94, xga: 0.92, shots: 11, shotsOn: 2, oppShots:  6, oppShotsOn:  4 },
      { date: '2025-10-11', opponent: 'Australia',     venue: 'H', gf: 0, ga: 1, xg: 2.61, xga: 0.71, shots: 16, shotsOn: 8, oppShots:  6, oppShotsOn:  1 },
      { date: '2025-10-15', opponent: 'Colombia',      venue: 'H', gf: 0, ga: 0, xg: 0.10, xga: 0.84, shots:  4, shotsOn: 1, oppShots:  7, oppShotsOn:  1 },
      { date: '2025-11-14', opponent: 'Ecuador',       venue: 'H', gf: 0, ga: 0, xg: 0.48, xga: 0.41, shots:  4, shotsOn: 1, oppShots:  4, oppShotsOn:  0 },
      { date: '2025-11-18', opponent: 'Venezuela',     venue: 'A', gf: 2, ga: 0, xg: 0.99, xga: 1.27, shots:  7, shotsOn: 4, oppShots: 10, oppShotsOn:  3 },
      { date: '2026-03-28', opponent: 'Iceland',       venue: 'H', gf: 2, ga: 2, xg: 2.33, xga: 0.47, shots: 14, shotsOn: 5, oppShots:  4, oppShotsOn:  3 },
      { date: '2026-04-01', opponent: 'Tunisia',       venue: 'H', gf: 0, ga: 0, xg: 0.77, xga: 0.63, shots: 12, shotsOn: 6, oppShots:  3, oppShotsOn:  1 },
    ],
  },
  {
    team: 'Qatar',
    matches: [
      { date: '2023-11-16', opponent: 'Afghanistan', venue: 'H', gf: 8, ga: 1, xg: 5.77, xga: 0.19, shots: 26, shotsOn: 16, oppShots:  2, oppShotsOn: 1 },
      { date: '2023-11-21', opponent: 'India',       venue: 'A', gf: 3, ga: 0, xg: 2.81, xga: 0.50, shots: 20, shotsOn:  6, oppShots:  6, oppShotsOn: 0 },
      { date: '2024-03-21', opponent: 'Kuwait',      venue: 'H', gf: 3, ga: 0, xg: 2.58, xga: 0.67, shots: 14, shotsOn:  8, oppShots:  5, oppShotsOn: 1 },
      { date: '2024-03-26', opponent: 'Kuwait',      venue: 'A', gf: 2, ga: 1, xg: 1.25, xga: 1.24, shots: 11, shotsOn:  6, oppShots: 16, oppShotsOn: 3 },
      { date: '2024-06-06', opponent: 'Afghanistan', venue: 'A', gf: 0, ga: 0, xg: 1.00, xga: 0.08, shots:  9, shotsOn:  1, oppShots:  2, oppShotsOn: 1 },
      { date: '2024-06-11', opponent: 'India',       venue: 'H', gf: 2, ga: 1, xg: 2.95, xga: 1.15, shots: 18, shotsOn:  7, oppShots:  8, oppShotsOn: 2 },
      { date: '2024-09-05', opponent: 'UAE',         venue: 'H', gf: 1, ga: 3, xg: 0.43, xga: 0.57, shots:  6, shotsOn:  1, oppShots:  9, oppShotsOn: 3 },
      { date: '2024-09-10', opponent: 'Korea DPR',   venue: 'A', gf: 2, ga: 2, xg: 2.30, xga: 0.55, shots: 20, shotsOn:  6, oppShots: 10, oppShotsOn: 5 },
      { date: '2024-10-10', opponent: 'Kyrgyzstan',  venue: 'H', gf: 3, ga: 1, xg: 2.73, xga: 0.42, shots: 26, shotsOn:  7, oppShots:  7, oppShotsOn: 3 },
      { date: '2024-10-15', opponent: 'Iran',        venue: 'A', gf: 1, ga: 4, xg: 0.58, xga: 2.53, shots: 10, shotsOn:  1, oppShots: 16, oppShotsOn: 8 },
      { date: '2024-11-14', opponent: 'Uzbekistan',  venue: 'H', gf: 3, ga: 2, xg: 1.71, xga: 2.24, shots: 10, shotsOn:  7, oppShots: 19, oppShotsOn: 8 },
      { date: '2024-11-19', opponent: 'UAE',         venue: 'A', gf: 0, ga: 5, xg: 0.88, xga: 2.21, shots: 10, shotsOn:  0, oppShots:  9, oppShotsOn: 6 },
      { date: '2025-03-25', opponent: 'Kyrgyzstan',  venue: 'A', gf: 1, ga: 3, xg: 0.47, xga: 0.99, shots:  8, shotsOn:  4, oppShots: 15, oppShotsOn: 6 },
      { date: '2025-06-05', opponent: 'Iran',        venue: 'H', gf: 1, ga: 0, xg: 0.83, xga: 0.33, shots:  6, shotsOn:  3, oppShots:  5, oppShotsOn: 3 },
      { date: '2025-06-10', opponent: 'Uzbekistan',  venue: 'A', gf: 0, ga: 3, xg: 0.23, xga: 2.33, shots:  2, shotsOn:  0, oppShots: 16, oppShotsOn: 7 },
      { date: '2025-10-08', opponent: 'Oman',        venue: 'A', gf: 0, ga: 0, xg: 0.60, xga: 0.22, shots: 12, shotsOn:  2, oppShots:  6, oppShotsOn: 1 },
      { date: '2025-10-14', opponent: 'UAE',         venue: 'H', gf: 2, ga: 1, xg: 0.89, xga: 0.89, shots:  6, shotsOn:  3, oppShots: 13, oppShotsOn: 4 },
    ],
  },
  {
    team: 'Czechia',
    matches: [
      { date: '2025-03-22', opponent: 'Faroe Islands',       venue: 'H', gf: 2, ga: 1, xg: 3.05, xga: 0.32, shots: 14, shotsOn:  6, oppShots:  5, oppShotsOn:  3 },
      { date: '2025-03-25', opponent: 'Gibraltar',           venue: 'A', gf: 4, ga: 0, xg: 3.99, xga: 0.00, shots: 29, shotsOn: 12, oppShots:  0, oppShotsOn:  0 },
      { date: '2025-06-06', opponent: 'Montenegro',          venue: 'H', gf: 2, ga: 0, xg: 1.06, xga: 1.29, shots: 12, shotsOn:  7, oppShots:  5, oppShotsOn:  2 },
      { date: '2025-06-09', opponent: 'Croatia',             venue: 'A', gf: 1, ga: 5, xg: 1.68, xga: 3.62, shots: 12, shotsOn:  5, oppShots: 18, oppShotsOn: 11 },
      { date: '2025-09-05', opponent: 'Montenegro',          venue: 'A', gf: 2, ga: 0, xg: 2.06, xga: 1.39, shots: 18, shotsOn: 10, oppShots: 19, oppShotsOn:  5 },
      { date: '2025-10-09', opponent: 'Croatia',             venue: 'H', gf: 0, ga: 0, xg: 0.70, xga: 0.69, shots: 10, shotsOn:  2, oppShots:  9, oppShotsOn:  2 },
      { date: '2025-10-12', opponent: 'Faroe Islands',       venue: 'A', gf: 1, ga: 2, xg: 1.84, xga: 0.39, shots: 12, shotsOn:  1, oppShots:  5, oppShotsOn:  3 },
      { date: '2025-11-17', opponent: 'Gibraltar',           venue: 'H', gf: 6, ga: 0, xg: 2.88, xga: 0.00, shots: 23, shotsOn: 10, oppShots:  0, oppShotsOn:  0 },
      { date: '2026-03-26', opponent: 'Republic of Ireland', venue: 'H', gf: 2, ga: 2, xg: 2.00, xga: 1.23, shots: 12, shotsOn:  4, oppShots:  9, oppShotsOn:  3 },
      { date: '2026-03-31', opponent: 'Denmark',             venue: 'H', gf: 2, ga: 2, xg: 0.46, xga: 1.96, shots:  7, shotsOn:  4, oppShots: 22, oppShotsOn:  7 },
    ],
  },
  {
    team: 'Türkiye',
    matches: [
      { date: '2025-09-04', opponent: 'Georgia',  venue: 'A', gf: 3, ga: 2, xg: 0.70, xga: 1.09, shots:  5, shotsOn: 3, oppShots: 13, oppShotsOn:  4 },
      { date: '2025-09-07', opponent: 'Spain',    venue: 'H', gf: 0, ga: 6, xg: 0.42, xga: 3.14, shots: 13, shotsOn: 2, oppShots: 21, oppShotsOn: 12 },
      { date: '2025-10-11', opponent: 'Bulgaria', venue: 'A', gf: 6, ga: 1, xg: 1.84, xga: 0.53, shots: 17, shotsOn: 8, oppShots:  5, oppShotsOn:  2 },
      { date: '2025-10-14', opponent: 'Georgia',  venue: 'H', gf: 4, ga: 1, xg: 1.24, xga: 0.85, shots:  9, shotsOn: 6, oppShots: 11, oppShotsOn:  3 },
      { date: '2025-11-15', opponent: 'Bulgaria', venue: 'H', gf: 2, ga: 0, xg: 2.46, xga: 0.31, shots: 19, shotsOn: 6, oppShots:  7, oppShotsOn:  2 },
      { date: '2025-11-18', opponent: 'Spain',    venue: 'A', gf: 2, ga: 2, xg: 1.43, xga: 3.08, shots: 13, shotsOn: 7, oppShots: 21, oppShotsOn:  9 },
      { date: '2026-03-26', opponent: 'Romania',  venue: 'H', gf: 1, ga: 0, xg: 0.88, xga: 0.66, shots: 16, shotsOn: 2, oppShots:  6, oppShotsOn:  0 },
      { date: '2026-03-31', opponent: 'Kosovo',   venue: 'A', gf: 1, ga: 0, xg: 1.62, xga: 1.08, shots: 11, shotsOn: 3, oppShots: 11, oppShotsOn:  2 },
    ],
  },
  {
    team: 'Bosnia and Herzegovina',
    matches: [
      { date: '2025-03-21', opponent: 'Romania',    venue: 'A', gf: 1, ga: 0, xg: 0.96, xga: 1.30, shots:  3, shotsOn:  1, oppShots: 15, oppShotsOn: 3 },
      { date: '2025-03-24', opponent: 'Cyprus',     venue: 'H', gf: 2, ga: 1, xg: 1.61, xga: 1.88, shots: 13, shotsOn:  6, oppShots: 11, oppShotsOn: 4 },
      { date: '2025-06-07', opponent: 'San Marino', venue: 'H', gf: 1, ga: 0, xg: 2.62, xga: 0.47, shots: 21, shotsOn:  7, oppShots:  6, oppShotsOn: 0 },
      { date: '2025-09-06', opponent: 'San Marino', venue: 'A', gf: 6, ga: 0, xg: 3.93, xga: 0.11, shots: 21, shotsOn: 10, oppShots:  4, oppShotsOn: 1 },
      { date: '2025-09-09', opponent: 'Austria',    venue: 'H', gf: 1, ga: 2, xg: 1.84, xga: 1.81, shots: 13, shotsOn:  3, oppShots:  9, oppShotsOn: 4 },
      { date: '2025-10-09', opponent: 'Cyprus',     venue: 'A', gf: 2, ga: 2, xg: 1.64, xga: 2.83, shots: 13, shotsOn:  6, oppShots: 12, oppShotsOn: 2 },
      { date: '2025-11-15', opponent: 'Romania',    venue: 'H', gf: 3, ga: 1, xg: 1.75, xga: 1.18, shots: 15, shotsOn:  4, oppShots:  9, oppShotsOn: 4 },
      { date: '2025-11-18', opponent: 'Austria',    venue: 'A', gf: 1, ga: 1, xg: 0.95, xga: 1.02, shots:  4, shotsOn:  2, oppShots: 10, oppShotsOn: 3 },
      { date: '2026-03-26', opponent: 'Wales',      venue: 'A', gf: 1, ga: 1, xg: 1.85, xga: 1.48, shots: 18, shotsOn:  4, oppShots: 17, oppShotsOn: 3 },
      { date: '2026-03-31', opponent: 'Italy',      venue: 'H', gf: 1, ga: 1, xg: 2.65, xga: 1.47, shots: 29, shotsOn: 11, oppShots:  9, oppShotsOn: 3 },
    ],
  },
  {
    team: 'Sweden',
    note: 'Data spans a managerial change. First 6 matches under previous coach (poor group: 0-2 Kosovo, 1-4 Switzerland away). Last 2 matches (Mar 2026) under Potter — 3-1 Ukraine + 3-2 Poland in UEFA playoffs. Aggregate masks the recent improvement.',
    matches: [
      { date: '2025-09-05', opponent: 'Slovenia',    venue: 'A', gf: 2, ga: 2, xg: 1.04, xga: 0.46, shots:  6, shotsOn: 2, oppShots:  8, oppShotsOn: 4 },
      { date: '2025-09-08', opponent: 'Kosovo',      venue: 'A', gf: 0, ga: 2, xg: 0.60, xga: 1.68, shots: 13, shotsOn: 4, oppShots: 10, oppShotsOn: 5 },
      { date: '2025-10-10', opponent: 'Switzerland', venue: 'H', gf: 0, ga: 2, xg: 1.28, xga: 2.59, shots:  7, shotsOn: 0, oppShots: 17, oppShotsOn: 6 },
      { date: '2025-10-13', opponent: 'Kosovo',      venue: 'H', gf: 0, ga: 1, xg: 0.90, xga: 1.44, shots: 14, shotsOn: 4, oppShots:  8, oppShotsOn: 3 },
      { date: '2025-11-15', opponent: 'Switzerland', venue: 'A', gf: 1, ga: 4, xg: 0.77, xga: 2.16, shots:  6, shotsOn: 3, oppShots:  8, oppShotsOn: 7 },
      { date: '2025-11-18', opponent: 'Slovenia',    venue: 'H', gf: 1, ga: 1, xg: 1.01, xga: 2.17, shots: 11, shotsOn: 2, oppShots: 17, oppShotsOn: 5 },
      { date: '2026-03-26', opponent: 'Ukraine',     venue: 'A', gf: 3, ga: 1, xg: 2.58, xga: 1.13, shots: 10, shotsOn: 4, oppShots: 11, oppShotsOn: 5 },
      { date: '2026-03-31', opponent: 'Poland',      venue: 'H', gf: 3, ga: 2, xg: 1.50, xga: 1.36, shots:  9, shotsOn: 5, oppShots: 13, oppShotsOn: 6 },
    ],
  },
  {
    team: 'Switzerland',
    matches: [
      { date: '2025-09-05', opponent: 'Kosovo',   venue: 'H', gf: 4, ga: 0, xg: 1.96, xga: 0.27, shots:  9, shotsOn: 5, oppShots:  6, oppShotsOn: 1 },
      { date: '2025-09-08', opponent: 'Slovenia', venue: 'H', gf: 3, ga: 0, xg: 1.19, xga: 0.81, shots: 12, shotsOn: 6, oppShots:  9, oppShotsOn: 1 },
      { date: '2025-10-10', opponent: 'Sweden',   venue: 'A', gf: 2, ga: 0, xg: 2.59, xga: 1.28, shots: 17, shotsOn: 6, oppShots:  7, oppShotsOn: 0 },
      { date: '2025-10-13', opponent: 'Slovenia', venue: 'A', gf: 0, ga: 0, xg: 0.46, xga: 0.35, shots: 10, shotsOn: 3, oppShots:  4, oppShotsOn: 0 },
      { date: '2025-11-15', opponent: 'Sweden',   venue: 'H', gf: 4, ga: 1, xg: 2.16, xga: 0.77, shots:  8, shotsOn: 7, oppShots:  6, oppShotsOn: 3 },
      { date: '2025-11-18', opponent: 'Kosovo',   venue: 'A', gf: 1, ga: 1, xg: 0.48, xga: 0.50, shots:  7, shotsOn: 3, oppShots: 10, oppShotsOn: 4 },
    ],
  },
  {
    team: 'Croatia',
    matches: [
      { date: '2025-06-06', opponent: 'Gibraltar',     venue: 'A', gf: 7, ga: 0, xg: 4.08, xga: 0.25, shots: 23, shotsOn: 12, oppShots:  3, oppShotsOn: 0 },
      { date: '2025-06-09', opponent: 'Czechia',       venue: 'H', gf: 5, ga: 1, xg: 3.62, xga: 1.68, shots: 18, shotsOn: 11, oppShots: 12, oppShotsOn: 5 },
      { date: '2025-09-05', opponent: 'Faroe Islands', venue: 'A', gf: 1, ga: 0, xg: 2.03, xga: 0.78, shots: 23, shotsOn:  8, oppShots:  6, oppShotsOn: 3 },
      { date: '2025-09-08', opponent: 'Montenegro',    venue: 'H', gf: 4, ga: 0, xg: 3.30, xga: 0.16, shots: 30, shotsOn: 11, oppShots:  1, oppShotsOn: 0 },
      { date: '2025-10-09', opponent: 'Czechia',       venue: 'A', gf: 0, ga: 0, xg: 0.69, xga: 0.70, shots:  9, shotsOn:  2, oppShots: 10, oppShotsOn: 2 },
      { date: '2025-10-12', opponent: 'Gibraltar',     venue: 'H', gf: 3, ga: 0, xg: 3.98, xga: 0.01, shots: 26, shotsOn:  8, oppShots:  1, oppShotsOn: 0 },
      { date: '2025-11-14', opponent: 'Faroe Islands', venue: 'H', gf: 3, ga: 1, xg: 2.04, xga: 0.51, shots: 19, shotsOn:  6, oppShots:  4, oppShotsOn: 4 },
      { date: '2025-11-17', opponent: 'Montenegro',    venue: 'A', gf: 3, ga: 2, xg: 3.14, xga: 0.95, shots: 16, shotsOn:  7, oppShots: 14, oppShotsOn: 5 },
    ],
  },
  {
    team: 'Norway',
    matches: [
      { date: '2025-03-22', opponent: 'Moldova', venue: 'A', gf:  5, ga: 0, xg: 3.12, xga: 1.29, shots: 24, shotsOn:  8, oppShots: 10, oppShotsOn: 4 },
      { date: '2025-03-25', opponent: 'Israel',  venue: 'A', gf:  4, ga: 2, xg: 3.76, xga: 0.63, shots: 23, shotsOn: 12, oppShots: 10, oppShotsOn: 6 },
      { date: '2025-06-06', opponent: 'Italy',   venue: 'H', gf:  3, ga: 0, xg: 1.51, xga: 0.19, shots:  8, shotsOn:  4, oppShots:  6, oppShotsOn: 1 },
      { date: '2025-06-09', opponent: 'Estonia', venue: 'A', gf:  1, ga: 0, xg: 2.39, xga: 0.47, shots: 16, shotsOn:  3, oppShots:  7, oppShotsOn: 1 },
      { date: '2025-09-09', opponent: 'Moldova', venue: 'H', gf: 11, ga: 1, xg: 8.10, xga: 0.17, shots: 35, shotsOn: 17, oppShots:  2, oppShotsOn: 0 },
      { date: '2025-10-11', opponent: 'Israel',  venue: 'H', gf:  5, ga: 0, xg: 2.51, xga: 0.19, shots: 16, shotsOn:  5, oppShots:  4, oppShotsOn: 1 },
      { date: '2025-11-13', opponent: 'Estonia', venue: 'H', gf:  4, ga: 1, xg: 2.48, xga: 0.67, shots: 17, shotsOn:  7, oppShots:  6, oppShotsOn: 3 },
      { date: '2025-11-16', opponent: 'Italy',   venue: 'A', gf:  4, ga: 1, xg: 1.42, xga: 0.89, shots: 10, shotsOn:  5, oppShots: 13, oppShotsOn: 4 },
    ],
  },
  {
    team: 'Belgium',
    matches: [
      { date: '2025-06-06', opponent: 'North Macedonia', venue: 'A', gf: 1, ga: 1, xg: 2.01, xga: 0.68, shots: 18, shotsOn:  4, oppShots: 7, oppShotsOn: 2 },
      { date: '2025-06-09', opponent: 'Wales',           venue: 'H', gf: 4, ga: 3, xg: 2.86, xga: 2.43, shots: 18, shotsOn:  4, oppShots: 9, oppShotsOn: 7 },
      { date: '2025-09-04', opponent: 'Liechtenstein',   venue: 'A', gf: 6, ga: 0, xg: 3.93, xga: 0.00, shots: 24, shotsOn:  9, oppShots: 0, oppShotsOn: 0 },
      { date: '2025-09-07', opponent: 'Kazakhstan',      venue: 'H', gf: 6, ga: 0, xg: 3.35, xga: 0.17, shots: 33, shotsOn: 14, oppShots: 5, oppShotsOn: 2 },
      { date: '2025-10-10', opponent: 'North Macedonia', venue: 'H', gf: 0, ga: 0, xg: 3.24, xga: 0.05, shots: 23, shotsOn:  5, oppShots: 3, oppShotsOn: 0 },
      { date: '2025-10-13', opponent: 'Wales',           venue: 'A', gf: 4, ga: 2, xg: 3.44, xga: 0.92, shots: 15, shotsOn:  6, oppShots: 8, oppShotsOn: 3 },
      { date: '2025-11-15', opponent: 'Kazakhstan',      venue: 'A', gf: 1, ga: 1, xg: 2.15, xga: 0.40, shots: 21, shotsOn:  8, oppShots: 8, oppShotsOn: 3 },
      { date: '2025-11-18', opponent: 'Liechtenstein',   venue: 'H', gf: 7, ga: 0, xg: 3.37, xga: 0.01, shots: 22, shotsOn: 12, oppShots: 1, oppShotsOn: 1 },
    ],
  },
  {
    team: 'Netherlands',
    matches: [
      { date: '2025-06-07', opponent: 'Finland',   venue: 'A', gf: 2, ga: 0, xg: 2.29, xga: 0.22, shots: 16, shotsOn: 5, oppShots:  4, oppShotsOn: 2 },
      { date: '2025-06-10', opponent: 'Malta',     venue: 'H', gf: 8, ga: 0, xg: 5.07, xga: 0.30, shots: 25, shotsOn: 9, oppShots:  5, oppShotsOn: 2 },
      { date: '2025-09-04', opponent: 'Poland',    venue: 'H', gf: 1, ga: 1, xg: 0.72, xga: 0.25, shots: 13, shotsOn: 4, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-09-07', opponent: 'Lithuania', venue: 'A', gf: 3, ga: 2, xg: 1.00, xga: 0.33, shots: 14, shotsOn: 7, oppShots:  4, oppShotsOn: 3 },
      { date: '2025-10-09', opponent: 'Malta',     venue: 'A', gf: 4, ga: 0, xg: 3.24, xga: 0.35, shots: 18, shotsOn: 8, oppShots:  7, oppShotsOn: 0 },
      { date: '2025-10-12', opponent: 'Finland',   venue: 'H', gf: 4, ga: 0, xg: 2.86, xga: 0.67, shots: 17, shotsOn: 6, oppShots:  7, oppShotsOn: 3 },
      { date: '2025-11-14', opponent: 'Poland',    venue: 'A', gf: 1, ga: 1, xg: 1.27, xga: 1.14, shots:  9, shotsOn: 3, oppShots: 13, oppShotsOn: 5 },
      { date: '2025-11-17', opponent: 'Lithuania', venue: 'H', gf: 4, ga: 0, xg: 3.20, xga: 0.47, shots: 19, shotsOn: 9, oppShots:  7, oppShotsOn: 1 },
    ],
  },
  {
    team: 'Scotland',
    matches: [
      { date: '2025-09-05', opponent: 'Denmark', venue: 'A', gf: 0, ga: 0, xg: 0.76, xga: 0.94, shots:  9, shotsOn: 1, oppShots: 15, oppShotsOn:  2 },
      { date: '2025-09-08', opponent: 'Belarus', venue: 'A', gf: 2, ga: 0, xg: 2.30, xga: 0.72, shots: 12, shotsOn: 7, oppShots:  6, oppShotsOn:  3 },
      { date: '2025-10-09', opponent: 'Greece',  venue: 'H', gf: 3, ga: 1, xg: 1.35, xga: 1.38, shots:  6, shotsOn: 3, oppShots: 13, oppShotsOn:  3 },
      { date: '2025-10-12', opponent: 'Belarus', venue: 'H', gf: 2, ga: 1, xg: 1.09, xga: 0.86, shots: 11, shotsOn: 5, oppShots: 18, oppShotsOn:  3 },
      { date: '2025-11-15', opponent: 'Greece',  venue: 'A', gf: 2, ga: 3, xg: 1.47, xga: 2.78, shots: 10, shotsOn: 6, oppShots: 18, oppShotsOn: 10 },
      { date: '2025-11-18', opponent: 'Denmark', venue: 'H', gf: 4, ga: 2, xg: 1.67, xga: 2.49, shots: 10, shotsOn: 5, oppShots: 21, oppShotsOn:  3 },
    ],
  },
  {
    team: 'Austria',
    matches: [
      { date: '2025-06-07', opponent: 'Romania',            venue: 'H', gf:  2, ga: 1, xg: 1.37, xga: 0.60, shots: 13, shotsOn:  9, oppShots:  9, oppShotsOn: 3 },
      { date: '2025-06-10', opponent: 'San Marino',         venue: 'A', gf:  4, ga: 0, xg: 4.66, xga: 0.68, shots: 21, shotsOn: 13, oppShots:  8, oppShotsOn: 2 },
      { date: '2025-09-06', opponent: 'Cyprus',             venue: 'H', gf:  1, ga: 0, xg: 2.04, xga: 1.66, shots: 11, shotsOn:  3, oppShots: 11, oppShotsOn: 5 },
      { date: '2025-09-09', opponent: 'Bosnia-Herzegovina', venue: 'A', gf:  2, ga: 1, xg: 1.81, xga: 1.84, shots:  9, shotsOn:  4, oppShots: 13, oppShotsOn: 3 },
      { date: '2025-10-09', opponent: 'San Marino',         venue: 'H', gf: 10, ga: 0, xg: 7.05, xga: 0.46, shots: 25, shotsOn: 15, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-10-12', opponent: 'Romania',            venue: 'A', gf:  0, ga: 1, xg: 0.11, xga: 0.59, shots:  3, shotsOn:  1, oppShots: 10, oppShotsOn: 2 },
      { date: '2025-11-15', opponent: 'Cyprus',             venue: 'A', gf:  2, ga: 0, xg: 2.18, xga: 0.39, shots: 12, shotsOn:  6, oppShots:  3, oppShotsOn: 0 },
      { date: '2025-11-18', opponent: 'Bosnia-Herzegovina', venue: 'H', gf:  1, ga: 1, xg: 1.02, xga: 0.95, shots: 10, shotsOn:  3, oppShots:  4, oppShotsOn: 2 },
    ],
  },
  {
    team: 'Germany',
    matches: [
      { date: '2025-09-04', opponent: 'Slovakia',         venue: 'A', gf: 0, ga: 2, xg: 1.69, xga: 1.24, shots: 13, shotsOn:  4, oppShots:  8, oppShotsOn: 5 },
      { date: '2025-09-07', opponent: 'Northern Ireland', venue: 'H', gf: 3, ga: 1, xg: 1.64, xga: 0.11, shots: 10, shotsOn:  6, oppShots:  2, oppShotsOn: 1 },
      { date: '2025-10-10', opponent: 'Luxembourg',       venue: 'H', gf: 4, ga: 0, xg: 3.35, xga: 0.16, shots: 23, shotsOn:  8, oppShots:  1, oppShotsOn: 1 },
      { date: '2025-10-13', opponent: 'Northern Ireland', venue: 'A', gf: 1, ga: 0, xg: 1.00, xga: 1.15, shots:  9, shotsOn:  2, oppShots: 14, oppShotsOn: 5 },
      { date: '2025-11-14', opponent: 'Luxembourg',       venue: 'A', gf: 2, ga: 0, xg: 1.45, xga: 0.46, shots: 13, shotsOn:  7, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-11-17', opponent: 'Slovakia',         venue: 'H', gf: 6, ga: 0, xg: 3.28, xga: 0.86, shots: 22, shotsOn: 11, oppShots:  6, oppShotsOn: 2 },
    ],
  },
  {
    team: 'Portugal',
    matches: [
      { date: '2025-09-06', opponent: 'Armenia',             venue: 'A', gf: 5, ga: 0, xg: 3.67, xga: 0.30, shots: 21, shotsOn:  9, oppShots:  7, oppShotsOn: 3 },
      { date: '2025-09-09', opponent: 'Hungary',             venue: 'A', gf: 3, ga: 2, xg: 2.35, xga: 0.76, shots: 15, shotsOn:  7, oppShots:  5, oppShotsOn: 2 },
      { date: '2025-10-11', opponent: 'Republic of Ireland', venue: 'H', gf: 1, ga: 0, xg: 3.74, xga: 0.10, shots: 29, shotsOn:  6, oppShots:  2, oppShotsOn: 0 },
      { date: '2025-10-14', opponent: 'Hungary',             venue: 'H', gf: 2, ga: 2, xg: 2.33, xga: 2.27, shots: 18, shotsOn:  7, oppShots: 15, oppShotsOn: 6 },
      { date: '2025-11-13', opponent: 'Republic of Ireland', venue: 'A', gf: 0, ga: 2, xg: 2.66, xga: 1.17, shots: 27, shotsOn:  5, oppShots: 11, oppShotsOn: 3 },
      { date: '2025-11-16', opponent: 'Armenia',             venue: 'H', gf: 9, ga: 1, xg: 5.80, xga: 0.62, shots: 32, shotsOn: 15, oppShots:  4, oppShotsOn: 3 },
    ],
  },
  {
    team: 'Spain',
    matches: [
      { date: '2025-09-04', opponent: 'Bulgaria', venue: 'A', gf: 3, ga: 0, xg: 3.41, xga: 0.23, shots: 23, shotsOn: 11, oppShots:  3, oppShotsOn: 0 },
      { date: '2025-09-07', opponent: 'Türkiye',  venue: 'A', gf: 6, ga: 0, xg: 3.14, xga: 0.42, shots: 21, shotsOn: 12, oppShots: 13, oppShotsOn: 2 },
      { date: '2025-10-11', opponent: 'Georgia',  venue: 'H', gf: 2, ga: 0, xg: 3.54, xga: 0.01, shots: 23, shotsOn:  7, oppShots:  1, oppShotsOn: 1 },
      { date: '2025-10-14', opponent: 'Bulgaria', venue: 'H', gf: 4, ga: 0, xg: 2.99, xga: 0.40, shots: 28, shotsOn: 10, oppShots:  3, oppShotsOn: 0 },
      { date: '2025-11-15', opponent: 'Georgia',  venue: 'A', gf: 4, ga: 0, xg: 3.32, xga: 0.45, shots: 14, shotsOn:  7, oppShots:  7, oppShotsOn: 2 },
      { date: '2025-11-18', opponent: 'Türkiye',  venue: 'H', gf: 2, ga: 2, xg: 3.08, xga: 1.43, shots: 21, shotsOn:  9, oppShots: 13, oppShotsOn: 7 },
    ],
  },
  {
    team: 'France',
    matches: [
      { date: '2025-09-05', opponent: 'Ukraine',    venue: 'A', gf: 2, ga: 0, xg: 2.21, xga: 1.84, shots: 16, shotsOn: 6, oppShots: 6, oppShotsOn: 3 },
      { date: '2025-09-09', opponent: 'Iceland',    venue: 'H', gf: 2, ga: 1, xg: 3.77, xga: 0.80, shots: 20, shotsOn: 8, oppShots: 6, oppShotsOn: 2 },
      { date: '2025-10-10', opponent: 'Azerbaijan', venue: 'H', gf: 3, ga: 0, xg: 3.23, xga: 0.14, shots: 28, shotsOn: 9, oppShots: 1, oppShotsOn: 0 },
      { date: '2025-10-13', opponent: 'Iceland',    venue: 'A', gf: 2, ga: 2, xg: 2.50, xga: 0.82, shots: 19, shotsOn: 9, oppShots: 4, oppShotsOn: 2 },
      { date: '2025-11-13', opponent: 'Ukraine',    venue: 'H', gf: 4, ga: 0, xg: 2.70, xga: 0.00, shots: 24, shotsOn: 9, oppShots: 0, oppShotsOn: 0 },
      { date: '2025-11-16', opponent: 'Azerbaijan', venue: 'A', gf: 3, ga: 1, xg: 2.05, xga: 0.42, shots: 15, shotsOn: 4, oppShots: 2, oppShotsOn: 1 },
    ],
  },
  {
    team: 'England',
    matches: [
      { date: '2025-03-21', opponent: 'Albania', venue: 'H', gf: 2, ga: 0, xg: 1.81, xga: 0.00, shots: 10, shotsOn:  4, oppShots: 2, oppShotsOn: 0 },
      { date: '2025-03-24', opponent: 'Latvia',  venue: 'H', gf: 3, ga: 0, xg: 5.22, xga: 0.07, shots: 29, shotsOn:  8, oppShots: 3, oppShotsOn: 1 },
      { date: '2025-06-07', opponent: 'Andorra', venue: 'A', gf: 1, ga: 0, xg: 2.28, xga: 0.28, shots: 15, shotsOn:  8, oppShots: 4, oppShotsOn: 0 },
      { date: '2025-09-06', opponent: 'Andorra', venue: 'H', gf: 2, ga: 0, xg: 1.97, xga: 0.10, shots: 11, shotsOn:  6, oppShots: 2, oppShotsOn: 0 },
      { date: '2025-09-09', opponent: 'Serbia',  venue: 'A', gf: 5, ga: 0, xg: 3.56, xga: 0.02, shots: 20, shotsOn: 12, oppShots: 2, oppShotsOn: 1 },
      { date: '2025-10-14', opponent: 'Latvia',  venue: 'A', gf: 5, ga: 0, xg: 2.90, xga: 0.47, shots: 23, shotsOn:  7, oppShots: 6, oppShotsOn: 1 },
      { date: '2025-11-13', opponent: 'Serbia',  venue: 'H', gf: 2, ga: 0, xg: 0.93, xga: 1.06, shots: 19, shotsOn:  6, oppShots: 8, oppShotsOn: 0 },
      { date: '2025-11-16', opponent: 'Albania', venue: 'A', gf: 2, ga: 0, xg: 1.66, xga: 0.60, shots: 14, shotsOn:  7, oppShots: 7, oppShotsOn: 2 },
    ],
  },
  {
    team: 'Panama',
    note: '6-match sample — only CONCACAF 3rd round captured. Earlier rounds vs Caribbean minnows not in dataset.',
    matches: [
      { date: '2025-09-04', opponent: 'Suriname',    venue: 'A', gf: 0, ga: 0, xg: 1.41, xga: 1.45, shots: 15, shotsOn:  4, oppShots:  9, oppShotsOn: 2 },
      { date: '2025-09-09', opponent: 'Guatemala',   venue: 'H', gf: 1, ga: 1, xg: 1.85, xga: 0.65, shots: 15, shotsOn:  5, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-10-11', opponent: 'El Salvador', venue: 'A', gf: 1, ga: 0, xg: 1.30, xga: 0.85, shots:  8, shotsOn:  2, oppShots:  7, oppShotsOn: 1 },
      { date: '2025-10-15', opponent: 'Suriname',    venue: 'H', gf: 1, ga: 1, xg: 3.25, xga: 0.84, shots: 24, shotsOn:  8, oppShots:  7, oppShotsOn: 4 },
      { date: '2025-11-14', opponent: 'Guatemala',   venue: 'A', gf: 3, ga: 2, xg: 0.64, xga: 2.02, shots:  7, shotsOn:  5, oppShots: 19, oppShotsOn: 6 },
      { date: '2025-11-19', opponent: 'El Salvador', venue: 'H', gf: 3, ga: 0, xg: 4.73, xga: 0.24, shots: 20, shotsOn: 10, oppShots:  5, oppShotsOn: 1 },
    ],
  },
  {
    team: 'Curaçao',
    matches: [
      { date: '2025-06-07', opponent: 'St. Lucia',           venue: 'H', gf: 4, ga: 0, xg: 4.45, xga: 0.28, shots: 26, shotsOn: 11, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-06-11', opponent: 'Haiti',               venue: 'A', gf: 5, ga: 1, xg: 1.93, xga: 2.48, shots:  9, shotsOn:  7, oppShots: 20, oppShotsOn: 5 },
      { date: '2025-09-06', opponent: 'Trinidad and Tobago', venue: 'A', gf: 0, ga: 0, xg: 0.36, xga: 0.67, shots:  6, shotsOn:  2, oppShots: 12, oppShotsOn: 6 },
      { date: '2025-09-10', opponent: 'Bermuda',             venue: 'H', gf: 3, ga: 2, xg: 2.21, xga: 1.04, shots: 19, shotsOn:  9, oppShots:  5, oppShotsOn: 3 },
      { date: '2025-10-11', opponent: 'Jamaica',             venue: 'H', gf: 2, ga: 0, xg: 0.68, xga: 1.95, shots:  7, shotsOn:  4, oppShots: 16, oppShotsOn: 5 },
      { date: '2025-10-15', opponent: 'Trinidad and Tobago', venue: 'H', gf: 1, ga: 1, xg: 0.83, xga: 1.25, shots:  7, shotsOn:  1, oppShots: 15, oppShotsOn: 6 },
      { date: '2025-11-14', opponent: 'Bermuda',             venue: 'A', gf: 7, ga: 0, xg: 3.87, xga: 0.10, shots: 27, shotsOn: 13, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-11-19', opponent: 'Jamaica',             venue: 'A', gf: 0, ga: 0, xg: 0.63, xga: 1.57, shots: 14, shotsOn:  5, oppShots: 14, oppShotsOn: 1 },
    ],
  },
  {
    team: 'Haiti',
    note: '7-match sample — only CONCACAF 3rd round + IC playoff captured. Earlier qualifying rounds vs Caribbean minnows not in dataset.',
    matches: [
      { date: '2025-06-11', opponent: 'Curaçao',    venue: 'H', gf: 1, ga: 5, xg: 2.48, xga: 1.93, shots: 20, shotsOn: 5, oppShots:  9, oppShotsOn:  7 },
      { date: '2025-09-06', opponent: 'Honduras',   venue: 'H', gf: 0, ga: 0, xg: 1.66, xga: 1.17, shots: 14, shotsOn: 6, oppShots: 14, oppShotsOn:  4 },
      { date: '2025-09-10', opponent: 'Costa Rica', venue: 'A', gf: 3, ga: 3, xg: 2.75, xga: 1.75, shots: 10, shotsOn: 6, oppShots: 23, oppShotsOn: 12 },
      { date: '2025-10-10', opponent: 'Nicaragua',  venue: 'A', gf: 3, ga: 0, xg: 1.33, xga: 0.38, shots:  8, shotsOn: 7, oppShots:  9, oppShotsOn:  3 },
      { date: '2025-10-14', opponent: 'Honduras',   venue: 'A', gf: 0, ga: 3, xg: 0.49, xga: 1.87, shots: 10, shotsOn: 2, oppShots: 16, oppShotsOn:  7 },
      { date: '2025-11-14', opponent: 'Costa Rica', venue: 'H', gf: 1, ga: 0, xg: 0.90, xga: 0.78, shots:  7, shotsOn: 3, oppShots: 13, oppShotsOn:  6 },
      { date: '2025-11-19', opponent: 'Nicaragua',  venue: 'H', gf: 2, ga: 0, xg: 1.93, xga: 0.45, shots:  9, shotsOn: 3, oppShots:  9, oppShotsOn:  3 },
    ],
  },
  {
    team: "Côte d'Ivoire",
    matches: [
      { date: '2023-11-17', opponent: 'Seychelles', venue: 'H', gf: 9, ga: 0, xg: 8.86, xga: 0.12, shots: 34, shotsOn: 19, oppShots:  3, oppShotsOn: 0 },
      { date: '2023-11-20', opponent: 'Gambia',     venue: 'A', gf: 2, ga: 0, xg: 2.83, xga: 0.44, shots: 13, shotsOn:  5, oppShots:  4, oppShotsOn: 1 },
      { date: '2024-06-07', opponent: 'Gabon',      venue: 'H', gf: 1, ga: 0, xg: 1.69, xga: 0.22, shots: 12, shotsOn:  5, oppShots:  7, oppShotsOn: 3 },
      { date: '2024-06-11', opponent: 'Kenya',      venue: 'A', gf: 0, ga: 0, xg: 0.46, xga: 0.51, shots: 12, shotsOn:  0, oppShots:  5, oppShotsOn: 4 },
      { date: '2025-03-21', opponent: 'Burundi',    venue: 'A', gf: 1, ga: 0, xg: 0.70, xga: 0.02, shots:  9, shotsOn:  3, oppShots:  1, oppShotsOn: 0 },
      { date: '2025-03-24', opponent: 'Gambia',     venue: 'H', gf: 1, ga: 0, xg: 1.68, xga: 0.61, shots: 13, shotsOn:  4, oppShots:  7, oppShotsOn: 2 },
      { date: '2025-09-05', opponent: 'Burundi',    venue: 'H', gf: 1, ga: 0, xg: 2.95, xga: 0.02, shots: 19, shotsOn:  6, oppShots:  2, oppShotsOn: 0 },
      { date: '2025-09-09', opponent: 'Gabon',      venue: 'A', gf: 0, ga: 0, xg: 0.87, xga: 0.57, shots:  7, shotsOn:  2, oppShots: 10, oppShotsOn: 3 },
      { date: '2025-10-10', opponent: 'Seychelles', venue: 'A', gf: 7, ga: 0, xg: 4.92, xga: 0.12, shots: 28, shotsOn: 10, oppShots:  4, oppShotsOn: 1 },
      { date: '2025-10-14', opponent: 'Kenya',      venue: 'H', gf: 3, ga: 0, xg: 1.90, xga: 0.00, shots: 13, shotsOn:  4, oppShots:  1, oppShotsOn: 0 },
    ],
  },
  {
    team: 'DR Congo',
    matches: [
      { date: '2023-11-15', opponent: 'Mauritania',  venue: 'H', gf: 2, ga: 0, xg: 1.81, xga: 0.16, shots: 10, shotsOn: 3, oppShots:  6, oppShotsOn: 2 },
      { date: '2023-11-19', opponent: 'Sudan',       venue: 'A', gf: 0, ga: 1, xg: 0.54, xga: 0.31, shots:  6, shotsOn: 1, oppShots:  5, oppShotsOn: 0 },
      { date: '2024-06-06', opponent: 'Senegal',     venue: 'A', gf: 1, ga: 1, xg: 0.47, xga: 2.88, shots: 11, shotsOn: 2, oppShots: 12, oppShotsOn: 5 },
      { date: '2024-06-09', opponent: 'Togo',        venue: 'H', gf: 1, ga: 0, xg: 1.33, xga: 0.52, shots: 11, shotsOn: 1, oppShots: 10, oppShotsOn: 5 },
      { date: '2025-03-21', opponent: 'South Sudan', venue: 'H', gf: 1, ga: 0, xg: 0.94, xga: 0.05, shots: 10, shotsOn: 5, oppShots:  3, oppShotsOn: 1 },
      { date: '2025-03-25', opponent: 'Mauritania',  venue: 'A', gf: 2, ga: 0, xg: 0.38, xga: 0.50, shots:  4, shotsOn: 2, oppShots:  7, oppShotsOn: 2 },
      { date: '2025-09-05', opponent: 'South Sudan', venue: 'A', gf: 4, ga: 0, xg: 3.13, xga: 0.14, shots: 14, shotsOn: 8, oppShots:  6, oppShotsOn: 1 },
      { date: '2025-09-09', opponent: 'Senegal',     venue: 'H', gf: 2, ga: 3, xg: 1.10, xga: 1.99, shots:  7, shotsOn: 2, oppShots: 14, oppShotsOn: 5 },
      { date: '2025-10-10', opponent: 'Togo',        venue: 'A', gf: 1, ga: 0, xg: 0.32, xga: 0.30, shots:  6, shotsOn: 1, oppShots:  7, oppShotsOn: 1 },
      { date: '2025-10-14', opponent: 'Sudan',       venue: 'H', gf: 1, ga: 0, xg: 0.94, xga: 0.17, shots:  9, shotsOn: 4, oppShots:  5, oppShotsOn: 0 },
      { date: '2025-11-13', opponent: 'Cameroon',    venue: 'A', gf: 1, ga: 0, xg: 1.12, xga: 1.35, shots: 10, shotsOn: 4, oppShots:  9, oppShotsOn: 4 },
      { date: '2025-11-16', opponent: 'Nigeria',     venue: 'A', gf: 1, ga: 1, xg: 1.59, xga: 0.33, shots: 11, shotsOn: 3, oppShots:  8, oppShotsOn: 2 },
      { date: '2026-03-31', opponent: 'Jamaica',     venue: 'H', gf: 1, ga: 0, xg: 1.16, xga: 0.56, shots: 19, shotsOn: 3, oppShots:  7, oppShotsOn: 1 },
    ],
  },
  {
    team: 'Cabo Verde',
    matches: [
      { date: '2023-11-16', opponent: 'Angola',    venue: 'H', gf: 0, ga: 0, xg: 0.52, xga: 1.00, shots: 12, shotsOn: 2, oppShots: 12, oppShotsOn: 1 },
      { date: '2023-11-21', opponent: 'Eswatini',  venue: 'A', gf: 2, ga: 0, xg: 1.40, xga: 0.71, shots:  9, shotsOn: 6, oppShots: 14, oppShotsOn: 6 },
      { date: '2024-06-08', opponent: 'Cameroon',  venue: 'A', gf: 1, ga: 4, xg: 1.22, xga: 1.64, shots:  8, shotsOn: 3, oppShots:  9, oppShotsOn: 5 },
      { date: '2024-06-11', opponent: 'Libya',     venue: 'H', gf: 1, ga: 0, xg: 1.51, xga: 0.63, shots: 17, shotsOn: 7, oppShots:  7, oppShotsOn: 2 },
      { date: '2025-03-20', opponent: 'Mauritius', venue: 'H', gf: 1, ga: 0, xg: 1.63, xga: 0.04, shots: 23, shotsOn: 5, oppShots:  2, oppShotsOn: 0 },
      { date: '2025-03-25', opponent: 'Angola',    venue: 'A', gf: 2, ga: 1, xg: 0.82, xga: 1.24, shots:  7, shotsOn: 3, oppShots: 10, oppShotsOn: 2 },
      { date: '2025-09-04', opponent: 'Mauritius', venue: 'A', gf: 2, ga: 0, xg: 0.53, xga: 0.58, shots: 14, shotsOn: 3, oppShots:  8, oppShotsOn: 1 },
      { date: '2025-09-09', opponent: 'Cameroon',  venue: 'H', gf: 1, ga: 0, xg: 1.50, xga: 0.97, shots:  8, shotsOn: 4, oppShots:  8, oppShotsOn: 2 },
      { date: '2025-10-08', opponent: 'Libya',     venue: 'A', gf: 3, ga: 3, xg: 1.68, xga: 1.45, shots: 10, shotsOn: 6, oppShots: 11, oppShotsOn: 4 },
      { date: '2025-10-13', opponent: 'Eswatini',  venue: 'H', gf: 3, ga: 0, xg: 2.69, xga: 0.03, shots: 16, shotsOn: 8, oppShots:  3, oppShotsOn: 0 },
    ],
  },
  {
    team: 'South Africa',
    matches: [
      { date: '2023-11-18', opponent: 'Benin',    venue: 'H', gf: 2, ga: 1, xg: 0.81, xga: 0.87, shots:  4, shotsOn: 3, oppShots:  5, oppShotsOn: 1 },
      { date: '2023-11-21', opponent: 'Rwanda',   venue: 'A', gf: 0, ga: 2, xg: 0.47, xga: 0.52, shots:  6, shotsOn: 2, oppShots:  7, oppShotsOn: 4 },
      { date: '2024-06-07', opponent: 'Nigeria',  venue: 'A', gf: 1, ga: 1, xg: 0.94, xga: 2.11, shots:  8, shotsOn: 4, oppShots: 16, oppShotsOn: 5 },
      { date: '2024-06-11', opponent: 'Zimbabwe', venue: 'H', gf: 3, ga: 1, xg: 2.58, xga: 0.37, shots: 26, shotsOn: 8, oppShots:  6, oppShotsOn: 2 },
      { date: '2025-03-21', opponent: 'Lesotho',  venue: 'H', gf: 2, ga: 0, xg: 2.24, xga: 0.08, shots: 19, shotsOn: 8, oppShots:  3, oppShotsOn: 1 },
      { date: '2025-03-25', opponent: 'Benin',    venue: 'A', gf: 2, ga: 0, xg: 1.49, xga: 0.10, shots: 10, shotsOn: 4, oppShots:  4, oppShotsOn: 1 },
      { date: '2025-09-05', opponent: 'Lesotho',  venue: 'A', gf: 3, ga: 0, xg: 1.48, xga: 0.27, shots:  7, shotsOn: 6, oppShots:  6, oppShotsOn: 2 },
      { date: '2025-09-09', opponent: 'Nigeria',  venue: 'H', gf: 1, ga: 1, xg: 0.29, xga: 0.82, shots:  5, shotsOn: 1, oppShots:  6, oppShotsOn: 1 },
      { date: '2025-10-10', opponent: 'Zimbabwe', venue: 'A', gf: 0, ga: 0, xg: 1.38, xga: 0.44, shots: 19, shotsOn: 3, oppShots:  6, oppShotsOn: 3 },
      { date: '2025-10-14', opponent: 'Rwanda',   venue: 'H', gf: 3, ga: 0, xg: 1.02, xga: 0.05, shots: 12, shotsOn: 5, oppShots:  4, oppShotsOn: 0 },
    ],
  },
  {
    team: 'Morocco',
    matches: [
      { date: '2023-11-21', opponent: 'Tanzania', venue: 'A', gf: 2, ga: 0, xg: 1.77, xga: 0.17, shots:  8, shotsOn:  3, oppShots:  6, oppShotsOn: 1 },
      { date: '2024-06-07', opponent: 'Zambia',   venue: 'H', gf: 2, ga: 1, xg: 2.37, xga: 0.52, shots: 15, shotsOn:  5, oppShots:  6, oppShotsOn: 1 },
      { date: '2024-06-11', opponent: 'Congo',    venue: 'A', gf: 6, ga: 0, xg: 3.31, xga: 0.21, shots: 20, shotsOn: 11, oppShots:  3, oppShotsOn: 1 },
      { date: '2025-03-21', opponent: 'Niger',    venue: 'A', gf: 2, ga: 1, xg: 1.63, xga: 1.19, shots: 14, shotsOn:  6, oppShots:  5, oppShotsOn: 2 },
      { date: '2025-03-25', opponent: 'Tanzania', venue: 'H', gf: 2, ga: 0, xg: 2.21, xga: 0.51, shots:  8, shotsOn:  3, oppShots:  6, oppShotsOn: 2 },
      { date: '2025-09-05', opponent: 'Niger',    venue: 'H', gf: 5, ga: 0, xg: 3.09, xga: 0.04, shots: 23, shotsOn: 13, oppShots:  2, oppShotsOn: 1 },
      { date: '2025-09-08', opponent: 'Zambia',   venue: 'A', gf: 2, ga: 0, xg: 0.79, xga: 1.51, shots:  8, shotsOn:  3, oppShots: 12, oppShotsOn: 3 },
      { date: '2025-10-14', opponent: 'Congo',    venue: 'H', gf: 1, ga: 0, xg: 2.43, xga: 0.05, shots: 18, shotsOn:  6, oppShots:  1, oppShotsOn: 0 },
    ],
  },
  {
    team: 'Senegal',
    matches: [
      { date: '2023-11-18', opponent: 'South Sudan', venue: 'H', gf: 4, ga: 0, xg: 4.23, xga: 1.11, shots: 31, shotsOn: 12, oppShots:  9, oppShotsOn: 2 },
      { date: '2023-11-21', opponent: 'Togo',        venue: 'A', gf: 0, ga: 0, xg: 0.74, xga: 2.21, shots:  8, shotsOn:  2, oppShots: 16, oppShotsOn: 4 },
      { date: '2024-06-06', opponent: 'Congo DR',    venue: 'H', gf: 1, ga: 1, xg: 2.88, xga: 0.47, shots: 12, shotsOn:  5, oppShots: 11, oppShotsOn: 2 },
      { date: '2024-06-09', opponent: 'Mauritania',  venue: 'A', gf: 1, ga: 0, xg: 0.56, xga: 0.84, shots:  6, shotsOn:  5, oppShots: 10, oppShotsOn: 4 },
      { date: '2025-03-22', opponent: 'Sudan',       venue: 'A', gf: 0, ga: 0, xg: 3.53, xga: 1.54, shots: 18, shotsOn:  5, oppShots:  9, oppShotsOn: 3 },
      { date: '2025-03-25', opponent: 'Togo',        venue: 'H', gf: 2, ga: 0, xg: 0.80, xga: 0.12, shots:  6, shotsOn:  2, oppShots:  5, oppShotsOn: 3 },
      { date: '2025-09-05', opponent: 'Sudan',       venue: 'H', gf: 2, ga: 0, xg: 2.50, xga: 0.23, shots: 12, shotsOn:  5, oppShots:  8, oppShotsOn: 1 },
      { date: '2025-09-09', opponent: 'Congo DR',    venue: 'A', gf: 3, ga: 2, xg: 1.99, xga: 1.10, shots: 14, shotsOn:  5, oppShots:  7, oppShotsOn: 2 },
      { date: '2025-10-10', opponent: 'South Sudan', venue: 'A', gf: 5, ga: 0, xg: 3.82, xga: 0.23, shots: 17, shotsOn:  9, oppShots:  4, oppShotsOn: 2 },
      { date: '2025-10-14', opponent: 'Mauritania',  venue: 'H', gf: 4, ga: 0, xg: 1.86, xga: 0.26, shots: 15, shotsOn:  7, oppShots:  6, oppShotsOn: 0 },
    ],
  },
  {
    team: 'Tunisia',
    matches: [
      { date: '2023-11-17', opponent: 'São Tomé e Príncipe', venue: 'H', gf: 4, ga: 0, xg: 2.21, xga: 0.65, shots: 12, shotsOn: 7, oppShots:  4, oppShotsOn: 1 },
      { date: '2023-11-21', opponent: 'Malawi',              venue: 'A', gf: 1, ga: 0, xg: 2.09, xga: 0.46, shots: 13, shotsOn: 4, oppShots:  7, oppShotsOn: 3 },
      { date: '2024-06-05', opponent: 'Equatorial Guinea',   venue: 'H', gf: 1, ga: 0, xg: 1.08, xga: 0.27, shots:  6, shotsOn: 2, oppShots:  8, oppShotsOn: 0 },
      { date: '2024-06-09', opponent: 'Namibia',             venue: 'A', gf: 0, ga: 0, xg: 0.49, xga: 0.77, shots:  4, shotsOn: 0, oppShots:  8, oppShotsOn: 1 },
      { date: '2025-03-19', opponent: 'Liberia',             venue: 'A', gf: 1, ga: 0, xg: 1.51, xga: 0.58, shots:  9, shotsOn: 6, oppShots:  7, oppShotsOn: 4 },
      { date: '2025-03-24', opponent: 'Malawi',              venue: 'H', gf: 2, ga: 0, xg: 4.38, xga: 1.61, shots: 28, shotsOn: 8, oppShots: 10, oppShotsOn: 3 },
      { date: '2025-09-04', opponent: 'Liberia',             venue: 'H', gf: 3, ga: 0, xg: 1.53, xga: 0.20, shots: 16, shotsOn: 7, oppShots:  5, oppShotsOn: 2 },
      { date: '2025-09-08', opponent: 'Equatorial Guinea',   venue: 'A', gf: 1, ga: 0, xg: 0.90, xga: 1.10, shots:  5, shotsOn: 2, oppShots: 12, oppShotsOn: 4 },
      { date: '2025-10-10', opponent: 'São Tomé e Príncipe', venue: 'A', gf: 6, ga: 0, xg: 2.69, xga: 0.45, shots: 15, shotsOn: 9, oppShots:  7, oppShotsOn: 4 },
      { date: '2025-10-13', opponent: 'Namibia',             venue: 'H', gf: 3, ga: 0, xg: 1.61, xga: 1.34, shots: 14, shotsOn: 4, oppShots: 16, oppShotsOn: 4 },
    ],
  },
  {
    team: 'Algeria',
    matches: [
      { date: '2023-11-16', opponent: 'Somalia',    venue: 'H', gf: 3, ga: 1, xg: 1.69, xga: 1.61, shots: 16, shotsOn:  5, oppShots:  9, oppShotsOn: 4 },
      { date: '2023-11-19', opponent: 'Mozambique', venue: 'A', gf: 2, ga: 0, xg: 0.97, xga: 1.34, shots:  9, shotsOn:  4, oppShots: 15, oppShotsOn: 6 },
      { date: '2024-06-06', opponent: 'Guinea',     venue: 'H', gf: 1, ga: 2, xg: 1.91, xga: 0.83, shots: 16, shotsOn:  3, oppShots:  8, oppShotsOn: 3 },
      { date: '2024-06-10', opponent: 'Uganda',     venue: 'A', gf: 2, ga: 1, xg: 1.42, xga: 0.75, shots:  8, shotsOn:  3, oppShots:  9, oppShotsOn: 3 },
      { date: '2025-03-21', opponent: 'Botswana',   venue: 'A', gf: 3, ga: 1, xg: 1.88, xga: 1.75, shots: 10, shotsOn:  5, oppShots:  8, oppShotsOn: 4 },
      { date: '2025-03-25', opponent: 'Mozambique', venue: 'H', gf: 5, ga: 1, xg: 3.14, xga: 0.28, shots: 23, shotsOn: 10, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-09-04', opponent: 'Botswana',   venue: 'H', gf: 3, ga: 1, xg: 2.56, xga: 0.91, shots: 19, shotsOn:  5, oppShots: 11, oppShotsOn: 1 },
      { date: '2025-09-08', opponent: 'Guinea',     venue: 'A', gf: 0, ga: 0, xg: 0.67, xga: 1.34, shots:  8, shotsOn:  3, oppShots:  9, oppShotsOn: 2 },
      { date: '2025-10-09', opponent: 'Somalia',    venue: 'A', gf: 3, ga: 0, xg: 3.57, xga: 0.20, shots: 20, shotsOn:  6, oppShots:  4, oppShotsOn: 0 },
      { date: '2025-10-14', opponent: 'Uganda',     venue: 'H', gf: 2, ga: 1, xg: 2.57, xga: 1.05, shots: 15, shotsOn:  5, oppShots:  8, oppShotsOn: 3 },
    ],
  },
  {
    team: 'Ghana',
    matches: [
      { date: '2023-11-17', opponent: 'Madagascar',                venue: 'H', gf: 1, ga: 0, xg: 3.17, xga: 1.05, shots: 21, shotsOn:  6, oppShots: 15, oppShotsOn: 3 },
      { date: '2023-11-21', opponent: 'Comoros',                   venue: 'A', gf: 0, ga: 1, xg: 1.25, xga: 0.77, shots: 13, shotsOn:  1, oppShots: 13, oppShotsOn: 3 },
      { date: '2024-06-06', opponent: 'Mali',                      venue: 'A', gf: 2, ga: 1, xg: 1.40, xga: 1.31, shots: 12, shotsOn:  4, oppShots: 15, oppShotsOn: 4 },
      { date: '2024-06-10', opponent: 'Central African Republic',  venue: 'H', gf: 4, ga: 3, xg: 2.79, xga: 0.90, shots: 15, shotsOn:  9, oppShots:  8, oppShotsOn: 4 },
      { date: '2025-03-21', opponent: 'Chad',                      venue: 'H', gf: 5, ga: 0, xg: 4.17, xga: 0.18, shots: 19, shotsOn: 11, oppShots:  3, oppShotsOn: 1 },
      { date: '2025-03-24', opponent: 'Madagascar',                venue: 'A', gf: 3, ga: 0, xg: 1.14, xga: 0.26, shots:  9, shotsOn:  4, oppShots:  8, oppShotsOn: 1 },
      { date: '2025-09-04', opponent: 'Chad',                      venue: 'A', gf: 1, ga: 1, xg: 1.31, xga: 0.26, shots:  9, shotsOn:  2, oppShots: 10, oppShotsOn: 2 },
      { date: '2025-09-08', opponent: 'Mali',                      venue: 'H', gf: 1, ga: 0, xg: 1.24, xga: 0.57, shots:  7, shotsOn:  2, oppShots: 11, oppShotsOn: 3 },
      { date: '2025-10-08', opponent: 'Central African Republic',  venue: 'A', gf: 5, ga: 0, xg: 2.60, xga: 0.15, shots: 19, shotsOn:  9, oppShots:  2, oppShotsOn: 0 },
      { date: '2025-10-12', opponent: 'Comoros',                   venue: 'H', gf: 1, ga: 0, xg: 0.54, xga: 0.24, shots:  5, shotsOn:  1, oppShots:  5, oppShotsOn: 1 },
    ],
  },
  {
    team: 'Egypt',
    matches: [
      { date: '2023-11-16', opponent: 'Djibouti',      venue: 'H', gf: 6, ga: 0, xg: 5.25, xga: 0.47, shots: 26, shotsOn: 13, oppShots:  5, oppShotsOn: 2 },
      { date: '2023-11-19', opponent: 'Sierra Leone',  venue: 'A', gf: 2, ga: 0, xg: 1.42, xga: 2.71, shots: 12, shotsOn:  6, oppShots: 16, oppShotsOn: 9 },
      { date: '2024-06-06', opponent: 'Burkina Faso',  venue: 'H', gf: 2, ga: 1, xg: 1.13, xga: 1.35, shots: 11, shotsOn:  5, oppShots: 10, oppShotsOn: 5 },
      { date: '2024-06-10', opponent: 'Guinea-Bissau', venue: 'A', gf: 1, ga: 1, xg: 0.58, xga: 0.14, shots:  5, shotsOn:  2, oppShots:  2, oppShotsOn: 1 },
      { date: '2025-03-21', opponent: 'Ethiopia',      venue: 'A', gf: 2, ga: 0, xg: 2.98, xga: 0.50, shots: 19, shotsOn:  9, oppShots:  7, oppShotsOn: 1 },
      { date: '2025-03-25', opponent: 'Sierra Leone',  venue: 'H', gf: 1, ga: 0, xg: 1.41, xga: 0.46, shots: 16, shotsOn:  3, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-09-05', opponent: 'Ethiopia',      venue: 'H', gf: 2, ga: 0, xg: 4.23, xga: 0.55, shots: 21, shotsOn: 11, oppShots:  6, oppShotsOn: 2 },
      { date: '2025-09-09', opponent: 'Burkina Faso',  venue: 'A', gf: 0, ga: 0, xg: 0.43, xga: 0.32, shots:  8, shotsOn:  1, oppShots:  3, oppShotsOn: 0 },
      { date: '2025-10-08', opponent: 'Djibouti',      venue: 'A', gf: 3, ga: 0, xg: 3.09, xga: 0.00, shots: 19, shotsOn:  5, oppShots:  2, oppShotsOn: 0 },
      { date: '2025-10-12', opponent: 'Guinea-Bissau', venue: 'H', gf: 1, ga: 0, xg: 1.87, xga: 1.17, shots: 14, shotsOn:  3, oppShots: 10, oppShotsOn: 2 },
    ],
  },
  {
    team: 'Uzbekistan',
    matches: [
      { date: '2023-11-16', opponent: 'Turkmenistan', venue: 'A', gf: 3, ga: 1, xg: 1.73, xga: 0.27, shots: 19, shotsOn: 4, oppShots:  9, oppShotsOn: 2 },
      { date: '2023-11-21', opponent: 'Iran',         venue: 'H', gf: 2, ga: 2, xg: 1.57, xga: 0.25, shots: 10, shotsOn: 4, oppShots:  4, oppShotsOn: 2 },
      { date: '2024-03-21', opponent: 'Hong Kong',    venue: 'A', gf: 2, ga: 0, xg: 5.57, xga: 0.27, shots: 27, shotsOn: 9, oppShots:  6, oppShotsOn: 2 },
      { date: '2024-03-26', opponent: 'Hong Kong',    venue: 'H', gf: 3, ga: 0, xg: 1.88, xga: 0.12, shots: 12, shotsOn: 7, oppShots:  3, oppShotsOn: 2 },
      { date: '2024-06-06', opponent: 'Turkmenistan', venue: 'H', gf: 3, ga: 1, xg: 3.34, xga: 0.53, shots: 19, shotsOn: 9, oppShots:  4, oppShotsOn: 1 },
      { date: '2024-06-11', opponent: 'Iran',         venue: 'A', gf: 0, ga: 0, xg: 0.33, xga: 1.25, shots: 10, shotsOn: 3, oppShots: 15, oppShotsOn: 1 },
      { date: '2024-09-05', opponent: 'Korea DPR',    venue: 'H', gf: 1, ga: 0, xg: 1.36, xga: 0.90, shots: 11, shotsOn: 4, oppShots:  7, oppShotsOn: 3 },
      { date: '2024-09-10', opponent: 'Kyrgyzstan',   venue: 'A', gf: 3, ga: 2, xg: 1.59, xga: 0.56, shots: 17, shotsOn: 9, oppShots:  9, oppShotsOn: 2 },
      { date: '2024-10-10', opponent: 'Iran',         venue: 'H', gf: 0, ga: 0, xg: 0.49, xga: 0.49, shots:  9, shotsOn: 1, oppShots: 10, oppShotsOn: 4 },
      { date: '2024-10-15', opponent: 'UAE',          venue: 'H', gf: 1, ga: 0, xg: 2.29, xga: 1.00, shots: 23, shotsOn: 4, oppShots: 10, oppShotsOn: 5 },
      { date: '2024-11-14', opponent: 'Qatar',        venue: 'A', gf: 2, ga: 3, xg: 2.24, xga: 1.71, shots: 19, shotsOn: 8, oppShots: 10, oppShotsOn: 7 },
      { date: '2024-11-19', opponent: 'Korea DPR',    venue: 'A', gf: 1, ga: 0, xg: 1.34, xga: 1.06, shots: 13, shotsOn: 2, oppShots: 13, oppShotsOn: 2 },
      { date: '2025-03-20', opponent: 'Kyrgyzstan',   venue: 'H', gf: 1, ga: 0, xg: 3.53, xga: 0.01, shots: 22, shotsOn: 9, oppShots:  1, oppShotsOn: 0 },
      { date: '2025-03-25', opponent: 'Iran',         venue: 'A', gf: 2, ga: 2, xg: 1.13, xga: 3.37, shots: 12, shotsOn: 4, oppShots: 17, oppShotsOn: 6 },
      { date: '2025-06-05', opponent: 'UAE',          venue: 'A', gf: 0, ga: 0, xg: 0.35, xga: 0.76, shots:  3, shotsOn: 0, oppShots: 10, oppShotsOn: 6 },
      { date: '2025-06-10', opponent: 'Qatar',        venue: 'H', gf: 3, ga: 0, xg: 2.33, xga: 0.23, shots: 16, shotsOn: 7, oppShots:  2, oppShotsOn: 0 },
    ],
  },
  {
    team: 'Australia',
    matches: [
      { date: '2023-11-16', opponent: 'Bangladesh',   venue: 'H', gf: 7, ga: 0, xg: 7.21, xga: 0.01, shots: 26, shotsOn: 14, oppShots:  1, oppShotsOn: 0 },
      { date: '2023-11-21', opponent: 'Palestine',    venue: 'A', gf: 1, ga: 0, xg: 0.89, xga: 0.83, shots:  8, shotsOn:  5, oppShots:  7, oppShotsOn: 2 },
      { date: '2024-03-21', opponent: 'Lebanon',      venue: 'H', gf: 2, ga: 0, xg: 0.92, xga: 0.66, shots: 10, shotsOn:  6, oppShots:  6, oppShotsOn: 3 },
      { date: '2024-03-26', opponent: 'Lebanon',      venue: 'A', gf: 5, ga: 0, xg: 3.05, xga: 0.36, shots: 15, shotsOn:  6, oppShots:  8, oppShotsOn: 1 },
      { date: '2024-06-06', opponent: 'Bangladesh',   venue: 'A', gf: 2, ga: 0, xg: 1.67, xga: 0.04, shots: 14, shotsOn:  5, oppShots:  2, oppShotsOn: 0 },
      { date: '2024-06-11', opponent: 'Palestine',    venue: 'H', gf: 5, ga: 0, xg: 3.58, xga: 0.58, shots: 10, shotsOn:  6, oppShots: 11, oppShotsOn: 3 },
      { date: '2024-09-05', opponent: 'Bahrain',      venue: 'H', gf: 0, ga: 1, xg: 0.92, xga: 0.36, shots: 11, shotsOn:  3, oppShots:  3, oppShotsOn: 1 },
      { date: '2024-09-10', opponent: 'Indonesia',    venue: 'A', gf: 0, ga: 0, xg: 3.08, xga: 0.55, shots: 18, shotsOn:  5, oppShots:  5, oppShotsOn: 2 },
      { date: '2024-10-10', opponent: 'China PR',     venue: 'H', gf: 3, ga: 1, xg: 1.23, xga: 0.40, shots: 15, shotsOn:  3, oppShots:  5, oppShotsOn: 1 },
      { date: '2024-10-15', opponent: 'Japan',        venue: 'A', gf: 1, ga: 1, xg: 0.01, xga: 0.87, shots:  1, shotsOn:  0, oppShots:  9, oppShotsOn: 2 },
      { date: '2024-11-14', opponent: 'Saudi Arabia', venue: 'H', gf: 0, ga: 0, xg: 0.90, xga: 0.07, shots:  9, shotsOn:  1, oppShots:  3, oppShotsOn: 1 },
      { date: '2024-11-19', opponent: 'Bahrain',      venue: 'A', gf: 2, ga: 2, xg: 1.65, xga: 1.26, shots:  7, shotsOn:  4, oppShots:  7, oppShotsOn: 2 },
      { date: '2025-03-20', opponent: 'Indonesia',    venue: 'H', gf: 5, ga: 1, xg: 1.69, xga: 2.00, shots:  8, shotsOn:  7, oppShots:  9, oppShotsOn: 4 },
      { date: '2025-03-25', opponent: 'China PR',     venue: 'A', gf: 2, ga: 0, xg: 0.62, xga: 0.63, shots:  6, shotsOn:  2, oppShots: 11, oppShotsOn: 1 },
      { date: '2025-06-05', opponent: 'Japan',        venue: 'H', gf: 1, ga: 0, xg: 0.25, xga: 0.39, shots:  5, shotsOn:  1, oppShots: 12, oppShotsOn: 1 },
      { date: '2025-06-10', opponent: 'Saudi Arabia', venue: 'A', gf: 2, ga: 1, xg: 0.97, xga: 3.36, shots:  4, shotsOn:  3, oppShots: 13, oppShotsOn: 6 },
    ],
  },
  {
    team: 'Iraq',
    matches: [
      { date: '2023-11-16', opponent: 'Indonesia',     venue: 'H', gf: 5, ga: 1, xg: 1.02, xga: 0.14, shots:  9, shotsOn: 5, oppShots:  2, oppShotsOn: 1 },
      { date: '2023-11-21', opponent: 'Vietnam',       venue: 'A', gf: 1, ga: 0, xg: 2.30, xga: 0.00, shots: 17, shotsOn: 4, oppShots:  1, oppShotsOn: 0 },
      { date: '2024-03-21', opponent: 'Philippines',   venue: 'H', gf: 1, ga: 0, xg: 1.37, xga: 0.00, shots: 16, shotsOn: 5, oppShots:  0, oppShotsOn: 0 },
      { date: '2024-03-26', opponent: 'Philippines',   venue: 'A', gf: 5, ga: 0, xg: 2.92, xga: 0.41, shots: 16, shotsOn: 6, oppShots:  5, oppShotsOn: 1 },
      { date: '2024-06-06', opponent: 'Indonesia',     venue: 'A', gf: 2, ga: 0, xg: 2.19, xga: 0.32, shots: 11, shotsOn: 3, oppShots:  6, oppShotsOn: 1 },
      { date: '2024-06-11', opponent: 'Vietnam',       venue: 'H', gf: 3, ga: 1, xg: 3.90, xga: 0.49, shots: 14, shotsOn: 6, oppShots:  7, oppShotsOn: 3 },
      { date: '2024-09-05', opponent: 'Oman',          venue: 'H', gf: 1, ga: 0, xg: 0.42, xga: 0.89, shots:  6, shotsOn: 3, oppShots: 11, oppShotsOn: 6 },
      { date: '2024-09-10', opponent: 'Kuwait',        venue: 'A', gf: 0, ga: 0, xg: 0.35, xga: 0.25, shots:  7, shotsOn: 2, oppShots:  7, oppShotsOn: 2 },
      { date: '2024-10-10', opponent: 'Palestine',     venue: 'H', gf: 1, ga: 0, xg: 0.21, xga: 0.08, shots:  6, shotsOn: 2, oppShots:  3, oppShotsOn: 1 },
      { date: '2024-10-15', opponent: 'Korea Republic',venue: 'A', gf: 2, ga: 3, xg: 0.61, xga: 0.93, shots:  8, shotsOn: 2, oppShots:  7, oppShotsOn: 3 },
      { date: '2024-11-14', opponent: 'Jordan',        venue: 'H', gf: 0, ga: 0, xg: 1.25, xga: 0.33, shots:  9, shotsOn: 2, oppShots:  7, oppShotsOn: 4 },
      { date: '2024-11-19', opponent: 'Oman',          venue: 'A', gf: 1, ga: 0, xg: 0.78, xga: 0.61, shots:  4, shotsOn: 3, oppShots:  9, oppShotsOn: 3 },
      { date: '2025-03-20', opponent: 'Kuwait',        venue: 'H', gf: 2, ga: 2, xg: 1.21, xga: 0.57, shots: 17, shotsOn: 7, oppShots:  3, oppShotsOn: 2 },
      { date: '2025-03-25', opponent: 'Palestine',     venue: 'A', gf: 1, ga: 2, xg: 0.78, xga: 1.61, shots: 13, shotsOn: 3, oppShots: 12, oppShotsOn: 5 },
      { date: '2025-06-05', opponent: 'Korea Republic',venue: 'H', gf: 0, ga: 2, xg: 0.25, xga: 1.37, shots:  5, shotsOn: 2, oppShots: 13, oppShotsOn: 7 },
      { date: '2025-06-10', opponent: 'Jordan',        venue: 'A', gf: 1, ga: 0, xg: 1.12, xga: 0.86, shots:  7, shotsOn: 5, oppShots:  9, oppShotsOn: 0 },
      { date: '2025-10-11', opponent: 'Indonesia',     venue: 'H', gf: 1, ga: 0, xg: 0.61, xga: 1.13, shots:  8, shotsOn: 2, oppShots:  6, oppShotsOn: 1 },
      { date: '2025-10-14', opponent: 'Saudi Arabia',  venue: 'A', gf: 0, ga: 0, xg: 0.33, xga: 1.19, shots:  4, shotsOn: 1, oppShots: 14, oppShotsOn: 4 },
      { date: '2025-11-13', opponent: 'UAE',           venue: 'A', gf: 1, ga: 1, xg: 1.38, xga: 0.70, shots:  9, shotsOn: 5, oppShots: 12, oppShotsOn: 3 },
      { date: '2025-11-18', opponent: 'UAE',           venue: 'H', gf: 2, ga: 1, xg: 1.96, xga: 1.08, shots:  9, shotsOn: 3, oppShots: 12, oppShotsOn: 4 },
    ],
  },
  {
    team: 'Jordan',
    matches: [
      { date: '2023-11-16', opponent: 'Tajikistan',    venue: 'A', gf: 1, ga: 1, xg: 1.21, xga: 1.38, shots: 13, shotsOn: 4, oppShots: 10, oppShotsOn: 4 },
      { date: '2023-11-21', opponent: 'Saudi Arabia',  venue: 'H', gf: 0, ga: 2, xg: 1.19, xga: 1.00, shots: 15, shotsOn: 3, oppShots:  7, oppShotsOn: 2 },
      { date: '2024-03-21', opponent: 'Pakistan',      venue: 'A', gf: 3, ga: 0, xg: 3.72, xga: 0.47, shots: 28, shotsOn: 9, oppShots:  7, oppShotsOn: 1 },
      { date: '2024-03-26', opponent: 'Pakistan',      venue: 'H', gf: 7, ga: 0, xg: 4.29, xga: 0.23, shots: 22, shotsOn: 9, oppShots:  3, oppShotsOn: 0 },
      { date: '2024-06-06', opponent: 'Tajikistan',    venue: 'H', gf: 3, ga: 0, xg: 1.56, xga: 1.14, shots: 15, shotsOn: 6, oppShots: 12, oppShotsOn: 7 },
      { date: '2024-06-11', opponent: 'Saudi Arabia',  venue: 'A', gf: 2, ga: 1, xg: 0.82, xga: 1.37, shots: 10, shotsOn: 4, oppShots: 17, oppShotsOn: 6 },
      { date: '2024-09-05', opponent: 'Kuwait',        venue: 'H', gf: 1, ga: 1, xg: 1.22, xga: 1.12, shots: 12, shotsOn: 3, oppShots:  4, oppShotsOn: 2 },
      { date: '2024-09-10', opponent: 'Palestine',     venue: 'A', gf: 3, ga: 1, xg: 2.59, xga: 0.85, shots: 14, shotsOn: 5, oppShots:  8, oppShotsOn: 4 },
      { date: '2024-10-10', opponent: 'Korea Republic',venue: 'H', gf: 0, ga: 2, xg: 0.30, xga: 0.55, shots: 10, shotsOn: 0, oppShots: 13, oppShotsOn: 5 },
      { date: '2024-10-15', opponent: 'Oman',          venue: 'H', gf: 4, ga: 0, xg: 1.88, xga: 0.27, shots: 11, shotsOn: 8, oppShots:  2, oppShotsOn: 1 },
      { date: '2024-11-14', opponent: 'Iraq',          venue: 'A', gf: 0, ga: 0, xg: 0.33, xga: 1.25, shots:  7, shotsOn: 4, oppShots:  9, oppShotsOn: 2 },
      { date: '2024-11-19', opponent: 'Kuwait',        venue: 'A', gf: 1, ga: 1, xg: 0.41, xga: 1.67, shots:  9, shotsOn: 2, oppShots: 11, oppShotsOn: 5 },
      { date: '2025-03-25', opponent: 'Korea Republic',venue: 'A', gf: 1, ga: 1, xg: 0.83, xga: 1.84, shots:  9, shotsOn: 3, oppShots: 13, oppShotsOn: 4 },
      { date: '2025-06-05', opponent: 'Oman',          venue: 'A', gf: 3, ga: 0, xg: 1.31, xga: 0.51, shots:  9, shotsOn: 4, oppShots: 10, oppShotsOn: 2 },
      { date: '2025-06-10', opponent: 'Iraq',          venue: 'H', gf: 0, ga: 1, xg: 0.86, xga: 1.12, shots:  9, shotsOn: 0, oppShots:  7, oppShotsOn: 5 },
    ],
  },
  {
    team: 'Saudi Arabia',
    matches: [
      { date: '2024-03-21', opponent: 'Tajikistan', venue: 'H', gf: 1, ga: 0, xg: 0.72, xga: 0.72, shots:  7, shotsOn: 3, oppShots: 11, oppShotsOn: 3 },
      { date: '2024-03-26', opponent: 'Tajikistan', venue: 'A', gf: 1, ga: 1, xg: 2.04, xga: 1.75, shots: 14, shotsOn: 5, oppShots: 11, oppShotsOn: 2 },
      { date: '2024-06-06', opponent: 'Pakistan',   venue: 'A', gf: 3, ga: 0, xg: 2.26, xga: 0.16, shots: 17, shotsOn: 8, oppShots:  2, oppShotsOn: 0 },
      { date: '2024-06-11', opponent: 'Jordan',     venue: 'H', gf: 1, ga: 2, xg: 1.37, xga: 0.82, shots: 17, shotsOn: 6, oppShots: 10, oppShotsOn: 4 },
      { date: '2024-09-05', opponent: 'Indonesia',  venue: 'H', gf: 1, ga: 1, xg: 1.86, xga: 0.33, shots: 18, shotsOn: 3, oppShots:  6, oppShotsOn: 3 },
      { date: '2024-09-10', opponent: 'China PR',   venue: 'A', gf: 2, ga: 1, xg: 0.84, xga: 1.19, shots:  9, shotsOn: 3, oppShots: 11, oppShotsOn: 1 },
      { date: '2024-10-10', opponent: 'Japan',      venue: 'H', gf: 0, ga: 2, xg: 0.98, xga: 1.14, shots: 10, shotsOn: 2, oppShots:  6, oppShotsOn: 3 },
      { date: '2024-10-15', opponent: 'Bahrain',    venue: 'H', gf: 0, ga: 0, xg: 1.32, xga: 0.40, shots: 11, shotsOn: 4, oppShots:  6, oppShotsOn: 2 },
      { date: '2024-11-14', opponent: 'Australia',  venue: 'A', gf: 0, ga: 0, xg: 0.07, xga: 0.90, shots:  3, shotsOn: 1, oppShots:  9, oppShotsOn: 1 },
      { date: '2024-11-19', opponent: 'Indonesia',  venue: 'A', gf: 0, ga: 2, xg: 1.56, xga: 1.08, shots: 20, shotsOn: 2, oppShots: 12, oppShotsOn: 6 },
      { date: '2025-03-25', opponent: 'Japan',      venue: 'A', gf: 0, ga: 0, xg: 0.04, xga: 1.04, shots:  1, shotsOn: 0, oppShots: 11, oppShotsOn: 2 },
      { date: '2025-06-05', opponent: 'Bahrain',    venue: 'A', gf: 2, ga: 0, xg: 1.22, xga: 1.91, shots:  8, shotsOn: 3, oppShots: 16, oppShotsOn: 2 },
      { date: '2025-06-10', opponent: 'Australia',  venue: 'H', gf: 1, ga: 2, xg: 3.36, xga: 0.97, shots: 13, shotsOn: 6, oppShots:  4, oppShotsOn: 3 },
      { date: '2025-10-08', opponent: 'Indonesia',  venue: 'A', gf: 3, ga: 2, xg: 2.84, xga: 2.40, shots: 17, shotsOn: 9, oppShots:  8, oppShotsOn: 4 },
      { date: '2025-10-14', opponent: 'Iraq',       venue: 'H', gf: 0, ga: 0, xg: 1.19, xga: 0.33, shots: 14, shotsOn: 4, oppShots:  4, oppShotsOn: 1 },
    ],
  },
  {
    team: 'South Korea',
    matches: [
      { date: '2023-11-16', opponent: 'Singapore',  venue: 'H', gf: 5, ga: 0, xg: 3.24, xga: 0.04, shots: 21, shotsOn:  8, oppShots:  3, oppShotsOn: 1 },
      { date: '2023-11-21', opponent: 'China PR',   venue: 'A', gf: 3, ga: 0, xg: 2.43, xga: 0.54, shots: 18, shotsOn:  8, oppShots:  4, oppShotsOn: 0 },
      { date: '2024-03-21', opponent: 'Thailand',   venue: 'H', gf: 1, ga: 1, xg: 2.64, xga: 0.72, shots: 22, shotsOn:  7, oppShots:  5, oppShotsOn: 2 },
      { date: '2024-03-26', opponent: 'Thailand',   venue: 'A', gf: 3, ga: 0, xg: 1.74, xga: 0.33, shots:  8, shotsOn:  4, oppShots:  5, oppShotsOn: 1 },
      { date: '2024-06-06', opponent: 'Singapore',  venue: 'A', gf: 7, ga: 0, xg: 1.56, xga: 0.76, shots: 16, shotsOn: 10, oppShots:  9, oppShotsOn: 1 },
      { date: '2024-06-11', opponent: 'China PR',   venue: 'H', gf: 1, ga: 0, xg: 0.78, xga: 0.04, shots: 10, shotsOn:  5, oppShots:  1, oppShotsOn: 0 },
      { date: '2024-09-05', opponent: 'Palestine',  venue: 'H', gf: 0, ga: 0, xg: 1.50, xga: 0.64, shots: 15, shotsOn:  5, oppShots: 10, oppShotsOn: 4 },
      { date: '2024-09-10', opponent: 'Oman',       venue: 'A', gf: 3, ga: 1, xg: 1.33, xga: 0.16, shots: 16, shotsOn: 10, oppShots:  5, oppShotsOn: 0 },
      { date: '2024-10-10', opponent: 'Jordan',     venue: 'A', gf: 2, ga: 0, xg: 0.55, xga: 0.30, shots: 13, shotsOn:  5, oppShots: 10, oppShotsOn: 0 },
      { date: '2024-10-15', opponent: 'Iraq',       venue: 'H', gf: 3, ga: 2, xg: 0.93, xga: 0.61, shots:  7, shotsOn:  3, oppShots:  8, oppShotsOn: 2 },
      { date: '2024-11-14', opponent: 'Kuwait',     venue: 'A', gf: 3, ga: 1, xg: 2.36, xga: 0.53, shots: 12, shotsOn:  4, oppShots:  4, oppShotsOn: 1 },
      { date: '2024-11-19', opponent: 'Palestine',  venue: 'A', gf: 1, ga: 1, xg: 2.09, xga: 0.44, shots: 15, shotsOn:  5, oppShots:  3, oppShotsOn: 1 },
      { date: '2025-03-20', opponent: 'Oman',       venue: 'H', gf: 1, ga: 1, xg: 1.04, xga: 0.19, shots:  9, shotsOn:  3, oppShots:  5, oppShotsOn: 2 },
      { date: '2025-03-25', opponent: 'Jordan',     venue: 'H', gf: 1, ga: 1, xg: 1.84, xga: 0.83, shots: 13, shotsOn:  4, oppShots:  9, oppShotsOn: 3 },
      { date: '2025-06-05', opponent: 'Iraq',       venue: 'A', gf: 2, ga: 0, xg: 1.37, xga: 0.25, shots: 13, shotsOn:  7, oppShots:  5, oppShotsOn: 2 },
      { date: '2025-06-10', opponent: 'Kuwait',     venue: 'H', gf: 4, ga: 0, xg: 2.48, xga: 0.55, shots: 21, shotsOn:  6, oppShots:  5, oppShotsOn: 0 },
    ],
  },
  {
    team: 'Japan',
    matches: [
      { date: '2023-11-16', opponent: 'Myanmar',      venue: 'H', gf: 5, ga: 0, xg: 5.64, xga: 0.00, shots: 32, shotsOn: 15, oppShots:  0, oppShotsOn: 0 },
      { date: '2023-11-21', opponent: 'Syria',        venue: 'A', gf: 5, ga: 0, xg: 2.76, xga: 0.27, shots: 19, shotsOn:  8, oppShots:  1, oppShotsOn: 0 },
      { date: '2024-03-21', opponent: 'Korea DPR',    venue: 'H', gf: 1, ga: 0, xg: 1.55, xga: 0.22, shots: 18, shotsOn:  6, oppShots:  6, oppShotsOn: 3 },
      { date: '2024-06-06', opponent: 'Myanmar',      venue: 'A', gf: 5, ga: 0, xg: 2.98, xga: 0.03, shots: 21, shotsOn: 10, oppShots:  1, oppShotsOn: 1 },
      { date: '2024-06-11', opponent: 'Syria',        venue: 'H', gf: 5, ga: 0, xg: 2.87, xga: 0.36, shots: 20, shotsOn: 12, oppShots:  7, oppShotsOn: 0 },
      { date: '2024-09-05', opponent: 'China PR',     venue: 'H', gf: 7, ga: 0, xg: 1.88, xga: 0.02, shots: 17, shotsOn:  9, oppShots:  1, oppShotsOn: 0 },
      { date: '2024-09-10', opponent: 'Bahrain',      venue: 'A', gf: 5, ga: 0, xg: 3.86, xga: 0.10, shots: 15, shotsOn:  9, oppShots:  3, oppShotsOn: 1 },
      { date: '2024-10-10', opponent: 'Saudi Arabia', venue: 'A', gf: 2, ga: 0, xg: 1.14, xga: 0.98, shots:  6, shotsOn:  3, oppShots: 10, oppShotsOn: 2 },
      { date: '2024-10-15', opponent: 'Australia',    venue: 'H', gf: 1, ga: 1, xg: 0.87, xga: 0.01, shots:  9, shotsOn:  2, oppShots:  1, oppShotsOn: 0 },
      { date: '2024-11-15', opponent: 'Indonesia',    venue: 'A', gf: 4, ga: 0, xg: 1.44, xga: 0.89, shots: 12, shotsOn:  8, oppShots:  7, oppShotsOn: 2 },
      { date: '2024-11-19', opponent: 'China PR',     venue: 'A', gf: 3, ga: 1, xg: 1.23, xga: 0.55, shots: 10, shotsOn:  5, oppShots:  8, oppShotsOn: 3 },
      { date: '2025-03-20', opponent: 'Bahrain',      venue: 'H', gf: 2, ga: 0, xg: 1.30, xga: 0.80, shots: 11, shotsOn:  4, oppShots:  7, oppShotsOn: 2 },
      { date: '2025-03-25', opponent: 'Saudi Arabia', venue: 'H', gf: 0, ga: 0, xg: 1.04, xga: 0.04, shots: 11, shotsOn:  2, oppShots:  1, oppShotsOn: 0 },
      { date: '2025-06-05', opponent: 'Australia',    venue: 'A', gf: 0, ga: 1, xg: 0.39, xga: 0.25, shots: 12, shotsOn:  1, oppShots:  5, oppShotsOn: 1 },
      { date: '2025-06-10', opponent: 'Indonesia',    venue: 'H', gf: 6, ga: 0, xg: 5.53, xga: 0.00, shots: 21, shotsOn: 12, oppShots:  0, oppShotsOn: 0 },
    ],
  },
  {
    team: 'Iran',
    matches: [
      { date: '2023-11-16', opponent: 'Hong Kong',    venue: 'H', gf: 4, ga: 0, xg: 2.42, xga: 0.14, shots: 16, shotsOn:  9, oppShots:  2, oppShotsOn: 0 },
      { date: '2023-11-21', opponent: 'Uzbekistan',   venue: 'A', gf: 2, ga: 2, xg: 0.25, xga: 1.57, shots:  4, shotsOn:  2, oppShots: 10, oppShotsOn: 4 },
      { date: '2024-03-21', opponent: 'Turkmenistan', venue: 'H', gf: 5, ga: 0, xg: 3.59, xga: 0.29, shots: 25, shotsOn: 13, oppShots:  3, oppShotsOn: 0 },
      { date: '2024-03-26', opponent: 'Turkmenistan', venue: 'A', gf: 1, ga: 0, xg: 1.80, xga: 0.42, shots: 11, shotsOn:  2, oppShots: 10, oppShotsOn: 3 },
      { date: '2024-06-06', opponent: 'Hong Kong',    venue: 'A', gf: 4, ga: 2, xg: 4.90, xga: 0.80, shots: 20, shotsOn:  7, oppShots:  4, oppShotsOn: 3 },
      { date: '2024-06-11', opponent: 'Uzbekistan',   venue: 'H', gf: 0, ga: 0, xg: 1.25, xga: 0.33, shots: 15, shotsOn:  1, oppShots: 10, oppShotsOn: 3 },
      { date: '2024-09-05', opponent: 'Kyrgyzstan',   venue: 'H', gf: 1, ga: 0, xg: 1.48, xga: 0.87, shots: 17, shotsOn:  3, oppShots:  7, oppShotsOn: 6 },
      { date: '2024-09-10', opponent: 'UAE',          venue: 'A', gf: 1, ga: 0, xg: 2.38, xga: 0.17, shots: 12, shotsOn:  3, oppShots:  8, oppShotsOn: 2 },
      { date: '2024-10-10', opponent: 'Uzbekistan',   venue: 'A', gf: 0, ga: 0, xg: 0.49, xga: 0.49, shots: 10, shotsOn:  4, oppShots:  9, oppShotsOn: 1 },
      { date: '2024-10-15', opponent: 'Qatar',        venue: 'H', gf: 4, ga: 1, xg: 2.53, xga: 0.58, shots: 16, shotsOn:  8, oppShots: 10, oppShotsOn: 1 },
      { date: '2024-11-14', opponent: 'Korea DPR',    venue: 'A', gf: 3, ga: 2, xg: 2.78, xga: 1.36, shots: 19, shotsOn: 12, oppShots: 17, oppShotsOn: 4 },
      { date: '2024-11-19', opponent: 'Kyrgyzstan',   venue: 'A', gf: 3, ga: 2, xg: 2.21, xga: 1.17, shots: 12, shotsOn:  5, oppShots:  8, oppShotsOn: 4 },
      { date: '2025-03-20', opponent: 'UAE',          venue: 'H', gf: 2, ga: 0, xg: 1.75, xga: 0.40, shots: 16, shotsOn:  8, oppShots:  6, oppShotsOn: 1 },
      { date: '2025-03-25', opponent: 'Uzbekistan',   venue: 'H', gf: 2, ga: 2, xg: 3.37, xga: 1.13, shots: 17, shotsOn:  6, oppShots: 12, oppShotsOn: 4 },
      { date: '2025-06-05', opponent: 'Qatar',        venue: 'A', gf: 0, ga: 1, xg: 0.33, xga: 0.83, shots:  5, shotsOn:  3, oppShots:  6, oppShotsOn: 3 },
      { date: '2025-06-10', opponent: 'Korea DPR',    venue: 'H', gf: 3, ga: 0, xg: 2.99, xga: 0.20, shots: 22, shotsOn:  8, oppShots:  6, oppShotsOn: 1 },
    ],
  },
  {
    team: 'New Zealand',
    note: "OFC's 2026 qualifying campaign is only 2 matches — both against far-weaker Pacific opposition (Vanuatu, Tahiti). Sample is meaningless for projecting WC performance. Treat all numbers below as illustrative, not predictive.",
    matches: [
      { date: '2024-10-11', opponent: 'Tahiti',   venue: 'H', gf: 3, ga: 0, xg: 1.50, xga: 0.12, shots: 18, shotsOn:  7, oppShots: 5, oppShotsOn: 2 },
      { date: '2024-11-15', opponent: 'Vanuatu',  venue: 'H', gf: 8, ga: 1, xg: 4.63, xga: 0.25, shots: 23, shotsOn: 13, oppShots: 5, oppShotsOn: 2 },
    ],
  },
  {
    team: 'Paraguay',
    matches: [
      { date: '2023-09-08', opponent: 'Peru',      venue: 'H', gf: 0, ga: 0, xg: 1.50, xga: 0.15, shots: 17, shotsOn: 5, oppShots:  3, oppShotsOn: 0 },
      { date: '2023-09-13', opponent: 'Venezuela', venue: 'A', gf: 0, ga: 1, xg: 1.22, xga: 1.48, shots: 16, shotsOn: 5, oppShots: 10, oppShotsOn: 3 },
      { date: '2023-10-13', opponent: 'Argentina', venue: 'A', gf: 0, ga: 1, xg: 0.12, xga: 1.35, shots:  4, shotsOn: 1, oppShots: 16, oppShotsOn: 5 },
      { date: '2023-10-18', opponent: 'Bolivia',   venue: 'H', gf: 1, ga: 0, xg: 1.41, xga: 0.17, shots: 13, shotsOn: 7, oppShots:  5, oppShotsOn: 0 },
      { date: '2023-11-17', opponent: 'Chile',     venue: 'A', gf: 0, ga: 0, xg: 0.52, xga: 0.67, shots:  8, shotsOn: 3, oppShots: 10, oppShotsOn: 4 },
      { date: '2023-11-22', opponent: 'Colombia',  venue: 'H', gf: 0, ga: 1, xg: 0.70, xga: 2.49, shots: 11, shotsOn: 2, oppShots: 11, oppShotsOn: 4 },
      { date: '2024-09-07', opponent: 'Uruguay',   venue: 'A', gf: 0, ga: 0, xg: 0.22, xga: 0.61, shots:  4, shotsOn: 1, oppShots: 11, oppShotsOn: 1 },
      { date: '2024-09-11', opponent: 'Brazil',    venue: 'H', gf: 1, ga: 0, xg: 0.43, xga: 0.87, shots:  7, shotsOn: 2, oppShots:  8, oppShotsOn: 3 },
      { date: '2024-10-10', opponent: 'Ecuador',   venue: 'A', gf: 0, ga: 0, xg: 0.23, xga: 0.69, shots:  3, shotsOn: 2, oppShots: 13, oppShotsOn: 4 },
      { date: '2024-10-16', opponent: 'Venezuela', venue: 'H', gf: 2, ga: 1, xg: 2.39, xga: 0.63, shots: 12, shotsOn: 6, oppShots:  6, oppShotsOn: 3 },
      { date: '2024-11-15', opponent: 'Argentina', venue: 'H', gf: 2, ga: 1, xg: 0.61, xga: 0.61, shots:  7, shotsOn: 2, oppShots:  7, oppShotsOn: 1 },
      { date: '2024-11-19', opponent: 'Bolivia',   venue: 'A', gf: 2, ga: 2, xg: 0.78, xga: 1.65, shots: 11, shotsOn: 4, oppShots:  9, oppShotsOn: 5 },
      { date: '2025-03-21', opponent: 'Chile',     venue: 'H', gf: 1, ga: 0, xg: 1.70, xga: 1.07, shots: 14, shotsOn: 5, oppShots:  8, oppShotsOn: 3 },
      { date: '2025-03-26', opponent: 'Colombia',  venue: 'A', gf: 2, ga: 2, xg: 1.99, xga: 1.10, shots: 20, shotsOn: 5, oppShots:  9, oppShotsOn: 5 },
      { date: '2025-06-06', opponent: 'Uruguay',   venue: 'H', gf: 2, ga: 0, xg: 1.49, xga: 0.70, shots: 13, shotsOn: 5, oppShots:  5, oppShotsOn: 2 },
      { date: '2025-06-11', opponent: 'Brazil',    venue: 'A', gf: 0, ga: 1, xg: 0.21, xga: 1.00, shots:  4, shotsOn: 1, oppShots:  9, oppShotsOn: 4 },
      { date: '2025-09-05', opponent: 'Ecuador',   venue: 'H', gf: 0, ga: 0, xg: 0.40, xga: 0.63, shots:  7, shotsOn: 3, oppShots:  6, oppShotsOn: 1 },
      { date: '2025-09-10', opponent: 'Peru',      venue: 'A', gf: 1, ga: 0, xg: 0.90, xga: 0.40, shots:  9, shotsOn: 4, oppShots: 11, oppShotsOn: 3 },
    ],
  },
  {
    team: 'Uruguay',
    matches: [
      { date: '2023-09-09', opponent: 'Chile',     venue: 'H', gf: 3, ga: 1, xg: 2.98, xga: 1.57, shots: 18, shotsOn: 8, oppShots:  7, oppShotsOn: 3 },
      { date: '2023-09-12', opponent: 'Ecuador',   venue: 'A', gf: 1, ga: 2, xg: 0.52, xga: 1.69, shots:  5, shotsOn: 2, oppShots: 15, oppShotsOn: 4 },
      { date: '2023-10-12', opponent: 'Colombia',  venue: 'A', gf: 2, ga: 2, xg: 2.43, xga: 1.69, shots: 15, shotsOn: 6, oppShots: 13, oppShotsOn: 4 },
      { date: '2023-10-18', opponent: 'Brazil',    venue: 'H', gf: 2, ga: 0, xg: 0.60, xga: 0.17, shots:  5, shotsOn: 2, oppShots:  3, oppShotsOn: 1 },
      { date: '2023-11-17', opponent: 'Argentina', venue: 'A', gf: 2, ga: 0, xg: 0.65, xga: 0.63, shots:  6, shotsOn: 2, oppShots: 10, oppShotsOn: 3 },
      { date: '2023-11-22', opponent: 'Bolivia',   venue: 'H', gf: 3, ga: 0, xg: 2.98, xga: 0.14, shots: 18, shotsOn: 5, oppShots:  4, oppShotsOn: 0 },
      { date: '2024-09-07', opponent: 'Paraguay',  venue: 'H', gf: 0, ga: 0, xg: 0.61, xga: 0.22, shots: 11, shotsOn: 1, oppShots:  4, oppShotsOn: 1 },
      { date: '2024-09-11', opponent: 'Venezuela', venue: 'A', gf: 0, ga: 0, xg: 0.52, xga: 1.91, shots:  8, shotsOn: 2, oppShots: 20, oppShotsOn: 6 },
      { date: '2024-10-12', opponent: 'Peru',      venue: 'A', gf: 0, ga: 1, xg: 0.66, xga: 0.80, shots:  8, shotsOn: 3, oppShots: 12, oppShotsOn: 3 },
      { date: '2024-10-16', opponent: 'Ecuador',   venue: 'H', gf: 0, ga: 0, xg: 0.91, xga: 0.84, shots: 10, shotsOn: 4, oppShots:  8, oppShotsOn: 4 },
      { date: '2024-11-16', opponent: 'Colombia',  venue: 'H', gf: 3, ga: 2, xg: 1.21, xga: 1.64, shots: 10, shotsOn: 5, oppShots: 10, oppShotsOn: 4 },
      { date: '2024-11-20', opponent: 'Brazil',    venue: 'A', gf: 1, ga: 1, xg: 0.60, xga: 0.93, shots:  8, shotsOn: 2, oppShots: 18, oppShotsOn: 3 },
      { date: '2025-03-22', opponent: 'Argentina', venue: 'H', gf: 0, ga: 1, xg: 0.30, xga: 0.65, shots:  4, shotsOn: 2, oppShots: 12, oppShotsOn: 4 },
      { date: '2025-03-25', opponent: 'Bolivia',   venue: 'A', gf: 0, ga: 0, xg: 0.41, xga: 1.37, shots:  9, shotsOn: 0, oppShots: 29, oppShotsOn: 7 },
      { date: '2025-06-06', opponent: 'Paraguay',  venue: 'A', gf: 0, ga: 2, xg: 0.70, xga: 1.49, shots:  5, shotsOn: 2, oppShots: 13, oppShotsOn: 5 },
      { date: '2025-06-11', opponent: 'Venezuela', venue: 'H', gf: 2, ga: 0, xg: 1.00, xga: 0.79, shots: 12, shotsOn: 5, oppShots: 10, oppShotsOn: 1 },
      { date: '2025-09-05', opponent: 'Peru',      venue: 'H', gf: 3, ga: 0, xg: 2.03, xga: 0.71, shots: 22, shotsOn: 7, oppShots: 12, oppShotsOn: 3 },
      { date: '2025-09-10', opponent: 'Chile',     venue: 'A', gf: 0, ga: 0, xg: 1.06, xga: 1.25, shots:  5, shotsOn: 2, oppShots: 15, oppShotsOn: 3 },
    ],
  },
  {
    team: 'Ecuador',
    matches: [
      { date: '2023-09-08', opponent: 'Argentina', venue: 'A', gf: 0, ga: 1, xg: 0.17, xga: 2.34, shots:  3, shotsOn:  3, oppShots: 11, oppShotsOn: 3 },
      { date: '2023-09-12', opponent: 'Uruguay',   venue: 'H', gf: 2, ga: 1, xg: 1.69, xga: 0.52, shots: 15, shotsOn:  4, oppShots:  5, oppShotsOn: 2 },
      { date: '2023-10-13', opponent: 'Bolivia',   venue: 'A', gf: 2, ga: 1, xg: 0.64, xga: 1.29, shots:  8, shotsOn:  3, oppShots: 13, oppShotsOn: 3 },
      { date: '2023-10-18', opponent: 'Colombia',  venue: 'H', gf: 0, ga: 0, xg: 0.51, xga: 1.22, shots:  7, shotsOn:  2, oppShots:  7, oppShotsOn: 3 },
      { date: '2023-11-16', opponent: 'Venezuela', venue: 'A', gf: 0, ga: 0, xg: 0.26, xga: 0.44, shots:  6, shotsOn:  1, oppShots:  7, oppShotsOn: 2 },
      { date: '2023-11-22', opponent: 'Chile',     venue: 'H', gf: 1, ga: 0, xg: 1.57, xga: 1.23, shots: 15, shotsOn:  6, oppShots: 11, oppShotsOn: 2 },
      { date: '2024-09-07', opponent: 'Brazil',    venue: 'A', gf: 0, ga: 1, xg: 0.42, xga: 0.55, shots:  8, shotsOn:  1, oppShots:  8, oppShotsOn: 3 },
      { date: '2024-09-10', opponent: 'Peru',      venue: 'H', gf: 1, ga: 0, xg: 0.89, xga: 0.10, shots: 12, shotsOn:  5, oppShots:  2, oppShotsOn: 1 },
      { date: '2024-10-10', opponent: 'Paraguay',  venue: 'H', gf: 0, ga: 0, xg: 0.69, xga: 0.23, shots: 13, shotsOn:  4, oppShots:  3, oppShotsOn: 2 },
      { date: '2024-10-16', opponent: 'Uruguay',   venue: 'A', gf: 0, ga: 0, xg: 0.84, xga: 0.91, shots:  8, shotsOn:  4, oppShots: 10, oppShotsOn: 4 },
      { date: '2024-11-15', opponent: 'Bolivia',   venue: 'H', gf: 4, ga: 0, xg: 3.56, xga: 0.01, shots: 29, shotsOn: 15, oppShots:  1, oppShotsOn: 1 },
      { date: '2024-11-20', opponent: 'Colombia',  venue: 'A', gf: 1, ga: 0, xg: 0.27, xga: 3.06, shots:  4, shotsOn:  1, oppShots: 24, oppShotsOn: 7 },
      { date: '2025-03-21', opponent: 'Venezuela', venue: 'H', gf: 2, ga: 1, xg: 1.67, xga: 1.68, shots: 13, shotsOn:  6, oppShots: 11, oppShotsOn: 7 },
      { date: '2025-03-26', opponent: 'Chile',     venue: 'A', gf: 0, ga: 0, xg: 0.48, xga: 1.51, shots:  5, shotsOn:  2, oppShots: 17, oppShotsOn: 3 },
      { date: '2025-06-06', opponent: 'Brazil',    venue: 'H', gf: 0, ga: 0, xg: 0.51, xga: 0.49, shots:  7, shotsOn:  3, oppShots:  3, oppShotsOn: 2 },
      { date: '2025-06-11', opponent: 'Peru',      venue: 'A', gf: 0, ga: 0, xg: 0.73, xga: 1.00, shots: 10, shotsOn:  3, oppShots: 12, oppShotsOn: 5 },
      { date: '2025-09-05', opponent: 'Paraguay',  venue: 'A', gf: 0, ga: 0, xg: 0.63, xga: 0.40, shots:  6, shotsOn:  1, oppShots:  7, oppShotsOn: 3 },
      { date: '2025-09-10', opponent: 'Argentina', venue: 'H', gf: 1, ga: 0, xg: 1.77, xga: 0.22, shots: 11, shotsOn:  4, oppShots:  6, oppShotsOn: 0 },
    ],
  },
  {
    team: 'Argentina',
    matches: [
      { date: '2023-09-08', opponent: 'Ecuador',   venue: 'H', gf: 1, ga: 0, xg: 2.34, xga: 0.17, shots: 11, shotsOn: 3, oppShots:  3, oppShotsOn: 3 },
      { date: '2023-09-12', opponent: 'Bolivia',   venue: 'A', gf: 3, ga: 0, xg: 1.22, xga: 0.03, shots: 14, shotsOn: 8, oppShots:  4, oppShotsOn: 2 },
      { date: '2023-10-13', opponent: 'Paraguay',  venue: 'H', gf: 1, ga: 0, xg: 1.35, xga: 0.12, shots: 16, shotsOn: 5, oppShots:  4, oppShotsOn: 1 },
      { date: '2023-10-18', opponent: 'Peru',      venue: 'A', gf: 2, ga: 0, xg: 1.63, xga: 0.64, shots: 10, shotsOn: 6, oppShots:  5, oppShotsOn: 0 },
      { date: '2023-11-17', opponent: 'Uruguay',   venue: 'H', gf: 0, ga: 2, xg: 0.63, xga: 0.65, shots: 10, shotsOn: 3, oppShots:  6, oppShotsOn: 2 },
      { date: '2023-11-22', opponent: 'Brazil',    venue: 'A', gf: 1, ga: 0, xg: 0.25, xga: 0.20, shots:  7, shotsOn: 2, oppShots:  7, oppShotsOn: 4 },
      { date: '2024-09-06', opponent: 'Chile',     venue: 'H', gf: 3, ga: 0, xg: 1.09, xga: 0.24, shots: 13, shotsOn: 8, oppShots:  4, oppShotsOn: 1 },
      { date: '2024-09-10', opponent: 'Colombia',  venue: 'A', gf: 1, ga: 2, xg: 1.34, xga: 1.58, shots: 11, shotsOn: 1, oppShots:  7, oppShotsOn: 5 },
      { date: '2024-10-10', opponent: 'Venezuela', venue: 'A', gf: 1, ga: 1, xg: 1.08, xga: 1.14, shots:  8, shotsOn: 4, oppShots: 17, oppShotsOn: 6 },
      { date: '2024-10-16', opponent: 'Bolivia',   venue: 'H', gf: 6, ga: 0, xg: 2.38, xga: 0.06, shots: 13, shotsOn: 9, oppShots:  3, oppShotsOn: 1 },
      { date: '2024-11-15', opponent: 'Paraguay',  venue: 'A', gf: 1, ga: 2, xg: 0.61, xga: 0.61, shots:  7, shotsOn: 1, oppShots:  7, oppShotsOn: 2 },
      { date: '2024-11-20', opponent: 'Peru',      venue: 'H', gf: 1, ga: 0, xg: 1.37, xga: 0.04, shots: 12, shotsOn: 3, oppShots:  2, oppShotsOn: 0 },
      { date: '2025-03-22', opponent: 'Uruguay',   venue: 'A', gf: 1, ga: 0, xg: 0.65, xga: 0.30, shots: 12, shotsOn: 4, oppShots:  4, oppShotsOn: 2 },
      { date: '2025-03-26', opponent: 'Brazil',    venue: 'H', gf: 4, ga: 1, xg: 2.08, xga: 0.14, shots: 12, shotsOn: 7, oppShots:  3, oppShotsOn: 1 },
      { date: '2025-06-06', opponent: 'Chile',     venue: 'A', gf: 1, ga: 0, xg: 1.74, xga: 0.48, shots:  9, shotsOn: 3, oppShots:  6, oppShotsOn: 3 },
      { date: '2025-06-11', opponent: 'Colombia',  venue: 'H', gf: 1, ga: 1, xg: 1.68, xga: 1.05, shots: 12, shotsOn: 4, oppShots:  8, oppShotsOn: 5 },
      { date: '2025-09-05', opponent: 'Venezuela', venue: 'H', gf: 3, ga: 0, xg: 1.99, xga: 0.06, shots: 17, shotsOn: 9, oppShots:  5, oppShotsOn: 0 },
      { date: '2025-09-10', opponent: 'Ecuador',   venue: 'A', gf: 0, ga: 1, xg: 0.22, xga: 1.77, shots:  6, shotsOn: 0, oppShots: 11, oppShotsOn: 4 },
    ],
  },
  {
    team: 'Brazil',
    matches: [
      { date: '2023-09-09', opponent: 'Bolivia',   venue: 'H', gf: 5, ga: 1, xg: 3.72, xga: 0.20, shots: 21, shotsOn: 11, oppShots:  3, oppShotsOn:  3 },
      { date: '2023-09-13', opponent: 'Peru',      venue: 'A', gf: 1, ga: 0, xg: 0.91, xga: 0.16, shots:  9, shotsOn:  3, oppShots:  6, oppShotsOn:  0 },
      { date: '2023-10-13', opponent: 'Venezuela', venue: 'H', gf: 1, ga: 1, xg: 1.21, xga: 0.80, shots: 14, shotsOn:  6, oppShots:  8, oppShotsOn:  3 },
      { date: '2023-10-18', opponent: 'Uruguay',   venue: 'A', gf: 0, ga: 2, xg: 0.17, xga: 0.60, shots:  3, shotsOn:  1, oppShots:  5, oppShotsOn:  2 },
      { date: '2023-11-17', opponent: 'Colombia',  venue: 'A', gf: 1, ga: 2, xg: 0.81, xga: 1.66, shots: 11, shotsOn:  3, oppShots: 22, oppShotsOn: 10 },
      { date: '2023-11-22', opponent: 'Argentina', venue: 'H', gf: 0, ga: 1, xg: 0.20, xga: 0.25, shots:  7, shotsOn:  4, oppShots:  7, oppShotsOn:  2 },
      { date: '2024-09-07', opponent: 'Ecuador',   venue: 'H', gf: 1, ga: 0, xg: 0.55, xga: 0.42, shots:  8, shotsOn:  3, oppShots:  8, oppShotsOn:  1 },
      { date: '2024-09-11', opponent: 'Paraguay',  venue: 'A', gf: 0, ga: 1, xg: 0.87, xga: 0.43, shots:  8, shotsOn:  3, oppShots:  7, oppShotsOn:  2 },
      { date: '2024-10-11', opponent: 'Chile',     venue: 'A', gf: 2, ga: 1, xg: 0.57, xga: 0.31, shots: 13, shotsOn:  3, oppShots:  8, oppShotsOn:  1 },
      { date: '2024-10-16', opponent: 'Peru',      venue: 'H', gf: 4, ga: 0, xg: 2.95, xga: 0.09, shots: 16, shotsOn:  8, oppShots:  3, oppShotsOn:  2 },
      { date: '2024-11-14', opponent: 'Venezuela', venue: 'A', gf: 1, ga: 1, xg: 3.00, xga: 1.10, shots: 13, shotsOn:  3, oppShots: 11, oppShotsOn:  5 },
      { date: '2024-11-20', opponent: 'Uruguay',   venue: 'H', gf: 1, ga: 1, xg: 0.93, xga: 0.60, shots: 18, shotsOn:  3, oppShots:  8, oppShotsOn:  2 },
      { date: '2025-03-21', opponent: 'Colombia',  venue: 'H', gf: 2, ga: 1, xg: 2.15, xga: 1.05, shots: 13, shotsOn:  7, oppShots: 10, oppShotsOn:  2 },
      { date: '2025-03-26', opponent: 'Argentina', venue: 'A', gf: 1, ga: 4, xg: 0.14, xga: 2.08, shots:  3, shotsOn:  1, oppShots: 12, oppShotsOn:  7 },
      { date: '2025-06-06', opponent: 'Ecuador',   venue: 'A', gf: 0, ga: 0, xg: 0.49, xga: 0.51, shots:  3, shotsOn:  2, oppShots:  7, oppShotsOn:  3 },
      { date: '2025-06-11', opponent: 'Paraguay',  venue: 'H', gf: 1, ga: 0, xg: 1.00, xga: 0.21, shots:  9, shotsOn:  4, oppShots:  4, oppShotsOn:  1 },
      { date: '2025-09-05', opponent: 'Chile',     venue: 'H', gf: 3, ga: 0, xg: 4.83, xga: 0.06, shots: 22, shotsOn:  7, oppShots:  3, oppShotsOn:  0 },
      { date: '2025-09-10', opponent: 'Bolivia',   venue: 'A', gf: 0, ga: 1, xg: 0.39, xga: 1.71, shots:  7, shotsOn:  3, oppShots: 19, oppShotsOn:  9 },
    ],
  },
];

export function teamXgByNation(nation: string): TeamXg | undefined {
  return QUAL_XG.find((t) => t.team === nation);
}
