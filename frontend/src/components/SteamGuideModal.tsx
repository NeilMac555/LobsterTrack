interface SteamGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SteamGuideModal({ isOpen, onClose }: SteamGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Understanding Steam Moves</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* What is steam */}
          <section>
            <h3 className="text-emerald-400 font-semibold mb-2 flex items-center gap-2">
              <span className="text-lg">What is "steam"?</span>
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Steam is when sharp bettors (professionals) hit a market hard enough to move the odds.
              When you see a line "steaming," it means significant money just landed on that outcome.
            </p>
          </section>

          {/* Shorter price */}
          <section>
            <h3 className="text-emerald-400 font-semibold mb-2">
              What does "odds shortening" mean?
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              When odds drop (e.g., 2.50 → 2.20), the bookmaker thinks that outcome is now more likely.
              This usually happens because smart money backed it. A <span className="text-emerald-400 font-medium">green arrow ↓</span> means
              the price shortened — someone is betting that outcome wins.
            </p>
          </section>

          {/* Should I bet */}
          <section>
            <h3 className="text-amber-400 font-semibold mb-2">
              Should I bet what's steaming?
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Not necessarily. This tool shows where sharp money went — it's not a tip sheet.
              Sharp bettors win around 54-56% long-term, not 100%. Use steam moves as one input
              in your analysis, not as a signal to blindly follow.
            </p>
          </section>

          {/* Why Pinnacle */}
          <section>
            <h3 className="text-blue-400 font-semibold mb-2">
              Why track Pinnacle specifically?
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Pinnacle is the sharpest sportsbook in the world. They accept the highest limits and
              don't ban winning players. This makes their odds the market benchmark — when Pinnacle
              moves, it's because real money is talking.
            </p>
          </section>

          {/* Quick reference */}
          <section className="bg-slate-900/50 rounded-xl p-4">
            <h3 className="text-slate-200 font-semibold mb-3">Quick Reference</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-mono font-bold">↓5.2%</span>
                <span className="text-slate-400">Odds shortened 5.2% — being backed</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-red-400 font-mono font-bold">↑3.1%</span>
                <span className="text-slate-400">Odds drifted 3.1% — money on other side</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400">H</span>
                <span className="text-slate-400">Home win</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400">D</span>
                <span className="text-slate-400">Draw</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">A</span>
                <span className="text-slate-400">Away win</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 rounded-full bg-slate-700/50 hover:bg-slate-600 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
      title="How to read steam moves"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>
  );
}
