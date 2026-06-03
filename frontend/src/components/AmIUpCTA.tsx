/**
 * Cross-promo CTA pointing to amiup.io — Neil's separate football
 * bet tracker. Visual design is the source-of-truth he provided,
 * implemented via global .aiu-* classes in index.css so the
 * branding stays consistent if/when he updates it.
 *
 * The `placement` prop becomes a `ref` query param on the link so
 * he can attribute clicks back to which SteamWatch surface drove
 * them (?ref=steamwatch-home / ?ref=steamwatch-match etc).
 */
interface AmIUpCTAProps {
  /**
   * Identifier for the surface this CTA was shown on. Appended to
   * the amiup.io URL as ?ref= so clicks are attributable in
   * downstream analytics. Keep these stable — they become the
   * keys in his reporting.
   */
  placement: 'home' | 'match' | string;
  /**
   * Wrap the CTA in a centred / spaced container? Defaults to true
   * because both current insertion sites want the same visual
   * breathing room. Set false if the caller wants raw control.
   */
  wrap?: boolean;
}

export default function AmIUpCTA({ placement, wrap = true }: AmIUpCTAProps) {
  const href = `https://amiup.io/?ref=steamwatch-${placement}`;
  const link = (
    <a
      href={href}
      className="aiu-cta"
      target="_blank"
      rel="noopener"
      aria-label="Try a new advanced AI bet tracker"
    >
      <span className="aiu-cta-text">
        <span className="aiu-cta-eyebrow">NEW</span>
        Try new advanced AI Bet Tracker
      </span>
      <span className="aiu-cta-arrow" aria-hidden="true">→</span>
    </a>
  );
  if (!wrap) return link;
  return (
    <div className="flex justify-center my-6 sm:my-8">
      {link}
    </div>
  );
}
