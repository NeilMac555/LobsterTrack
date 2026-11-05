import { demo, demoInputs, demoParams } from '../model/proDemo';
import { runModel } from '../model/valorModel';

const home = demoInputs('home');
const away = demoInputs('away');
const result = runModel({ home, away }, demoParams);
const close = demo.odds.at(-1)!;
const outcomes = [
  { label: demo.match.home, probability: result.probHome, market: close.home_odds },
  { label: 'Draw', probability: result.probDraw, market: close.draw_odds },
  { label: demo.match.away, probability: result.probAway, market: close.away_odds },
];

export default function WorkedPredictorExample() {
  return <section className="mb-6 rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 sm:p-5" aria-labelledby="worked-fixture">
    <h2 id="worked-fixture" className="font-bold text-lg">Worked example · Arsenal vs Leeds United</h2>
    <p className="text-sm text-slate-300 mb-3">Premier League, 10 October 2026. Using the last 20 league games at all venues, Arsenal averaged {home.xgFor.toFixed(2)} xG for and {home.xgAgainst.toFixed(2)} against. Leeds averaged {away.xgFor.toFixed(2)} for and {away.xgAgainst.toFixed(2)} against.</p>
    <p className="text-sm mb-3">The model projects <strong>{result.lambdaHome.toFixed(2)} goals for Arsenal</strong> and <strong>{result.lambdaAway.toFixed(2)} for Leeds</strong>.</p>
    <table className="w-full max-w-2xl text-sm tabular-nums text-right">
      <thead className="text-slate-400"><tr><th scope="col" className="text-left">Outcome</th><th scope="col">Model chance</th><th scope="col">Fair odds</th><th scope="col">Pinnacle close</th></tr></thead>
      <tbody>{outcomes.map(row => <tr key={row.label} className="border-t border-slate-700/60">
        <th scope="row" className="py-1.5 text-left">{row.label}</th><td>{(row.probability * 100).toFixed(1)}%</td><td>{(1 / row.probability).toFixed(2)}</td><td>{row.market.toFixed(2)}</td>
      </tr>)}</tbody>
    </table>
    <p className="mt-3 text-xs text-slate-400">Historical reconstruction using pre-match Understat figures, the 3 October league baseline and no absence adjustment. Pinnacle’s last recorded price was at {close.timestamp.slice(11, 19)} UTC, before the 11:30 kickoff. Fair odds exclude a bookmaker margin.</p>
    <p className="mt-2 text-sm text-cyan-300"><a href="/pro/demo?tool=model">Try the team-news scenario</a> · <a href="/tools/form-lab">Find a 20-match sample</a> · <a href={'/match/' + demo.match.id}>See the price history</a></p>
  </section>;
}
