import type { ReactNode } from 'react';

type Placement = 'homepage' | 'predictor' | 'closing-lines' | 'dropping-odds' | 'pro';

function sharpSideSoccerUrl(placement: Placement): string {
  return `https://www.sharpsidesoccer.com/?utm_source=steamwatch&utm_medium=referral&utm_campaign=sharpsidesoccer_launch&utm_content=${placement}`;
}

function trackClick(placement: Placement): void {
  try {
    window.plausible?.('Sharp Side Soccer Click', { props: { placement } });
  } catch {
    // Analytics must never prevent the ordinary link from working.
  }
}

function ReferralLink({ placement, className, children }: {
  placement: Placement;
  className: string;
  children: ReactNode;
}) {
  return <a href={sharpSideSoccerUrl(placement)} target="_blank" rel="noopener"
    onClick={() => trackClick(placement)} className={className}>
    {children} <span aria-hidden="true">→</span>
    <span className="sr-only"> (opens in a new tab)</span>
  </a>;
}

export function SharpSideSoccerCard({ placement }: { placement: 'homepage' | 'pro' }) {
  const isPro = placement === 'pro';
  return <aside aria-labelledby={`sharp-side-${placement}`} className="my-8 flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-800/60 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
    <div className="min-w-0">
      <h2 id={`sharp-side-${placement}`} className="text-lg font-semibold text-slate-100">
        {isPro ? 'Want the bets and analysis too?' : 'Get our football betting analysis'}
      </h2>
      <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-300">
        Selections and match analysis from Neil Mac and Will White at <strong className="font-semibold text-slate-100">Sharp Side Soccer</strong>.
      </p>
      {isPro && <p className="mt-2 text-sm text-slate-400">A separate subscription from SteamWatch Pro.</p>}
    </div>
    <ReferralLink placement={placement} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-3 rounded-md border border-cyan-400/50 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition-colors hover:border-cyan-300 hover:bg-cyan-400/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:self-start lg:self-auto">
      Explore Sharp Side Soccer
    </ReferralLink>
  </aside>;
}

const CONTEXT = {
  predictor: 'Put your model price in context.',
  'closing-lines': 'Researching the closing price?',
  'dropping-odds': 'Following the steam?',
};

export function SharpSideSoccerContextLink({ placement }: { placement: keyof typeof CONTEXT }) {
  return <aside aria-label="Analysis from Sharp Side Soccer" className="my-6 border-y border-slate-700/60 py-3 text-sm leading-relaxed text-slate-300">
    <p>{CONTEXT[placement]}{' '}
      <ReferralLink placement={placement} className="rounded-sm font-medium text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 hover:decoration-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">
        Read our match analysis on Sharp Side Soccer
      </ReferralLink>
    </p>
  </aside>;
}
