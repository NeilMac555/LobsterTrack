import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Shows a confirmation banner after Stripe redirects back with ?checkout=success.
 * Covers both cases:
 *  - Already signed in (upgrade flow) — we also refresh the user to flip them to Pro.
 *  - Not signed in (public checkout) — tells them to check email for a sign-in link.
 * Always includes Neil's support contact so nobody who paid feels stranded.
 */
export default function CheckoutSuccessBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const params = new URLSearchParams(location.search);
  const isSuccess = params.get('checkout') === 'success';

  // If the user is signed in, refresh so their subscription flips to active.
  useEffect(() => {
    if (isSuccess && user) {
      refreshUser().catch(() => {});
    }
  }, [isSuccess, user, refreshUser]);

  if (!isSuccess || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    // Strip ?checkout=success from the URL so it doesn't re-trigger.
    params.delete('checkout');
    const newSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: newSearch ? `?${newSearch}` : '' },
      { replace: true }
    );
  };

  return (
    <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-5 sm:p-6 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1 pr-6">
          <h3 className="text-lg font-bold text-white mb-1">Payment successful — welcome to Pro!</h3>
          {user ? (
            <p className="text-sm text-slate-300">
              Your account is now upgraded. All Pro tools are unlocked — you may need to refresh the page to see the change.
            </p>
          ) : (
            <p className="text-sm text-slate-300">
              We've sent a sign-in link to the email you used at checkout. Click the link to access all Pro tools.
              <br />
              <span className="text-slate-400">
                If the email doesn't arrive within a few minutes, check spam, then email
                {' '}
                <a href="mailto:neilmac@bookieinsiders.io" className="text-emerald-400 hover:text-emerald-300 underline">
                  neilmac@bookieinsiders.io
                </a>
                {' '}
                and Neil will sort it out personally.
              </span>
            </p>
          )}
          <p className="text-xs text-slate-500 mt-3">
            Any problems with your account? Email{' '}
            <a href="mailto:neilmac@bookieinsiders.io" className="text-emerald-400 hover:text-emerald-300 underline">
              neilmac@bookieinsiders.io
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
