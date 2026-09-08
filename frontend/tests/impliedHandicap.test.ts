import assert from 'node:assert/strict';
import { test } from 'node:test';
import { impliedGoalGap, impliedHandicapHistory } from '../src/utils/impliedHandicap';
import { impliedExpectedGoals } from '../src/utils/impliedTotal';
import { filterByTimeFrame } from '../src/components/TimeFrameFilter';

// Independent forward reference: enumerate actual scorelines and settle each
// half-stake separately. The implementation uses marginal CDFs and inversion.
function referenceOdds(home: number, away: number, line: number, market: 'ah' | 'total', margin = .01) {
  const pmf = (mean: number) => {
    let p = Math.exp(-mean); const rows = [p];
    for (let i = 1; i <= 40; i++) { p *= mean / i; rows.push(p); }
    return rows;
  };
  const h = pmf(home), a = pmf(away);
  const legs = Number.isInteger(line * 2) ? [line] : [line - .25, line + .25];
  let win = 0, lose = 0;
  for (let i = 0; i < h.length; i++) for (let j = 0; j < a.length; j++) {
    for (const leg of legs) {
      const settled = market === 'ah' ? i - j + leg : i + j - leg;
      if (settled > 0) win += h[i] * a[j] / legs.length;
      if (settled < 0) lose += h[i] * a[j] / legs.length;
    }
  }
  return [(win + lose) / win / (1 + margin), (win + lose) / lose / (1 + margin)];
}
const close = (actual: number | null, expected: number) => {
  assert.notEqual(actual, null); assert.ok(Math.abs(actual! - expected) < 1e-7, `${actual} != ${expected}`);
};

test('equivalent contracts give the same advantage across whole, half and quarter lines', () => {
  for (const line of [-2, -1.75, -1.5, -1.25, -1, -.75, -.5, -.25, 0, .25, .5, .75, 1, 1.25, 1.5, 1.75, 2]) {
    const [h, a] = referenceOdds(1.6, 1.2, line, 'ah');
    close(impliedGoalGap(line, h, a, 2.8), .4);
  }
});

test('totals line shifts and margin changes do not create a strength move', () => {
  for (const totalLine of [2, 2.25, 2.5, 2.75, 3, 3.25, 3.5]) {
    const [over, under] = referenceOdds(1.6, 1.2, totalLine, 'total', .02);
    const total = impliedExpectedGoals(totalLine, over, under);
    close(total, 2.8);
    for (const ah of [0, .25, -.75]) {
      const [h, a] = referenceOdds(1.6, 1.2, ah, 'ah', .015);
      close(impliedGoalGap(ah, h, a, total), .4);
    }
  }
});

test('changing the goal environment with a fixed gap preserves that gap', () => {
  for (const total of [1.2, 2.8, 4.4, 7]) {
    const [h, a] = referenceOdds((total + .3) / 2, (total - .3) / 2, -.25, 'ah');
    close(impliedGoalGap(-.25, h, a, total), .3);
  }
});

test('swapping team orientation reverses the gap and shorter home prices lift it', () => {
  const [h, a] = referenceOdds(1.6, 1.2, -.25, 'ah');
  close(impliedGoalGap(.25, a, h, 2.8), -.4);
  assert.ok(impliedGoalGap(0, 1.86, 2.05, 2.82)! > impliedGoalGap(0, 2.09, 1.78, 2.82)!);
  close(impliedGoalGap(0, 1.95, 1.95, 2.8), 0);
  close(impliedGoalGap(.00000001, 1.95, 1.95, 2.8), 0);
});

test('invalid, unsupported or infeasible prices stay missing rather than clamping', () => {
  for (const values of [[0, 1, 2, 2.8], [0, NaN, 2, 2.8], [.1, 2, 2, 2.8], [0, 2, Infinity, 2.8], [0, 2, 2, null], [0, 2, 2, 10], [8, 20, 1.5, .1]] as const) {
    assert.equal(impliedGoalGap(...values), null);
  }
  for (const values of [[2.6, 2, 2], [2.5, NaN, 2], [2.5, 2, Infinity], [10, 1.001, 100]] as const) assert.equal(impliedExpectedGoals(...values), null);
});

const ah = (timestamp: string) => ({ timestamp, line: 0, home_odds: 2.09, away_odds: 1.78 });
const total = (timestamp: string) => ({ timestamp, line: 2.75, over_odds: 2.01, under_odds: 1.83 });

test('pairing uses earlier totals only and enforces the 30-minute observation limit', () => {
  const spread = ah('2026-09-08T12:00:00Z');
  assert.equal(impliedHandicapHistory([spread], [total('2026-09-08T12:00:01Z')])[0].homeGap, null);
  assert.equal(impliedHandicapHistory([spread], [total('2026-09-08T11:29:59Z')])[0].homeGap, null);
  assert.notEqual(impliedHandicapHistory([spread], [total('2026-09-08T11:30:00Z')])[0].homeGap, null);
  const invalid = { ...total('2026-09-08T11:59:00Z'), over_odds: null };
  assert.equal(impliedHandicapHistory([spread], [total('2026-09-08T11:58:00Z'), invalid])[0].homeGap, null);
});

test('same-fetch totals use the first supplied line and UTC timestamps are equivalent', () => {
  const t = total('2026-09-08T12:00:00');
  const rows = impliedHandicapHistory([ah('2026-09-08T12:00:00Z')], [t, { ...t, line: 4.5 }]);
  close(rows[0].totalGoals, impliedExpectedGoals(t.line, t.over_odds, t.under_odds)!);
  assert.equal(rows[0].totalTimestamp, '2026-09-08T12:00:00.000Z');
});

test('data gaps remain null and a display window can use an earlier paired total', () => {
  const rows = impliedHandicapHistory([ah('2026-09-08T10:00:00Z'), ah('2026-09-08T12:00:00Z')],
    [total('2026-09-08T09:59:00Z'), total('2026-09-08T11:59:00Z')]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].homeGap, null);
  assert.notEqual(filterByTimeFrame(rows, '1h')[0].homeGap, null);
});

test('an invalid handicap observation is a gap, not removed from the curve', () => {
  const spreads = [ah('2026-09-08T12:00:00Z'), { ...ah('2026-09-08T12:01:00Z'), line: NaN }, ah('2026-09-08T12:02:00Z')];
  const rows = impliedHandicapHistory(spreads, [total('2026-09-08T11:59:00Z')]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].homeGap, null);
  assert.notEqual(rows[0].homeGap, null);
  assert.notEqual(rows[2].homeGap, null);
});
