import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeChartData } from '../src/utils/rollingXg.ts';

const matches = Array.from({ length: 12 }, (_, i) => ({
  team_name: 'Away', league: 'soccer_epl', season: i < 8 ? '2526' : '2627',
  match_number: i < 8 ? i + 1 : i - 7, match_date: String(i), xg_for: i, xg_against: 0,
}));

test('five and ten match windows carry across seasons by actual match position', () => {
  const five = computeChartData(matches, 5, '2627');
  assert.equal(five.find(p => p.label === '1')?.rollingFor, 6);
  assert.equal(five.at(-1)?.rollingFor, 9);
  const ten = computeChartData(matches, 10, '2627');
  assert.equal(ten.at(-1)?.rollingFor, 6.5);
  assert.equal(ten.at(-1)?.rollingAgainst, 0);
  assert.deepEqual(computeChartData(matches.slice(0, 4), 5, '2627'), []);
});

test('missing opponent xG blanks the whole window without substituting zero or skipping games', () => {
  const data = matches.map((r, i) => i === 5 ? { ...r, xg_against: null } : r);
  const series = computeChartData(data, 5, '2627');
  assert.deepEqual(series.map(p => p.rollingFor), [2,null,null,null,null,null,8,9]);
  assert.equal(series[1].trendFor, null);
  assert.equal(series.at(-1)?.rollingAgainst, 0);
});
