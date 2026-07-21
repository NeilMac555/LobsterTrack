import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  americanToDecimal,
  availableBetTypes,
  betTypeLabel,
  calculateBet,
  decimalToAmerican,
  decimalToFraction,
  fractionToDecimal,
  type BetType,
  type OddsFormat,
  type Outcome,
  type StakeMode,
} from '../utils/betCalculator';

interface SelectionRow {
  id: string;
  outcome: Outcome;
  decimalStr: string;
  fractionNum: string;
  fractionDen: string;
  americanStr: string;
}

function fromDecimal(decimal: number): Pick<SelectionRow, 'decimalStr' | 'fractionNum' | 'fractionDen' | 'americanStr'> {
  const { numerator, denominator } = decimalToFraction(decimal);
  const american = decimalToAmerican(decimal);
  return {
    decimalStr: decimal.toFixed(2),
    fractionNum: String(numerator),
    fractionDen: String(denominator),
    americanStr: american >= 0 ? `+${american}` : String(american),
  };
}

function makeRow(id: string, decimal = 2.0): SelectionRow {
  return { id, outcome: 'won', ...fromDecimal(decimal) };
}

const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'void', label: 'Void' },
];

export default function BetCalculatorPage() {
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>('decimal');
  const [numSelections, setNumSelections] = useState(2);
  const [betType, setBetType] = useState<BetType>('double');
  const [stakeMode, setStakeMode] = useState<StakeMode>('perBet');
  const [stake, setStake] = useState('10');
  const [rows, setRows] = useState<SelectionRow[]>([makeRow('sel-0'), makeRow('sel-1')]);

  const betTypeOptions = availableBetTypes(numSelections);

  const handleNumSelectionsChange = (n: number) => {
    setNumSelections(n);
    setRows((prev) => {
      if (n > prev.length) {
        const additions = Array.from({ length: n - prev.length }, (_, i) => makeRow(`sel-${prev.length + i}`));
        return [...prev, ...additions];
      }
      return prev.slice(0, n);
    });
    const validTypes = availableBetTypes(n);
    if (!validTypes.includes(betType)) setBetType('single');
  };

  const updateRow = (id: string, patch: Partial<SelectionRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleDecimalChange = (id: string, value: string) => {
    const decimal = parseFloat(value);
    if (isFinite(decimal) && decimal >= 1.01) {
      const { decimalStr: _ignored, ...rest } = fromDecimal(decimal);
      updateRow(id, { decimalStr: value, ...rest });
    } else {
      updateRow(id, { decimalStr: value });
    }
  };

  const handleFractionChange = (id: string, part: 'num' | 'den', value: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const num = parseFloat(part === 'num' ? value : row.fractionNum);
    const den = parseFloat(part === 'den' ? value : row.fractionDen);
    const patch: Partial<SelectionRow> = part === 'num' ? { fractionNum: value } : { fractionDen: value };
    if (isFinite(num) && isFinite(den) && num >= 0 && den > 0) {
      const decimal = fractionToDecimal(num, den);
      const american = decimalToAmerican(decimal);
      updateRow(id, {
        ...patch,
        decimalStr: decimal.toFixed(2),
        americanStr: american >= 0 ? `+${american}` : String(american),
      });
    } else {
      updateRow(id, patch);
    }
  };

  const handleAmericanChange = (id: string, value: string) => {
    const american = parseInt(value.replace(/^\+/, ''), 10);
    if (isFinite(american) && american !== 0 && Math.abs(american) >= 100) {
      const decimal = americanToDecimal(american);
      const { numerator, denominator } = decimalToFraction(decimal);
      updateRow(id, {
        americanStr: value,
        decimalStr: decimal.toFixed(2),
        fractionNum: String(numerator),
        fractionDen: String(denominator),
      });
    } else {
      updateRow(id, { americanStr: value });
    }
  };

  const result = useMemo(() => {
    const stakeNum = parseFloat(stake);
    const selections = rows.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      oddsDecimal: parseFloat(r.decimalStr),
    }));
    return calculateBet({ betType, selections, stake: stakeNum, stakeMode });
  }, [rows, betType, stake, stakeMode]);

  const handleReset = () => {
    setOddsFormat('decimal');
    setNumSelections(2);
    setBetType('double');
    setStakeMode('perBet');
    setStake('10');
    setRows([makeRow('sel-0'), makeRow('sel-1')]);
  };

  const formatCurrency = (value: number): string => {
    return value >= 0 ? `+$${value.toFixed(2)}` : `-$${Math.abs(value).toFixed(2)}`;
  };

  const inputClass =
    'w-full bg-slate-900/50 border border-slate-600 rounded-lg px-2.5 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors';
  const selectClass =
    'w-full bg-slate-900/50 border border-slate-600 rounded-lg px-2.5 py-2 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors';

  return (
    <div className="max-w-3xl mx-auto">
      <Helmet>
        <title>Bet Calculator — SteamWatch</title>
        <meta name="description" content="Calculate returns for singles, doubles, trebles and accumulators in fraction, decimal or American odds." />
        <meta property="og:title" content="Bet Calculator — SteamWatch" />
        <meta property="og:description" content="Calculate returns for singles, doubles, trebles and accumulators in fraction, decimal or American odds." />
        <meta property="og:url" content="https://www.steamwatch.io/tools/bet-calculator" />
        <link rel="canonical" href="https://www.steamwatch.io/tools/bet-calculator" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "Bet Calculator",
          "url": "https://www.steamwatch.io/tools/bet-calculator",
          "description": "Calculate returns for singles, doubles, trebles and accumulators in fraction, decimal or American odds",
          "applicationCategory": "FinanceApplication",
          "operatingSystem": "Web",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR" }
        })}</script>
      </Helmet>

      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Bet Calculator</h1>
        <p className="text-slate-400 text-sm sm:text-base">
          Work out returns for singles, doubles, trebles and accumulators — fraction, decimal or American odds.
        </p>
      </div>

      <div className="bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-700/80 card-shadow overflow-hidden">
        {/* Settings row */}
        <div className="p-4 sm:p-6 border-b border-slate-700/50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Odds Format</label>
              <div className="flex rounded-lg border border-slate-600 overflow-hidden">
                {(['fraction', 'decimal', 'american'] as OddsFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setOddsFormat(f)}
                    className={`flex-1 px-2 py-2 text-xs sm:text-sm font-medium capitalize transition-colors ${
                      oddsFormat === f ? 'bg-blue-500 text-white' : 'bg-slate-900/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f === 'american' ? 'US' : f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Number of Selections</label>
              <select
                value={numSelections}
                onChange={(e) => handleNumSelectionsChange(parseInt(e.target.value, 10))}
                className={selectClass}
              >
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Bet Type</label>
              <select
                value={betType}
                onChange={(e) => setBetType(e.target.value as BetType)}
                className={selectClass}
              >
                {betTypeOptions.map((bt) => (
                  <option key={bt} value={bt}>{betTypeLabel(bt, numSelections)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selections */}
        <div className="p-4 sm:p-6 border-b border-slate-700/50 space-y-3">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-1">Selections</h2>
          {rows.map((row, i) => (
            <div key={row.id} className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-700 text-slate-300 text-xs font-mono font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Selection {i + 1}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-500 mb-1.5">Outcome</label>
                  <select
                    value={row.outcome}
                    onChange={(e) => updateRow(row.id, { outcome: e.target.value as Outcome })}
                    className={selectClass}
                  >
                    {OUTCOME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {oddsFormat === 'fraction' && (
                  <div className="col-span-2 sm:col-span-2">
                    <label className="block text-xs text-slate-500 mb-1.5">Odds (fraction)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={row.fractionNum}
                        onChange={(e) => handleFractionChange(row.id, 'num', e.target.value)}
                        className={inputClass}
                        placeholder="5"
                      />
                      <span className="text-slate-500 font-mono">/</span>
                      <input
                        type="number"
                        min="1"
                        value={row.fractionDen}
                        onChange={(e) => handleFractionChange(row.id, 'den', e.target.value)}
                        className={inputClass}
                        placeholder="2"
                      />
                    </div>
                  </div>
                )}

                {oddsFormat === 'decimal' && (
                  <div className="col-span-2 sm:col-span-2">
                    <label className="block text-xs text-slate-500 mb-1.5">Odds (decimal)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={row.decimalStr}
                      onChange={(e) => handleDecimalChange(row.id, e.target.value)}
                      className={inputClass}
                      placeholder="3.50"
                    />
                  </div>
                )}

                {oddsFormat === 'american' && (
                  <div className="col-span-2 sm:col-span-2">
                    <label className="block text-xs text-slate-500 mb-1.5">Odds (American)</label>
                    <input
                      type="text"
                      value={row.americanStr}
                      onChange={(e) => handleAmericanChange(row.id, e.target.value)}
                      className={inputClass}
                      placeholder="+150"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Stake */}
        <div className="p-4 sm:p-6 border-b border-slate-700/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {betType === 'single' && numSelections > 1 && (
              <div>
                <label className="block text-sm text-slate-400 mb-2">Stake Type</label>
                <div className="flex rounded-lg border border-slate-600 overflow-hidden">
                  <button
                    onClick={() => setStakeMode('perBet')}
                    className={`flex-1 px-2 py-2 text-xs sm:text-sm font-medium transition-colors ${
                      stakeMode === 'perBet' ? 'bg-blue-500 text-white' : 'bg-slate-900/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    Per Bet
                  </button>
                  <button
                    onClick={() => setStakeMode('totalCombined')}
                    className={`flex-1 px-2 py-2 text-xs sm:text-sm font-medium transition-colors ${
                      stakeMode === 'totalCombined' ? 'bg-blue-500 text-white' : 'bg-slate-900/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    Total Combined
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Stake ($){betType === 'single' && numSelections > 1 ? (stakeMode === 'perBet' ? ' per bet' : ' total') : ''}
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white font-mono text-base sm:text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="10"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-all duration-200"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Results */}
        {result ? (
          <div className="p-4 sm:p-6 bg-slate-800/50">
            <h2 className="text-base sm:text-lg font-semibold text-white mb-4 sm:mb-5">Summary</h2>

            {result.combinedOdds !== undefined && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 sm:p-4 mb-4 sm:mb-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs sm:text-sm text-blue-400 font-medium">Combined Odds</p>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">All selections must win</p>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-blue-400 font-mono">
                    {result.combinedOdds.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {result.selectionResults && (
              <div className="mb-4 sm:mb-5 overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="font-medium pb-2">#</th>
                      <th className="font-medium pb-2">Stake</th>
                      <th className="font-medium pb-2">Return</th>
                      <th className="font-medium pb-2 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {result.selectionResults.map((r, i) => (
                      <tr key={r.id} className="border-t border-slate-700/50">
                        <td className="py-2 text-slate-400">{i + 1}</td>
                        <td className="py-2 text-slate-300">${r.stake.toFixed(2)}</td>
                        <td className="py-2 text-slate-300">${r.return.toFixed(2)}</td>
                        <td className={`py-2 text-right ${r.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(r.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 border border-slate-700/50">
                <p className="text-xs sm:text-sm text-slate-400 mb-1">Total Outlay</p>
                <p className="text-lg sm:text-xl font-bold text-white font-mono">${result.totalOutlay.toFixed(2)}</p>
                {result.numberOfBets > 1 && (
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                    {result.numberOfBets} bets of ${result.stakePerBet.toFixed(2)}
                  </p>
                )}
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 border border-slate-700/50">
                <p className="text-xs sm:text-sm text-slate-400 mb-1">Total Return</p>
                <p className="text-lg sm:text-xl font-bold text-white font-mono">${result.totalReturn.toFixed(2)}</p>
              </div>
              <div className={`rounded-xl p-3 sm:p-4 border ${
                result.totalProfit >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
              }`}>
                <p className={`text-xs sm:text-sm mb-1 ${result.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  Total Profit
                </p>
                <p className={`text-lg sm:text-xl font-bold font-mono ${result.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(result.totalProfit)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-slate-800/50">
            <div className="text-center py-8">
              <p className="text-slate-500">Enter valid odds and a stake to see calculations</p>
              <p className="text-xs text-slate-600 mt-1">Odds must be greater than 1.00 (evens)</p>
            </div>
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="mt-4 sm:mt-6 bg-slate-800/50 rounded-xl sm:rounded-2xl border border-slate-700/50 p-4 sm:p-5">
        <h3 className="text-xs sm:text-sm font-semibold text-slate-300 mb-2 sm:mb-3">How it works</h3>
        <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span><span className="text-slate-300 font-medium">Single</span> — each selection is its own independent bet; use Stake Type to split one total stake evenly or bet the same amount on each.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span><span className="text-slate-300 font-medium">Double / Treble / Accumulator</span> — one combined bet across all selections; every leg must win. Mark a leg Void to drop it from the combination without losing the bet.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Switch odds format any time — fraction, decimal and American values stay in sync as you type.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
