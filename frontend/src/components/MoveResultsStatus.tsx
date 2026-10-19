import type { SteamResultsData } from '../types';

export default function MoveResultsStatus({ data, checkedAt, error }: {
  data: SteamResultsData; checkedAt: Date | null; error: string | null;
}) {
  const latest = data.latest_settled_kickoff;
  return <div className="text-xs text-slate-400 mb-4 space-y-1" aria-live="polite">
    <p>Refreshes every minute · Last checked {checkedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—'}
      {latest && <> · Latest settled fixture {new Date(latest.endsWith('Z') ? latest : `${latest}Z`).toLocaleDateString([], { day: 'numeric', month: 'short' })}</>}</p>
    <p>{data.qualifying_moves ?? data.total_moves} qualifying selections · {data.total_moves} settled · {data.pending_moves ?? 0} awaiting results
      {!!data.excluded_moves && <> · {data.excluded_moves} postponed/suspended selections excluded</>}</p>
    {error && <p className="text-amber-300" role="status">{error}</p>}
  </div>;
}
