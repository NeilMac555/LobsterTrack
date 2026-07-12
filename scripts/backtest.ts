// Calibration/backtest harness — runs the production Match Predictor
// model (frontend/src/model/valorModel.ts) against real historical
// matches pulled from Postgres and scores it. Three subcommands, one per
// run agreed in the discovery-report decisions:
//
//   npx tsx backtest.ts primary   [--league=<sport_key>|all]
//   npx tsx backtest.ts secondary [--league=soccer_epl]
//   npx tsx backtest.ts ahtotals  [--league=<sport_key>|all]
//
// Requires DATABASE_URL in the environment (see db.ts). Prints a single
// JSON object to stdout per run; redirect to a file and hand-summarise
// into docs/calibration/baseline.md, or pipe through `| npx tsx summarize.ts`.
//
// NO-LOOKAHEAD: every match's ModelInputs are built by buildTeamInputs()
// in inputs.ts, which routes through the single priorRecords() filter
// (strict `matchDate < targetDate`) before any mean/last-6 is computed.
// This file never reads a team's full-season history directly — it only
// ever calls buildTeamInputs(mode, fullHistory, fullXGHistory, matchDate)
// and lets that function do the filtering. See inputs.ts for the audit
// trail.

import {
  fetchHistoricalMatches,
  fetchXGData,
  fetchClosingLines,
  closePool,
  type HistoricalMatchRow,
  type ClosingLineRow,
} from './db';
import { buildGoalsHistory, buildXGHistory, buildTeamInputs, type BuildMode } from './inputs';
import { LEAGUE_PARAMS, CURRENT_ADVANCED_PARAMS, SUPPORTED_LEAGUES, CURRENT_XG_SEASON } from './model-params';
import { runModel } from '../frontend/src/model/valorModel';
import {
  score1X2, score2Way, clvProxy1X2, clvProxy2Way, calibrationTable,
  type OutcomeSample3, type OutcomeSample2,
} from './scoring';

const MIN_PRIOR_MATCHES = 8;

interface PerMatchDebug {
  match: string;
  date: string;
  homePriorMatches: number;
  awayPriorMatches: number;
  skipped: boolean;
  skipReason?: string;
}

// ===== Shared: build OutcomeSample3 rows for a league's season, one mode =====
async function build1X2Samples(
  league: string,
  mode: BuildMode,
  seasonFilter: (season: string) => boolean
): Promise<{ samples: OutcomeSample3[]; debug: PerMatchDebug[] }> {
  const allMatches = await fetchHistoricalMatches(league);
  const matches = allMatches.filter((m) => seasonFilter(m.season) && m.ftr !== null);
  // xg_data.season is required post-migration — every xG-mode call in
  // this file (runPrimary, below) only ever targets CURRENT_XG_SEASON.
  const xgRows = mode === 'xg' ? await fetchXGData(league, CURRENT_XG_SEASON) : [];

  const goalsHistoryCache = new Map<string, ReturnType<typeof buildGoalsHistory>>();
  const xgHistoryCache = new Map<string, ReturnType<typeof buildXGHistory>>();
  const teamsInSeason = new Set<string>();
  matches.forEach((m) => { teamsInSeason.add(m.home_team); teamsInSeason.add(m.away_team); });
  for (const team of teamsInSeason) {
    // Built from `matches` (already filtered to this run's season(s))
    // rather than the team's full multi-season history — a team's prior
    // matches should only ever mean prior matches within the season
    // being scored, not bleed across a summer break. buildTeamInputs()
    // below then re-filters this to strictly-before-matchDate per call.
    goalsHistoryCache.set(team, buildGoalsHistory(matches, team));
    if (mode === 'xg') xgHistoryCache.set(team, buildXGHistory(xgRows, league, team));
  }

  const samples: OutcomeSample3[] = [];
  const debug: PerMatchDebug[] = [];
  const lg = LEAGUE_PARAMS[league];

  for (const m of matches) {
    const homeGoals = goalsHistoryCache.get(m.home_team) ?? [];
    const awayGoals = goalsHistoryCache.get(m.away_team) ?? [];
    const homeXG = xgHistoryCache.get(m.home_team) ?? [];
    const awayXG = xgHistoryCache.get(m.away_team) ?? [];

    const homeBuilt = buildTeamInputs(mode, homeGoals, homeXG, m.match_date);
    const awayBuilt = buildTeamInputs(mode, awayGoals, awayXG, m.match_date);

    const skipped = homeBuilt.matchesUsed < MIN_PRIOR_MATCHES || awayBuilt.matchesUsed < MIN_PRIOR_MATCHES;
    debug.push({
      match: `${m.home_team} vs ${m.away_team}`,
      date: m.match_date,
      homePriorMatches: homeBuilt.matchesUsed,
      awayPriorMatches: awayBuilt.matchesUsed,
      skipped,
      skipReason: skipped ? 'fewer than 8 prior matches this season' : undefined,
    });
    if (skipped) continue;

    const output = runModel(
      { home: homeBuilt.inputs, away: awayBuilt.inputs },
      { league: lg, ...CURRENT_ADVANCED_PARAMS }
    );

    const actual: 'home' | 'draw' | 'away' = m.ftr === 'H' ? 'home' : m.ftr === 'D' ? 'draw' : 'away';
    const hasClose = m.price_source !== 'missing' && m.psch !== null && m.pscd !== null && m.psca !== null;
    const sample: OutcomeSample3 = {
      modelHome: output.probHome,
      modelDraw: output.probDraw,
      modelAway: output.probAway,
      actual,
    };
    if (hasClose) {
      const dv = devig3WayLocal(m.psch!, m.pscd!, m.psca!);
      sample.closeHome = dv.a; sample.closeDraw = dv.b; sample.closeAway = dv.c;
      sample.closeOddsHome = m.psch!; sample.closeOddsDraw = m.pscd!; sample.closeOddsAway = m.psca!;
    }
    samples.push(sample);
  }

  return { samples, debug };
}

function devig3WayLocal(a: number, b: number, c: number) {
  const ra = 1 / a, rb = 1 / b, rc = 1 / c;
  const sum = ra + rb + rc;
  return { a: ra / sum, b: rb / sum, c: rc / sum };
}

function drawStats(samples: OutcomeSample3[]) {
  const n = samples.length;
  const meanPredictedDraw = n ? samples.reduce((s, x) => s + x.modelDraw, 0) / n : NaN;
  const actualDrawRate = n ? samples.filter((x) => x.actual === 'draw').length / n : NaN;
  return { n, meanPredictedDraw, actualDrawRate };
}

async function runPrimary(leagueArg: string) {
  const leagues = leagueArg === 'all' ? SUPPORTED_LEAGUES : [leagueArg];
  const results: Record<string, unknown> = {};
  for (const league of leagues) {
    const { samples, debug } = await build1X2Samples(league, 'xg', (season) => season === '2526');
    const skippedCount = debug.filter((d) => d.skipped).length;
    results[league] = {
      mode: 'xg',
      season: '2526',
      matchesConsidered: debug.length,
      matchesSkippedUnder8: skippedCount,
      samplesUsed: samples.length,
      samplesWithClosingOdds: samples.filter((s) => s.closeHome !== undefined).length,
      modelScore: score1X2(samples, 'model'),
      closeScore: score1X2(samples, 'close'),
      drawStats: drawStats(samples),
      calibrationHome: calibrationTable(samples.map((s) => s.modelHome), samples.map((s) => s.actual === 'home')),
      calibrationDraw: calibrationTable(samples.map((s) => s.modelDraw), samples.map((s) => s.actual === 'draw')),
      calibrationAway: calibrationTable(samples.map((s) => s.modelAway), samples.map((s) => s.actual === 'away')),
      sampleSizeVsTarget: { target: 500, actual: samples.length, meetsTarget: samples.length >= 500 },
    };
  }
  console.log(JSON.stringify({ run: 'primary', results }, null, 2));
}

async function runSecondary(leagueArg: string) {
  const league = leagueArg === 'all' ? 'soccer_epl' : leagueArg;
  if (league !== 'soccer_epl') {
    console.error('secondary run is EPL-only per Decision 2 — ignoring --league value, using soccer_epl');
  }
  const { samples, debug } = await build1X2Samples('soccer_epl', 'fallback', (season) => season !== '2526');
  const skippedCount = debug.filter((d) => d.skipped).length;
  const result = {
    mode: 'FALLBACK MODE (goals-based, no xG)',
    league: 'soccer_epl',
    seasons: ['2122', '2223', '2324', '2425'],
    matchesConsidered: debug.length,
    matchesSkippedUnder8: skippedCount,
    samplesUsed: samples.length,
    samplesWithClosingOdds: samples.filter((s) => s.closeHome !== undefined).length,
    modelScore: score1X2(samples, 'model'),
    closeScore: score1X2(samples, 'close'),
    drawStats: drawStats(samples),
    calibrationHome: calibrationTable(samples.map((s) => s.modelHome), samples.map((s) => s.actual === 'home')),
    calibrationDraw: calibrationTable(samples.map((s) => s.modelDraw), samples.map((s) => s.actual === 'draw')),
    calibrationAway: calibrationTable(samples.map((s) => s.modelAway), samples.map((s) => s.actual === 'away')),
    sampleSizeVsTarget: { target: 500, actual: samples.length, meetsTarget: samples.length >= 500 },
  };
  console.log(JSON.stringify({ run: 'secondary', result }, null, 2));
}

// ===== AH / TOTALS / CLV run =====
interface JoinFailure {
  home_team: string;
  away_team: string;
  kickoff_time: string;
  reason: string;
}

async function runAhTotals(leagueArg: string) {
  const leagues = leagueArg === 'all' ? SUPPORTED_LEAGUES : [leagueArg];
  const results: Record<string, unknown> = {};

  for (const league of leagues) {
    const closingRows = await fetchClosingLines(league);
    const historicalRows = await fetchHistoricalMatches(league);
    const xgRows = await fetchXGData(league, CURRENT_XG_SEASON);

    // Group closing_lines by match_id (each match has up to 3 rows: 1x2, asian_handicap, totals).
    const byMatch = new Map<string, ClosingLineRow[]>();
    for (const r of closingRows) {
      if (!byMatch.has(r.match_id)) byMatch.set(r.match_id, []);
      byMatch.get(r.match_id)!.push(r);
    }

    const goalsHistoryCache = new Map<string, ReturnType<typeof buildGoalsHistory>>();
    const xgHistoryCache = new Map<string, ReturnType<typeof buildXGHistory>>();
    const teams = new Set<string>();
    historicalRows.forEach((m) => { teams.add(m.home_team); teams.add(m.away_team); });
    for (const team of teams) {
      goalsHistoryCache.set(team, buildGoalsHistory(historicalRows, team));
      xgHistoryCache.set(team, buildXGHistory(xgRows, league, team));
    }

    const joinFailures: JoinFailure[] = [];
    let joinAttempts = 0;
    let joinSuccesses = 0;

    const samples1x2: OutcomeSample3[] = [];
    const samplesTotals25: OutcomeSample2[] = [];
    const ahCLVInputs: { edge: number; won: boolean; odds: number }[] = [];

    for (const [matchId, rows] of byMatch) {
      joinAttempts++;
      const rep = rows[0];
      const kickoffDate = rep.kickoff_time.slice(0, 10); // YYYY-MM-DD
      const hist = historicalRows.find(
        (h) => h.home_team === rep.home_team && h.away_team === rep.away_team &&
               h.match_date === kickoffDate && h.ftr !== null
      );
      if (!hist) {
        joinFailures.push({
          home_team: rep.home_team, away_team: rep.away_team, kickoff_time: rep.kickoff_time,
          reason: 'no matching finished historical_matches row on (league, home, away, same calendar date)',
        });
        continue;
      }
      joinSuccesses++;

      const homeGoals = goalsHistoryCache.get(rep.home_team) ?? [];
      const awayGoals = goalsHistoryCache.get(rep.away_team) ?? [];
      const homeXG = xgHistoryCache.get(rep.home_team) ?? [];
      const awayXG = xgHistoryCache.get(rep.away_team) ?? [];
      const homeBuilt = buildTeamInputs('xg', homeGoals, homeXG, kickoffDate);
      const awayBuilt = buildTeamInputs('xg', awayGoals, awayXG, kickoffDate);
      if (homeBuilt.matchesUsed < MIN_PRIOR_MATCHES || awayBuilt.matchesUsed < MIN_PRIOR_MATCHES) continue;

      const lg = LEAGUE_PARAMS[league];
      const output = runModel(
        { home: homeBuilt.inputs, away: awayBuilt.inputs },
        { league: lg, ...CURRENT_ADVANCED_PARAMS }
      );
      const actual: 'home' | 'draw' | 'away' = hist.ftr === 'H' ? 'home' : hist.ftr === 'D' ? 'draw' : 'away';

      const oneX2Row = rows.find((r) => r.market_type === '1x2');
      if (oneX2Row && oneX2Row.close_home && oneX2Row.close_draw && oneX2Row.close_away) {
        const dv = devig3WayLocal(oneX2Row.close_home, oneX2Row.close_draw, oneX2Row.close_away);
        samples1x2.push({
          modelHome: output.probHome, modelDraw: output.probDraw, modelAway: output.probAway, actual,
          closeHome: dv.a, closeDraw: dv.b, closeAway: dv.c,
          closeOddsHome: oneX2Row.close_home, closeOddsDraw: oneX2Row.close_draw, closeOddsAway: oneX2Row.close_away,
        });
      }

      const totalsRow = rows.find((r) => r.market_type === 'totals');
      if (totalsRow && totalsRow.close_line === 2.5 && totalsRow.close_over_price && totalsRow.close_under_price) {
        const modelLine = output.totalsRows.find((r) => r.line === 2.5);
        if (modelLine) {
          const totalGoals = (hist.fthg ?? 0) + (hist.ftag ?? 0);
          const dv = devig2WayLocal(totalsRow.close_over_price, totalsRow.close_under_price);
          samplesTotals25.push({
            modelA: modelLine.overProb, modelB: modelLine.underProb, actualIsA: totalGoals > 2.5,
            closeA: dv.a, closeB: dv.b,
            closeOddsA: totalsRow.close_over_price, closeOddsB: totalsRow.close_under_price,
          });
        }
      }

      const ahRow = rows.find((r) => r.market_type === 'asian_handicap');
      if (ahRow && ahRow.close_line !== null && ahRow.close_home_price && ahRow.close_away_price) {
        const modelLine = output.ahRows.find((r) => r.line === ahRow.close_line);
        if (modelLine) {
          const dv = devig2WayLocal(ahRow.close_home_price, ahRow.close_away_price);
          const d = (hist.fthg ?? 0) - (hist.ftag ?? 0);
          const x = d + ahRow.close_line;
          // Push results are excluded from the CLV bet simulation (no
          // stake resolution either way) — only clear cover/not-cover.
          if (x !== 0) {
            const homeWon = x > 0;
            const homeEdge = modelLine.homeProb - dv.a;
            const awayEdge = modelLine.awayProb - dv.b;
            const best = homeEdge > awayEdge
              ? { edge: homeEdge, odds: ahRow.close_home_price, won: homeWon }
              : { edge: awayEdge, odds: ahRow.close_away_price, won: !homeWon };
            ahCLVInputs.push(best);
          }
        }
      }
    }

    const ahCLV = summarizeAhClv(ahCLVInputs);
    const joinRate = joinAttempts ? joinSuccesses / joinAttempts : NaN;

    results[league] = {
      joinAttempts,
      joinSuccesses,
      joinSuccessRate: joinRate,
      joinFailureSamples: joinRate < 0.9 ? joinFailures.slice(0, 5) : [],
      oneX2: {
        n: samples1x2.length,
        modelScore: score1X2(samples1x2, 'model'),
        closeScore: score1X2(samples1x2, 'close'),
        clv: clvProxy1X2(samples1x2),
      },
      totals25: {
        n: samplesTotals25.length,
        modelScore: score2Way(samplesTotals25, 'model'),
        closeScore: score2Way(samplesTotals25, 'close'),
        clv: clvProxy2Way(samplesTotals25),
      },
      asianHandicapCLV: ahCLV,
      sampleSizeVsTarget: { target: 500, actual: samples1x2.length, meetsTarget: samples1x2.length >= 500 },
    };
  }

  console.log(JSON.stringify({ run: 'ahtotals', results }, null, 2));
}

function devig2WayLocal(a: number, b: number) {
  const ra = 1 / a, rb = 1 / b;
  const sum = ra + rb;
  return { a: ra / sum, b: rb / sum };
}

function summarizeAhClv(rows: { edge: number; won: boolean; odds: number }[]) {
  const n = rows.length;
  const meanEdge = n ? rows.reduce((s, r) => s + r.edge, 0) / n : NaN;
  const bets = rows.filter((r) => r.edge > 0.02);
  const pl = bets.reduce((s, r) => s + (r.won ? r.odds - 1 : -1), 0);
  return { n, meanEdge, betsPlaced: bets.length, flatStakePL: pl, roiPercent: bets.length ? (pl / bets.length) * 100 : NaN };
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const leagueArg = (rest.find((a) => a.startsWith('--league='))?.split('=')[1]) ?? 'all';

  try {
    if (cmd === 'primary') await runPrimary(leagueArg);
    else if (cmd === 'secondary') await runSecondary(leagueArg);
    else if (cmd === 'ahtotals') await runAhTotals(leagueArg);
    else {
      console.error('Usage: npx tsx backtest.ts <primary|secondary|ahtotals> [--league=<sport_key>|all]');
      process.exitCode = 2;
    }
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
