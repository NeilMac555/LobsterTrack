/**
 * Cross-promo card pointing to amiup.io — Neil's separate football bet
 * tracker. Rendered once, site-wide, in the footer (see Layout.tsx) so
 * it has one calm, canonical home instead of interrupting page content.
 * It's also linked from the Tools nav dropdown — this card is the
 * secondary, lower-key placement for people who don't dig into Tools.
 *
 * The `placement` prop becomes a `ref` query param on the link so
 * Neil can attribute clicks back to which SteamWatch surface drove
 * them (?ref=steamwatch-footer etc).
 */
interface AmIUpCTAProps {
  /**
   * Identifier for the surface this CTA was shown on. Appended to
   * the amiup.io URL as ?ref= so clicks are attributable in
   * downstream analytics. Keep these stable — they become the
   * keys in his reporting.
   */
  placement: 'footer' | string;
}

export default function AmIUpCTA({ placement }: AmIUpCTAProps) {
  const href = `https://amiup.io/?ref=steamwatch-${placement}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="AmIUp — track every bet and see your real P/L"
      className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-900/80 transition-colors max-w-md mx-auto"
    >
      <span className="text-xl flex-shrink-0" aria-hidden="true">🤖</span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
          AmIUp — AI Bet Tracker
        </span>
        <span className="block text-xs text-slate-500 mt-0.5">
          Track every bet, see your real P/L
        </span>
      </span>
      <span
        className="text-indigo-400 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all flex-shrink-0"
        aria-hidden="true"
      >
        →
      </span>
    </a>
  );
}
