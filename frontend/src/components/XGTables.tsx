type Placement = 'homepage' | 'tools-menu' | 'contextual-team-pnl' | 'contextual-justice-table' | 'contextual-match';

export function xgTablesUrl(placement: Placement): string {
  return `https://www.xgtables.io/?utm_source=steamwatch&utm_medium=referral&utm_campaign=xgtables_launch&utm_content=${placement}`;
}

export function trackXGTablesClick(placement: Placement): void {
  try {
    window.plausible?.('xGTables Click', { props: { placement } });
  } catch {
    // Follow the link even when analytics is unavailable.
  }
}

export function XGTablesContextLink({ placement, className = 'mt-6 text-sm' }: {
  placement: 'contextual-team-pnl' | 'contextual-justice-table' | 'contextual-match';
  className?: string;
}) {
  return (
    <p className={className}>
      <a
        href={xgTablesUrl(placement)}
        target="_blank"
        rel="noopener"
        onClick={() => trackXGTablesClick(placement)}
        className="rounded-sm text-cyan-300 underline underline-offset-4 decoration-cyan-300/40 hover:decoration-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
      >
        Explore team xG and results on xGTables.
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}

export function XGTablesMatchLink({ sportKey }: { sportKey: string }) {
  if (sportKey === 'soccer_uefa_nations_league') return null;

  return (
    <div className="border-t border-slate-700/50 px-4 py-3 sm:px-6">
      <XGTablesContextLink placement="contextual-match" className="text-sm" />
    </div>
  );
}

export function XGTablesCard() {
  return (
    <section aria-labelledby="xgtables-heading" className="mt-8 flex flex-col gap-4 rounded-xl border border-slate-700/60 bg-slate-800/60 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div>
        <h2 id="xgtables-heading" className="text-lg font-semibold text-slate-100">Explore the numbers behind the results</h2>
        <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-slate-300">
          Free expected-goals tables, match results and player statistics across Europe’s top five leagues and UEFA competitions. Historical seasons and downloadable data available.
        </p>
      </div>
      <a
        href={xgTablesUrl('homepage')}
        target="_blank"
        rel="noopener"
        onClick={() => trackXGTablesClick('homepage')}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-md border border-slate-600 bg-slate-900/50 px-4 py-2.5 text-sm font-semibold text-cyan-300 hover:border-cyan-400 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
      >
        Explore xGTables <span aria-hidden="true">→</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </section>
  );
}
