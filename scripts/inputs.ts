// Builds ModelInputs for a single historical match from data available
// strictly BEFORE that match's kickoff — the no-lookahead guarantee for
// the whole harness lives in one place: `priorRecords()` below. Every
// other function in this file gets its history pre-filtered by routing
// through it; nothing else in the harness is allowed to read a team's
// full-season array without going through this filter first.

import type { TeamModelInputs } from '../frontend/src/model/valorModel';
import { normalizeUnderstatName } from './understat-name-map';
import type { HistoricalMatchRow, XGDataRow } from './db';

export interface TeamGoalsRecord {
  matchDate: string; // YYYY-MM-DD
  goalsFor: number;
  goalsAgainst: number;
}

export interface TeamXGRecord {
  matchDate: string; // YYYY-MM-DD
  npxgFor: number;
  npxgAgainst: number;
}

// THE no-lookahead choke point. Strict less-than: a record dated exactly
// on targetDate (e.g. a second same-day fixture, which doesn't happen in
// single-round-robin leagues but would be a real bug if it did) is
// excluded, not just future dates.
function priorRecords<T extends { matchDate: string }>(all: T[], targetDate: string): T[] {
  return all.filter((r) => r.matchDate < targetDate);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// Extracts one team's goals-for/against from historical_matches — the
// team can appear as either home or away in any given row.
export function buildGoalsHistory(rows: HistoricalMatchRow[], team: string): TeamGoalsRecord[] {
  const out: TeamGoalsRecord[] = [];
  for (const r of rows) {
    if (r.fthg === null || r.ftag === null) continue; // unplayed / no result
    if (r.home_team === team) {
      out.push({ matchDate: r.match_date, goalsFor: r.fthg, goalsAgainst: r.ftag });
    } else if (r.away_team === team) {
      out.push({ matchDate: r.match_date, goalsFor: r.ftag, goalsAgainst: r.fthg });
    }
  }
  out.sort((a, b) => (a.matchDate < b.matchDate ? -1 : a.matchDate > b.matchDate ? 1 : 0));
  return out;
}

// Extracts one team's npxG history from xg_data, normalizing the
// Understat team name to canonical first, sorted by match_number (the
// harness's proxy for chronological order within a season — cross-checked
// against match_date, which should agree since Understat's numbering is
// already chronological).
export function buildXGHistory(rows: XGDataRow[], league: string, team: string): TeamXGRecord[] {
  const out: TeamXGRecord[] = [];
  for (const r of rows) {
    if (normalizeUnderstatName(r.team_name, league) !== team) continue;
    out.push({ matchDate: r.match_date, npxgFor: r.npxg_for, npxgAgainst: r.npxg_against });
  }
  out.sort((a, b) => (a.matchDate < b.matchDate ? -1 : a.matchDate > b.matchDate ? 1 : 0));
  return out;
}

export type BuildMode = 'xg' | 'fallback';

export interface BuiltTeamInputs {
  inputs: TeamModelInputs;
  // Count of prior matches actually used to build this team's inputs —
  // in xG mode this is the xG-history count (the binding constraint);
  // in fallback mode it's the goals-history count. Used for the
  // >=8-prior-matches skip rule.
  matchesUsed: number;
}

// Builds one team's ModelInputs for a match on `targetDate`, using only
// records strictly before that date (see priorRecords above).
//
// xG mode: xgFor/xgAgainst/last6XGFor/last6XGAgainst come from npxG
// history (season mean / mean of last <=6). goalsAgainst (used by Step 3's
// 80/20 blend against the xG signal) comes from actual results in
// historical_matches, independently of the xG source.
//
// fallback mode: no xG data is used at all. xgFor/xgAgainst are goals
// scored/conceded averages standing in for xG — this is a deliberate
// approximation (see docs/calibration/baseline.md): the model's Step 2
// attack-strength divisor is the league's avgXG constant, not avgGoals,
// so feeding it goals-shaped data introduces a small, consistent bias
// versus a true goals-calibrated model. Acceptable for a fallback/
// comparison run, not for the primary result.
//
// Fields with no historical source at all (penalties, shots, set-piece
// split, absence) are zeroed/defaulted — exactly what an unfilled
// Advanced Input on the live page does, so this reproduces the site's
// "default form" behaviour, not a hypothetically fuller one.
export function buildTeamInputs(
  mode: BuildMode,
  goalsHistory: TeamGoalsRecord[],
  xgHistory: TeamXGRecord[],
  targetDate: string
): BuiltTeamInputs {
  const priorGoals = priorRecords(goalsHistory, targetDate);

  if (mode === 'fallback') {
    const seasonGF = mean(priorGoals.map((r) => r.goalsFor));
    const seasonGA = mean(priorGoals.map((r) => r.goalsAgainst));
    const last6 = priorGoals.slice(-6);
    return {
      matchesUsed: priorGoals.length,
      inputs: {
        goalsAgainst: seasonGA,
        xgFor: seasonGF,
        xgAgainst: seasonGA,
        matchesPlayed: priorGoals.length,
        penaltiesReceived: 0,
        penaltiesConceded: 0,
        shotsFor: 0,
        shotsAgainst: 0,
        openPlayXG: 0,
        setPieceXG: 0,
        last6XGFor: mean(last6.map((r) => r.goalsFor)),
        last6XGAgainst: mean(last6.map((r) => r.goalsAgainst)),
        absence: 1,
      },
    };
  }

  const priorXG = priorRecords(xgHistory, targetDate);
  const last6XG = priorXG.slice(-6);
  return {
    matchesUsed: priorXG.length,
    inputs: {
      goalsAgainst: mean(priorGoals.map((r) => r.goalsAgainst)),
      xgFor: mean(priorXG.map((r) => r.npxgFor)),
      xgAgainst: mean(priorXG.map((r) => r.npxgAgainst)),
      matchesPlayed: priorXG.length,
      penaltiesReceived: 0,
      penaltiesConceded: 0,
      shotsFor: 0,
      shotsAgainst: 0,
      openPlayXG: 0,
      setPieceXG: 0,
      last6XGFor: mean(last6XG.map((r) => r.npxgFor)),
      last6XGAgainst: mean(last6XG.map((r) => r.npxgAgainst)),
      absence: 1,
    },
  };
}
