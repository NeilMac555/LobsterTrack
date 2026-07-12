// Builds datasets of {ModelInputs, actual result} pairs for a league,
// mode, and season filter — with NO ModelParams baked in, unlike
// backtest.ts's build1X2Samples(). This is what a grid search needs:
// build each match's inputs once, then run runModel() against many
// different parameter sets cheaply.
//
// Mirrors backtest.ts's match-selection logic exactly (same no-lookahead
// path through inputs.ts's buildTeamInputs/priorRecords, same >=8-prior-
// matches skip rule) so fit.ts's datasets are directly comparable to
// backtest.ts's — deliberately duplicated rather than refactoring
// backtest.ts (already verified/committed for the baseline report; not
// touching it here).

import { fetchHistoricalMatches, fetchXGData, type HistoricalMatchRow } from './db';
import { buildGoalsHistory, buildXGHistory, buildTeamInputs, type BuildMode } from './inputs';
import type { ModelInputs } from '../frontend/src/model/valorModel';

const MIN_PRIOR_MATCHES = 8;

export interface DatasetRow {
  league: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  inputs: ModelInputs;
  actual: 'home' | 'draw' | 'away';
  // Closing 1X2 prices, if available — carried through so the final
  // evaluation step can report vs-close metrics without a second fetch.
  priceSource: HistoricalMatchRow['price_source'];
  psch: number | null;
  pscd: number | null;
  psca: number | null;
}

export async function buildDataset(
  league: string,
  mode: BuildMode,
  seasonFilter: (season: string) => boolean
): Promise<DatasetRow[]> {
  const allMatches = await fetchHistoricalMatches(league);
  const matches = allMatches.filter((m) => seasonFilter(m.season) && m.ftr !== null);
  const xgRows = mode === 'xg' ? await fetchXGData(league) : [];

  const teamsInSeason = new Set<string>();
  matches.forEach((m) => { teamsInSeason.add(m.home_team); teamsInSeason.add(m.away_team); });

  const goalsHistoryCache = new Map<string, ReturnType<typeof buildGoalsHistory>>();
  const xgHistoryCache = new Map<string, ReturnType<typeof buildXGHistory>>();
  for (const team of teamsInSeason) {
    goalsHistoryCache.set(team, buildGoalsHistory(matches, team));
    if (mode === 'xg') xgHistoryCache.set(team, buildXGHistory(xgRows, league, team));
  }

  const rows: DatasetRow[] = [];
  for (const m of matches) {
    const homeGoals = goalsHistoryCache.get(m.home_team) ?? [];
    const awayGoals = goalsHistoryCache.get(m.away_team) ?? [];
    const homeXG = xgHistoryCache.get(m.home_team) ?? [];
    const awayXG = xgHistoryCache.get(m.away_team) ?? [];

    const homeBuilt = buildTeamInputs(mode, homeGoals, homeXG, m.match_date);
    const awayBuilt = buildTeamInputs(mode, awayGoals, awayXG, m.match_date);
    if (homeBuilt.matchesUsed < MIN_PRIOR_MATCHES || awayBuilt.matchesUsed < MIN_PRIOR_MATCHES) continue;

    const actual: 'home' | 'draw' | 'away' = m.ftr === 'H' ? 'home' : m.ftr === 'D' ? 'draw' : 'away';
    rows.push({
      league,
      homeTeam: m.home_team,
      awayTeam: m.away_team,
      matchDate: m.match_date,
      inputs: { home: homeBuilt.inputs, away: awayBuilt.inputs },
      actual,
      priceSource: m.price_source,
      psch: m.psch,
      pscd: m.pscd,
      psca: m.psca,
    });
  }
  return rows;
}
