import { useEffect, useState } from 'react';
import './PublicSummary.css';

type Page = 'closing-lines' | 'steam-results' | 'longshot-bias';
// Capture the server-rendered section before React mounts on direct visits.
const initial = document.querySelector<HTMLElement>('[data-public-summary]');
const initialPage = initial?.dataset.publicSummary;
const initialHtml = initial?.innerHTML;

export default function PublicSummary({ page }: { page: Page }) {
  const [html, setHtml] = useState(initialPage === page ? initialHtml : undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let working = false;
    const refresh = async () => {
      if (working || document.hidden) return;
      working = true;
      try {
        const response = await fetch('/api/public-summary/' + page, { signal: controller.signal });
        if (!response.ok) throw new Error('summary unavailable');
        const body = await response.text();
        if (!controller.signal.aborted) { setHtml(body); setFailed(false); }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally { working = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [page]);
  return <div data-public-summary={page}>
    {html && <div dangerouslySetInnerHTML={{ __html: html }} />}
    {failed && <p className="text-sm text-slate-400">Latest figures temporarily unavailable. Retrying automatically.</p>}
  </div>;
}
