import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { NoAccountError, createPublicCheckoutSession } from '../api/auth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'subscribe' flips the modal to 'Subscribe to Pro' framing — used
   *  when opened from the header Go Pro button so users aren't confused
   *  by a 'Sign in' title when they clicked a subscribe CTA. */
  mode?: 'signin' | 'subscribe';
}

export default function LoginModal({ isOpen, onClose, mode = 'signin' }: LoginModalProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'sent' | 'no-account'>('email');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // 'subscribe' mode: skip the magic-link detour and go straight to Stripe.
    // The backend blocks existing active subscribers with a 409, which we
    // surface as a friendly inline error that points them to Sign In.
    if (mode === 'subscribe') {
      try {
        const { checkout_url } = await createPublicCheckoutSession(email);
        window.location.href = checkout_url;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start checkout');
        setLoading(false);
      }
      return;
    }

    try {
      await login(email);
      setStep('sent');
    } catch (err) {
      if (err instanceof NoAccountError) {
        setStep('no-account');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setRedirecting(true);
    setError('');
    try {
      const { checkout_url } = await createPublicCheckoutSession(email);
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setRedirecting(false);
    }
  };

  const handleClose = () => {
    setStep('email');
    setEmail('');
    setError('');
    setRedirecting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {step === 'email' && (
          <>
            {mode === 'subscribe' ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-[0.12em] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Pro
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">
                    Subscribe
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2 tracking-tight">Subscribe to SteamWatch Pro</h2>
                <p className="text-sm text-slate-400 mb-6">
                  Enter your email — we'll take you straight to Stripe to complete checkout. Your account is created automatically on payment.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white mb-2 tracking-tight">Sign in to SteamWatch</h2>
                <p className="text-sm text-slate-400 mb-6">
                  Enter your email and we'll send you a magic link to sign in. SteamWatch accounts are for Pro subscribers only.
                </p>
              </>
            )}

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={`w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-transparent mb-4 ${
                  mode === 'subscribe' ? 'focus:ring-cyan-400' : 'focus:ring-red-500'
                }`}
              />
              {error && (
                <p className="text-red-400 text-sm mb-4">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || !email}
                className={`w-full font-bold py-3 rounded-lg transition-all duration-200 disabled:from-slate-600 disabled:to-slate-700 ${
                  mode === 'subscribe'
                    ? 'bg-gradient-to-br from-cyan-400 to-cyan-500 hover:brightness-110 text-slate-900 shadow-sm shadow-cyan-500/40'
                    : 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white'
                }`}
              >
                {loading
                  ? (mode === 'subscribe' ? 'Redirecting to Stripe…' : 'Sending...')
                  : (mode === 'subscribe' ? 'Continue to Stripe →' : 'Send Magic Link')}
              </button>
            </form>
          </>
        )}

        {step === 'sent' && (
          <div className="text-center py-4">
            <div className="text-4xl mb-4">&#9993;</div>
            <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-sm text-slate-400 mb-6">
              We sent a sign-in link to <span className="text-white font-medium">{email}</span>.
              Click the link in your email to continue.
            </p>
            <button
              onClick={handleClose}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {step === 'no-account' && (
          <div className="text-center py-2">
            <div className="text-4xl mb-4">&#128274;</div>
            <h2 className="text-xl font-bold text-white mb-2">No account yet</h2>
            <p className="text-sm text-slate-400 mb-6">
              We couldn't find an account for <span className="text-white font-medium">{email}</span>.
              SteamWatch accounts are created when you subscribe to Pro. Subscribe now and we'll email you a sign-in link automatically.
            </p>
            {error && (
              <p className="text-red-400 text-sm mb-4">{error}</p>
            )}
            <button
              onClick={handleSubscribe}
              disabled={redirecting}
              className="w-full bg-gradient-to-br from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:from-slate-600 disabled:to-slate-700 text-slate-900 font-bold py-3 rounded-lg transition-all duration-200 mb-3"
            >
              {redirecting ? 'Redirecting to Stripe...' : 'Subscribe to Pro'}
            </button>
            <button
              onClick={() => { setStep('email'); setError(''); }}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Try a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
