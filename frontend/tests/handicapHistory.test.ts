import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SpreadsPoint } from '../src/types';
import { handicapView, orderedHandicaps, formatHandicap, handicapLines } from '../src/utils/handicapHistory';
import { filterByTimeFrame } from '../src/components/TimeFrameFilter';

const point = (hour: number, line: number, home_odds: number | null, away_odds: number | null): SpreadsPoint => ({ timestamp: `2026-09-08T${String(hour).padStart(2, '0')}:00:00`, line, home_odds, away_odds });
const history = orderedHandicaps([point(0, 0, 2.09, 1.78), point(2, 0, 1.98, 1.88), point(4, .25, 1.81, 2.06), point(8, .25, 1.8, 2.07), point(10, 0, 2.1, 1.78), point(12, 0, 1.86, 2.05)]);

test('0 / +0.25 / 0 compares matching prices, with a genuine gap', () => {
  const view = handicapView(history, 0);
  assert.equal(view.direction, 'home');
  assert.equal(view.first?.home_odds, 2.09);
  assert.equal(view.last?.home_odds, 1.86);
  assert.ok(Math.abs(view.changes[0]! + 11.0047847) < .00001);
  assert.deepEqual(view.chart.map(p => p.home_odds), [2.09, 1.98, null, null, 2.1, 1.86]);
  assert.equal(view.chart.length, history.length);
});

test('another line uses its own endpoints and retains historical dates', () => {
  const view = handicapView(history, .25);
  assert.equal(view.first?.home_odds, 1.81);
  assert.equal(view.last?.home_odds, 1.8);
  assert.equal(view.last?.timestamp, '2026-09-08T08:00:00.000Z');
  assert.deepEqual(view.chart.map(p => p.away_odds), [null, null, 2.06, 2.07, null, null]);
});

test('a new line cannot claim a trend from the previous line', () => {
  const view = handicapView(orderedHandicaps([point(0, 0, 2.09, 1.78), point(1, .25, 1.8, 2.1)]), .25);
  assert.equal(view.direction, 'insufficient');
  assert.deepEqual(view.changes, [null, null]);
});

test('time windows affect the summary and chart together', () => {
  const recent = filterByTimeFrame(history, '2h');
  assert.equal(handicapView(recent, 0).first?.home_odds, 2.1);
  assert.equal(handicapView(recent, .25).count, 0);
  assert.equal(handicapView(recent, .25).direction, 'insufficient');
});

test('missing final quotes are not replaced with older prices', () => {
  const view = handicapView(orderedHandicaps([point(1, 0, 2, 2), point(2, 0, null, 1.8)]), 0);
  assert.equal(view.last?.home_odds, null);
  assert.equal(view.changes[0], null);
  assert.equal(view.direction, 'insufficient');
});

test('both prices shortening does not name a supported team', () => {
  const view = handicapView(orderedHandicaps([point(1, 0, 2, 2), point(2, 0, 1.9, 1.9)]), 0);
  assert.equal(view.direction, 'mixed');
});

test('away shortening and unchanged prices are distinguished', () => {
  assert.equal(handicapView(orderedHandicaps([point(1, -.25, 1.9, 2), point(2, -.25, 2, 1.9)]), -.25).direction, 'away');
  assert.equal(handicapView(orderedHandicaps([point(1, 0, 2, 2), point(2, 0, 2, 2)]), 0).direction, 'unchanged');
});

test('timestamps are UTC, ordered and invalid values cannot create trends', () => {
  const rows = orderedHandicaps([point(4, 0, 2, 2), point(1, 0, Infinity, 1), { ...point(2, 0, 2, 2), timestamp: 'invalid' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].timestamp, '2026-09-08T01:00:00.000Z');
  assert.equal(rows[0].home_odds, null);
  assert.equal(rows[0].away_odds, null);
  assert.deepEqual(handicapLines(history), [0, .25]);
  assert.equal(formatHandicap(-0), '0');
  assert.equal(formatHandicap(-.25), '-0.25');
  assert.equal(formatHandicap(.25), '+0.25');
});
