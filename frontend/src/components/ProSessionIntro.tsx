import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SESSION_KEY = 'steamwatch:pro-intro-seen';
let seenInMemory = false;

/** Offer Pro once per session without redirecting visitors or crawlers. */
export default function ProSessionIntro() {
  const { isLoading, isSubscribed } = useAuth();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const excluded = location.pathname === '/pro'
    || location.pathname.startsWith('/auth/')
    || location.pathname.startsWith('/admin/')
    || new URLSearchParams(location.search).has('checkout');

  useEffect(() => {
    if (isLoading || isSubscribed || excluded) return;
    let seen = seenInMemory;
    try { seen ||= sessionStorage.getItem(SESSION_KEY) === '1'; } catch { /* Storage may be disabled. */ }
    if (seen) return;
    // Allow time to use the page; the document, canonical and URL stay intact.
    const timer = window.setTimeout(() => {
      seenInMemory = true;
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* Use memory fallback. */ }
      setVisible(true);
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [isLoading, isSubscribed, excluded]);

  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisible(false);
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [visible]);

  if (!visible || excluded || isSubscribed || isLoading) return null;
  return <aside aria-labelledby="pro-intro-title" className="fixed bottom-5 right-5 z-40 w-[calc(100%-2.5rem)] max-w-sm rounded-2xl border border-slate-600 bg-slate-900 p-5 shadow-xl">
    <button type="button" aria-label="Dismiss Pro introduction" onClick={() => setVisible(false)} className="absolute right-2 top-2 h-10 w-10 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">×</button>
    <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">SteamWatch Pro</p>
    <h2 id="pro-intro-title" className="mt-2 pr-5 text-lg font-bold text-white">Go deeper with your football research.</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-300">Full Form Lab, rolling xG, model prices and team rankings. €19.99 per month.</p>
    <Link to="/pro" onClick={() => setVisible(false)} className="mt-4 inline-flex rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300">Explore Pro →</Link>
  </aside>;
}
