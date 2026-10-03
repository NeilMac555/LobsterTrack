// Numerical invariants for the responsive baseline, using the real TS core.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const file = path.join(__dirname, '../src/model/valorModel.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(code, context);
const { runModel } = context.exports;
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`);
function predict(goalRate, xg, penalty, formWeight, ratio=1.2, referenceGoals=goalRate) {
  const team = { goalsAgainst: referenceGoals, xgFor: xg, xgAgainst: xg,
    matchesPlayed: 20, penaltiesReceived: penalty / .76 * 20,
    penaltiesConceded: penalty / .76 * 20, shotsFor: 0, shotsAgainst: 0,
    openPlayXG: 0, setPieceXG: 0, last6XGFor: xg, last6XGAgainst: xg, absence: 1 };
  return runModel({home: team, away: team}, {
    league: {avgGoals: referenceGoals, avgXG: xg, avgPenaltyXG: penalty,
      avgGoalsPerTeam: goalRate, homeAwayRatio: ratio, avgShotsPerGame: 13},
    formWeight, qualityWeight: 0, drawInflation: 1.08, rho: -.03,
    spDiscount: .85, absenceWeight: .03,
  });
}
for (const weight of [0, .25, .5, 1]) {
  for (const penalty of [0, .1, .3]) {
    const result = predict(1.5, 1.7, penalty, weight);
    near(result.lambdaHome + result.lambdaAway, 3);
    near(result.lambdaHome / result.lambdaAway, 1.2);
    near(result.probHome + result.probDraw + result.probAway, 1);
  }
}
// A 20% league-wide increase should enter once, not through both team
// strengths and an additional tempo multiplier.
const before = predict(1.25, 1.4, .12, .25);
const after = predict(1.5, 1.68, .144, .25);
near(after.lambdaHome / before.lambdaHome, 1.2);
near(after.lambdaAway / before.lambdaAway, 1.2);
// A changed current season is only partly included in the scoring forecast,
// but team inputs must use current-season references, not smoothed ones.
const blended = predict(4/3, 2, .1, .25, 1.2, 2);
near(blended.lambdaHome + blended.lambdaAway, 8/3);
console.log('Passed: average-team anchoring, penalty/form consistency, venue ratio, and single-count scoring changes.');
