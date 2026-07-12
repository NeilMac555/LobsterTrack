// Current PRODUCTION model params, mirrored exactly from
// frontend/src/pages/MatchPredictorPage.tsx's LEAGUES/makeDefaultAdvanced
// constants as of the calibration-harness build (2026-07-12 session).
// This file exists so the baseline run tests the model AS DEPLOYED —
// per the task brief, this harness is infrastructure only and must not
// change any model parameter. When the actual page constants are next
// tuned, update this file to match (or better: have the harness import
// LEAGUES directly — deferred because the page currently has no
// import-safe export of it decoupled from its default-team-builder side
// effects; worth doing before the next baseline run).
//
// sport_key (the DB's `league` column value) -> LeagueParams.

import type { LeagueParams } from '../frontend/src/model/valorModel';

export const LEAGUE_PARAMS: Record<string, LeagueParams> = {
  soccer_epl: { avgGoals: 1.43, avgXG: 1.35, avgShotsPerGame: 13.2, avgGoalsPerTeam: 1.375, homeAwayRatio: 1.25 },
  soccer_germany_bundesliga: { avgGoals: 1.50, avgXG: 1.45, avgShotsPerGame: 14.1, avgGoalsPerTeam: 1.620, homeAwayRatio: 1.22 },
  soccer_spain_la_liga: { avgGoals: 1.30, avgXG: 1.25, avgShotsPerGame: 12.4, avgGoalsPerTeam: 1.345, homeAwayRatio: 1.36 },
  soccer_italy_serie_a: { avgGoals: 1.32, avgXG: 1.26, avgShotsPerGame: 13.0, avgGoalsPerTeam: 1.215, homeAwayRatio: 1.15 },
  soccer_france_ligue_one: { avgGoals: 1.33, avgXG: 1.27, avgShotsPerGame: 12.8, avgGoalsPerTeam: 1.415, homeAwayRatio: 1.27 },
};

export const CURRENT_ADVANCED_PARAMS = {
  drawInflation: 1.08,
  rho: -0.03,
  formWeight: 0.25,
  spDiscount: 0.85,
  // Backtest inputs never populate shots/openPlay/setPiece (no historical
  // source), so qualityWeight and spDiscount are inert regardless of
  // value here — kept at production defaults for completeness/honesty
  // about what "current production params" means, not because they do
  // anything in this harness.
  qualityWeight: 0,
  absenceWeight: 0.03,
};

export const SUPPORTED_LEAGUES = Object.keys(LEAGUE_PARAMS);

// The season xg_data currently has real npxG history for. Every xG-mode
// call site in this harness must pass this explicitly to fetchXGData()
// (required parameter since the 2026-07-12 xg_data.season migration —
// see db.ts) — bump this once 2026/27 data lands and a new baseline is
// due.
export const CURRENT_XG_SEASON = '2526';
