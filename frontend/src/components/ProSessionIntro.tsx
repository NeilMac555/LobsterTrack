import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SESSION_KEY = 'steamwatch:pro-intro-seen';
let seenInMemory = false;

/** One introduction per tab session, including across refreshes. */
export default function ProSessionIntro() {
  const { isLoading, isSubscribed } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || isSubscribed) return;
    // Never interrupt sign-in, admin or the payment return flow.
    if (location.pathname.startsWith('/auth/') || location.pathname.startsWith('/admin/') || new URLSearchParams(location.search).has('checkout')) return;
    let seen = seenInMemory;
    try { seen ||= sessionStorage.getItem(SESSION_KEY) === '1'; } catch { /* Storage may be disabled. */ }
    if (seen) return;
    seenInMemory = true;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* Keep the in-memory fallback. */ }
    if (location.pathname === '/pro') return;
    navigate('/pro', {
      replace: true,
      state: { proIntroReturnTo: location.pathname + location.search + location.hash },
    });
  }, [isLoading, isSubscribed, location, navigate]);

  return null;
}
