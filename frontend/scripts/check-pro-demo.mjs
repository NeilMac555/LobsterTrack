import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  stdin: { contents: `export * from './src/model/proDemo'; export { runModel } from './src/model/valorModel';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { demo, selectForm, formSummary, demoInputs, demoParams, rollingXG, runModel } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} vs ${b}`);
const cutoff = Date.parse(demo.match.kickoff);
for (const side of ['home', 'away']) {
  for (const collection of [demo.form[side], demo.xg[side]]) {
    assert.equal(new Set(collection.map(row => row.id)).size, collection.length, 'No duplicated match rows');
    assert.ok(collection.every((row, i) => Date.parse(row.date) < cutoff && (i === 0 || collection[i - 1].date < row.date)), 'Chronological pre-match data only');
  }
  for (const venue of ['all', 'home', 'away']) {
    for (const n of [5, 10, 20]) {
      const sample = selectForm(side, n, venue);
      assert.equal(sample.length, n, 'Enough actual matches in every offered sample');
      assert.ok(sample.every(row => venue === 'all' || row.venue === venue));
      const summary = formSummary(sample);
      assert.equal(summary.wins + summary.draws + summary.losses, n);
    }
  }
  const input = demoInputs(side);
  assert.equal(input.matchesPlayed, 20);
  const rows = demo.xg[side].slice(-20);
  const rawPenaltyXG = rows.reduce((sum, row) => sum + row.xgf - row.npxgf, 0) / 20;
  near(input.penaltiesReceived / 20 * .76, rawPenaltyXG, 'Penalty-equivalent conversion');
  for (const window of [5, 10]) {
    const trend = rollingXG(side, window);
    assert.equal(trend.length, 20);
    assert.ok(trend.every(row => row.sampleSize === window), 'No partial rolling windows');
    near(trend.at(-1).for, rows.slice(-window).reduce((s, r) => s + r.npxgf, 0) / window, 'Rolling endpoint');
  }
}
assert.ok(Date.parse(demo.provenance.baselineComputedAt) < cutoff, 'Baseline predates kickoff');
assert.ok(demo.odds.every((row, i) => Date.parse(row.timestamp) < cutoff && [row.home_odds, row.draw_odds, row.away_odds].every(v => Number.isFinite(v) && v > 1) && (i === 0 || demo.odds[i - 1].timestamp <= row.timestamp)));
assert.equal(demo.odds[0].home_odds, 1.30);
assert.equal(demo.odds.at(-1).home_odds, 1.47);
// Missing xG cannot silently dilute averages.
const incomplete = formSummary([{ ...demo.form.home[0], npxgf: null, npxga: null }, { ...demo.form.home[1], npxgf: 2, npxga: 1 }]);
assert.equal(incomplete.played, 2);
assert.equal(incomplete.xgCoverage, 1);
assert.equal(incomplete.xgFor, 2);

const baseline = runModel({ home: demoInputs('home'), away: demoInputs('away') }, demoParams);
for (const home of [1, 3, 5]) for (const away of [1, 3, 5]) {
  const out = runModel({ home: demoInputs('home', home), away: demoInputs('away', away) }, demoParams);
  near(out.probHome + out.probDraw + out.probAway, 1, '1X2 normalized');
  near(out.bttsYesProb + out.bttsNoProb, 1, 'BTTS normalized');
  assert.ok(out.marketMatrix.flat().every(p => Number.isFinite(p) && p >= 0));
  near(out.marketMatrix.flat().reduce((a, b) => a + b, 0), 1, 'Scoreline matrix normalized');
  assert.ok(out.totalsRows.every(row => row.overOdds > 1 && row.underOdds > 1));
  if (home > 1 && away === 1) assert.ok(out.probHome < baseline.probHome, 'Home absences weaken home probability');
  if (away > 1 && home === 1) assert.ok(out.probAway < baseline.probAway, 'Away absences weaken away probability');
}
// Verify quarter handicap fair odds directly from split-leg settlement,
// independent of the display adapter and the model's handicap implementation.
for (const line of [-1.75, -1.25, -.75]) {
  let win = 0, loss = 0;
  for (let h = 0; h < baseline.marketMatrix.length; h++) for (let a = 0; a < baseline.marketMatrix[h].length; a++) {
    const p = baseline.marketMatrix[h][a];
    for (const leg of [line - .25, line + .25]) {
      if (h - a + leg > 0) win += p / 2;
      if (h - a + leg < 0) loss += p / 2;
    }
  }
  near(baseline.ahRows.find(row => row.line === line).homeOdds, 1 + loss / win, 'Quarter handicap settlement');
}
const routes = JSON.parse(readFileSync(resolve(root, 'src/routes.json')));
assert.ok(routes.public.includes('pro/demo'));
const html = readFileSync(resolve(root, 'dist/pro/demo/index.html'), 'utf8');
assert.ok(html.includes('https://www.steamwatch.io/pro/demo') && html.includes('Find your next angle.'));
const cards = JSON.parse(readFileSync(resolve(root, 'src/data/proDemoCards.json')));
for (const report of [cards.steam, cards.drift]) for (const row of report.rows) {
  assert.equal(row.wins + row.draws + row.losses, row.total_moves, 'Movement record sums');
  assert.ok(Math.abs(row.win_rate - row.wins / row.total_moves * 100) < .051, 'Movement win rate');
}
for (const team of cards.bias) for (const row of [team.as_favourite, team.as_underdog]) {
  assert.equal(row.wins + row.draws + row.losses, row.matches);
  assert.ok(Math.abs(row.back_roi_pct - row.back_pl / row.matches * 100) < .06, 'Bias ROI uses stated stakes');
}
near(cards.pnl.back.home.pl + cards.pnl.back.away.pl, cards.pnl.back.overall.pl, 'Venue P/L reconciles');
near(cards.goals.row.goals - cards.goals.row.xg, cards.goals.row.gap, 'Goals shortfall reconciles');
assert.ok(Date.parse(cards.closing.captured_at) < Date.parse(cards.closing.kickoff_time));
assert.equal(cards.managers.rows.length, 3, 'Only public manager preview included');
console.log('PASS: frozen data chronology, 18 form filters, missing-data handling, rolling windows, 9 model scenarios, handicap settlements and public prerender.');
console.log(JSON.stringify({ baseline: { home: 1 / baseline.probHome, draw: 1 / baseline.probDraw, away: 1 / baseline.probAway }, form20: ['home', 'away'].map(side => ({ team: demo.match[side], ...formSummary(selectForm(side, 20, 'all')) })) }, null, 2));
