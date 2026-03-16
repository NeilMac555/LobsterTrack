import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';

interface CalculationResult {
  hedgeAmount: number;
  payoutOriginalWins: number;
  payoutHedgeWins: number;
  guaranteedProfit: number;
  originalProfit: number;
  hedgeProfit: number;
}

export default function HedgeCalculatorPage() {
  const [originalOdds, setOriginalOdds] = useState<string>('3.50');
  const [originalStake, setOriginalStake] = useState<string>('100');
  const [hedgeOdds, setHedgeOdds] = useState<string>('2.10');
  const [customHedgeAmount, setCustomHedgeAmount] = useState<string>('');

  const calculation = useMemo((): CalculationResult | null => {
    const origOdds = parseFloat(originalOdds);
    const origStake = parseFloat(originalStake);
    const hedOdds = parseFloat(hedgeOdds);

    if (isNaN(origOdds) || isNaN(origStake) || isNaN(hedOdds)) {
      return null;
    }

    if (origOdds <= 1 || hedOdds <= 1 || origStake <= 0) {
      return null;
    }

    // Calculate optimal hedge amount to guarantee equal profit
    // If original wins: (origOdds * origStake) - origStake - hedgeAmount = profit
    // If hedge wins: (hedOdds * hedgeAmount) - hedgeAmount - origStake = profit
    // Set them equal and solve for hedgeAmount:
    // origOdds * origStake - origStake - hedgeAmount = hedOdds * hedgeAmount - hedgeAmount - origStake
    // origOdds * origStake - hedgeAmount = hedOdds * hedgeAmount - hedgeAmount
    // origOdds * origStake = hedOdds * hedgeAmount
    // hedgeAmount = (origOdds * origStake) / hedOdds

    const optimalHedgeAmount = (origOdds * origStake) / hedOdds;
    const hedgeAmount = customHedgeAmount ? parseFloat(customHedgeAmount) : optimalHedgeAmount;

    if (isNaN(hedgeAmount) || hedgeAmount < 0) {
      return null;
    }

    const totalStaked = origStake + hedgeAmount;

    // Payout if original bet wins (hedge loses)
    const payoutOriginalWins = origOdds * origStake;
    const originalProfit = payoutOriginalWins - totalStaked;

    // Payout if hedge bet wins (original loses)
    const payoutHedgeWins = hedOdds * hedgeAmount;
    const hedgeProfit = payoutHedgeWins - totalStaked;

    // Guaranteed profit is the minimum of the two scenarios
    const guaranteedProfit = Math.min(originalProfit, hedgeProfit);

    return {
      hedgeAmount: optimalHedgeAmount,
      payoutOriginalWins,
      payoutHedgeWins,
      guaranteedProfit,
      originalProfit,
      hedgeProfit,
    };
  }, [originalOdds, originalStake, hedgeOdds, customHedgeAmount]);

  const handleReset = () => {
    setOriginalOdds('3.50');
    setOriginalStake('100');
    setHedgeOdds('2.10');
    setCustomHedgeAmount('');
  };

  const formatCurrency = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toFixed(2)}`;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Helmet>
        <title>Football Hedge Calculator — SteamWatch</title>
        <meta name="description" content="Calculate optimal hedge bet sizes for football wagers with real-time calculations." />
        <meta property="og:title" content="Football Hedge Calculator — SteamWatch" />
        <meta property="og:description" content="Calculate optimal hedge bet sizes for football wagers with real-time calculations." />
        <meta property="og:url" content="https://www.steamwatch.io/tools/hedge-calculator" />
        <link rel="canonical" href="https://www.steamwatch.io/tools/hedge-calculator" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "Football Hedge Calculator",
          "url": "https://www.steamwatch.io/tools/hedge-calculator",
          "description": "Calculate optimal hedge bet sizes for football wagers with real-time calculations",
          "applicationCategory": "FinanceApplication",
          "operatingSystem": "Web",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR" }
        })}</script>
      </Helmet>

      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Hedging Calculator</h1>
        <p className="text-slate-400 text-sm sm:text-base">
          Calculate the optimal hedge bet amount to lock in guaranteed profit regardless of outcome.
        </p>
      </div>

      {/* Calculator Card */}
      <div className="bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-700/80 card-shadow overflow-hidden">
        {/* Input Section */}
        <div className="p-4 sm:p-6 border-b border-slate-700/50">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-4 sm:mb-5">Your Bets</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Original Bet */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
                <span className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Original Bet</span>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Odds (decimal)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1.01"
                  value={originalOdds}
                  onChange={(e) => setOriginalOdds(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white font-mono text-base sm:text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="3.50"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Stake ($)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={originalStake}
                  onChange={(e) => setOriginalStake(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white font-mono text-base sm:text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="100"
                />
              </div>
            </div>

            {/* Hedge Bet */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></span>
                <span className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Hedge Bet</span>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Odds (decimal)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1.01"
                  value={hedgeOdds}
                  onChange={(e) => setHedgeOdds(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white font-mono text-base sm:text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="2.10"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Stake ($) <span className="text-slate-500">- auto-calculated</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customHedgeAmount || (calculation?.hedgeAmount.toFixed(2) ?? '')}
                  onChange={(e) => setCustomHedgeAmount(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white font-mono text-base sm:text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="Auto"
                />
                {calculation && !customHedgeAmount && (
                  <p className="text-xs text-slate-500 mt-1">Optimal amount for equal profit</p>
                )}
              </div>
            </div>
          </div>

          {/* Reset Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-all duration-200"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Results Section */}
        {calculation && (
          <div className="p-4 sm:p-6 bg-slate-800/50">
            <h2 className="text-base sm:text-lg font-semibold text-white mb-4 sm:mb-5">Results</h2>

            {/* Optimal Hedge Amount */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 sm:p-4 mb-4 sm:mb-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs sm:text-sm text-blue-400 font-medium">Optimal Hedge Amount</p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Bet this amount for equal profit</p>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-blue-400 font-mono">
                  ${calculation.hedgeAmount.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Payout Scenarios */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-5">
              <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 border border-slate-700/50">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <p className="text-xs sm:text-sm text-slate-400">If Original Wins</p>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white font-mono mb-0.5 sm:mb-1">
                  ${calculation.payoutOriginalWins.toFixed(2)}
                </p>
                <p className={`text-xs sm:text-sm font-mono ${calculation.originalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(calculation.originalProfit)}
                </p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 border border-slate-700/50">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <p className="text-xs sm:text-sm text-slate-400">If Hedge Wins</p>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white font-mono mb-0.5 sm:mb-1">
                  ${calculation.payoutHedgeWins.toFixed(2)}
                </p>
                <p className={`text-xs sm:text-sm font-mono ${calculation.hedgeProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(calculation.hedgeProfit)}
                </p>
              </div>
            </div>

            {/* Guaranteed Profit */}
            <div className={`rounded-xl p-4 sm:p-5 border ${
              calculation.guaranteedProfit >= 0
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-xs sm:text-sm font-medium ${
                    calculation.guaranteedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {calculation.guaranteedProfit >= 0 ? 'Guaranteed Profit' : 'Guaranteed Loss'}
                  </p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                    Minimum return regardless of outcome
                  </p>
                </div>
                <p className={`text-2xl sm:text-3xl font-bold font-mono ${
                  calculation.guaranteedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {formatCurrency(calculation.guaranteedProfit)}
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-5 pt-5 border-t border-slate-700/50">
              <p className="text-sm text-slate-400">
                <span className="font-medium text-slate-300">Total Investment:</span>{' '}
                <span className="font-mono">
                  ${(parseFloat(originalStake) + (customHedgeAmount ? parseFloat(customHedgeAmount) : calculation.hedgeAmount)).toFixed(2)}
                </span>
                {' '}(${originalStake} + ${customHedgeAmount || calculation.hedgeAmount.toFixed(2)})
              </p>
            </div>
          </div>
        )}

        {/* No calculation state */}
        {!calculation && (
          <div className="p-6 bg-slate-800/50">
            <div className="text-center py-8">
              <p className="text-slate-500">Enter valid odds and stake to see calculations</p>
              <p className="text-xs text-slate-600 mt-1">Odds must be greater than 1.00</p>
            </div>
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="mt-4 sm:mt-6 bg-slate-800/50 rounded-xl sm:rounded-2xl border border-slate-700/50 p-4 sm:p-5">
        <h3 className="text-xs sm:text-sm font-semibold text-slate-300 mb-2 sm:mb-3">How it works</h3>
        <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">1.</span>
            Enter your original bet's odds and stake amount
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">2.</span>
            Enter the hedge bet odds (usually the opposite outcome)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">3.</span>
            The calculator shows the optimal hedge amount to lock in equal profit
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">4.</span>
            You can adjust the hedge amount to see different profit scenarios
          </li>
        </ul>
      </div>
    </div>
  );
}
