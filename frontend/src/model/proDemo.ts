import snapshot from '../data/proDemo.json';
import type { ModelParams, TeamModelInputs } from './valorModel';

export const demo = snapshot;
export type Side = 'home' | 'away';
export type Venue = 'all' | 'home' | 'away';
export type Sample = 5 | 10 | 20;
export type FormGame = (typeof demo.form.home)[number];
export type XGGame = (typeof demo.xg.home)[number];

export function selectForm(side: Side, count: Sample, venue: Venue): FormGame[] {
  return demo.form[side].filter(row => venue === 'all' || row.venue === venue).slice(-count);
}

export function formSummary(rows: FormGame[]) {
  const covered = rows.filter(row => row.npxgf !== null && row.npxga !== null);
  const n = rows.length;
  return {
    played: n,
    wins: rows.filter(row => row.gf > row.ga).length,
    draws: rows.filter(row => row.gf === row.ga).length,
    losses: rows.filter(row => row.gf < row.ga).length,
    goalsFor: n ? rows.reduce((sum, row) => sum + row.gf, 0) / n : null,
    goalsAgainst: n ? rows.reduce((sum, row) => sum + row.ga, 0) / n : null,
    xgCoverage: covered.length,
    xgFor: covered.length ? covered.reduce((sum, row) => sum + (row.npxgf ?? 0), 0) / covered.length : null,
    xgAgainst: covered.length ? covered.reduce((sum, row) => sum + (row.npxga ?? 0), 0) / covered.length : null,
  };
}

const mean = (rows: XGGame[], field: 'xgf' | 'xga' | 'npxgf' | 'npxga' | 'ga') =>
  rows.reduce((sum, row) => sum + row[field], 0) / rows.length;

/** The live model removes half of penalty xG. Using penalty equivalents
 * preserves that operation exactly without pretending we have penalty counts. */
export function demoInputs(side: Side, absence = 1): TeamModelInputs {
  const rows = demo.xg[side].slice(-20);
  const recent = rows.slice(-6);
  return {
    matchesPlayed: rows.length,
    goalsAgainst: mean(rows, 'ga'),
    xgFor: mean(rows, 'xgf'),
    xgAgainst: mean(rows, 'xga'),
    penaltiesReceived: rows.reduce((sum, row) => sum + Math.max(0, row.xgf - row.npxgf), 0) / 0.76,
    penaltiesConceded: rows.reduce((sum, row) => sum + Math.max(0, row.xga - row.npxga), 0) / 0.76,
    last6XGFor: mean(recent, 'xgf'),
    last6XGAgainst: mean(recent, 'xga'),
    shotsFor: 0, shotsAgainst: 0, openPlayXG: 0, setPieceXG: 0,
    absence,
  };
}

export const demoParams: ModelParams = {
  league: demo.league,
  drawInflation: 1.08, rho: -0.03, formWeight: 0.25,
  spDiscount: 0.85, qualityWeight: 0, absenceWeight: 0.03,
};

export function rollingXG(side: Side, window: 5 | 10) {
  const history = demo.xg[side];
  return history.map((row, index) => {
    const sample = history.slice(Math.max(0, index + 1 - window), index + 1);
    return { ...row, for: mean(sample, 'npxgf'), against: mean(sample, 'npxga'), sampleSize: sample.length };
  }).slice(-20);
}
