// STEP 1 of the live-league-constants task (see TODO.md "Now" item).
// Read-only: computes what avgGoalsPerTeam/homeAwayRatio WOULD be per
// league from our own historical_matches data, and prints a comparison
// against the current hardcoded values in
// frontend/src/pages/MatchPredictorPage.tsx / scripts/model-params.ts.
// Writes nothing — no schema change, no table, no scheduler. This is
// purely for Neil to sanity-check the deltas before Step 2 (storage)
// gets built.
//
//   railway run npx tsx compute_league_constants.ts

import { fetchHistoricalMatches, closePool } from './db';
import { LEAGUE_PARAMS } from './model-params';

// Rolling window = current season + last 3 completed seasons (up to 4
// season-buckets total), weighted by recency: the top 2 season-buckets
// (current + most-recent-completed) both get 1.0, then 0.67, then 0.33.
// "Current season" is simply the most recent season code present for
// that league in historical_matches — if that season has already
// finished (no newer season started yet), it's still just the top
// bucket; the weighting collapses naturally (see steps23-diagnosis.md
// precedent for this kind of season-ranking-by-string-sort).
const WEIGHTS_BY_RANK = [1.0, 1.0, 0.67, 0.33];
const MIN_WEIGHTED_MATCHES = 380;

interface LeagueResult {
  league: string;
  seasonsUsed: { season: string; weight: number; matchCount: number }[];
  weightedMatchCount: number;
  computedAvgGoalsPerTeam: number | null;
  computedHomeAwayRatio: number | null;
  guardTriggered: boolean;
  hardcodedAvgGoalsPerTeam: number;
  hardcodedHomeAwayRatio: number;
}

async function computeForLeague(league: string): Promise<LeagueResult> {
  const all = await fetchHistoricalMatches(league);
  const completed = all.filter((m) => m.ftr !== null && m.fthg !== null && m.ftag !== null);

  // Distinct season codes present, sorted descending (season codes are
  // consecutive 4-digit strings, e.g. '2526' > '2425' — lexical sort =
  // chronological sort, same trick as the backend's _latest_xg_season).
  const seasons = Array.from(new Set(completed.map((m) => m.season))).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const topSeasons = seasons.slice(0, 4);
  const weightBySeason = new Map<string, number>();
  topSeasons.forEach((s, i) => weightBySeason.set(s, WEIGHTS_BY_RANK[i]));

  let weightedGoals = 0;
  let weightedHomeGoals = 0;
  let weightedAwayGoals = 0;
  let weightedMatches = 0;
  const perSeasonCount = new Map<string, number>();

  for (const m of completed) {
    const w = weightBySeason.get(m.season);
    if (w === undefined) continue; // outside the 4-season window
    weightedGoals += w * (m.fthg! + m.ftag!);
    weightedHomeGoals += w * m.fthg!;
    weightedAwayGoals += w * m.ftag!;
    weightedMatches += w;
    perSeasonCount.set(m.season, (perSeasonCount.get(m.season) ?? 0) + 1);
  }

  const guardTriggered = weightedMatches < MIN_WEIGHTED_MATCHES;
  const hardcoded = LEAGUE_PARAMS[league];

  return {
    league,
    seasonsUsed: topSeasons.map((s) => ({ season: s, weight: weightBySeason.get(s)!, matchCount: perSeasonCount.get(s) ?? 0 })),
    weightedMatchCount: weightedMatches,
    computedAvgGoalsPerTeam: guardTriggered ? null : weightedGoals / (weightedMatches * 2),
    computedHomeAwayRatio: guardTriggered ? null : weightedHomeGoals / weightedAwayGoals,
    guardTriggered,
    hardcodedAvgGoalsPerTeam: hardcoded.avgGoalsPerTeam,
    hardcodedHomeAwayRatio: hardcoded.homeAwayRatio,
  };
}

async function main() {
  const leagues = Object.keys(LEAGUE_PARAMS);
  const results: LeagueResult[] = [];
  for (const league of leagues) {
    results.push(await computeForLeague(league));
  }
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => closePool());
