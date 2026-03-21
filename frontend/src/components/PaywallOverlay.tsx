import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import LoginModal from './LoginModal';

interface PaywallOverlayProps {
  title?: string;
  description?: string;
}

export default function PaywallOverlay({ title, description }: PaywallOverlayProps = {}) {
  const { user, isLoading, subscribe } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      await subscribe();
    } catch {
      setSubscribing(false);
    }
  };

  return (
    <>
      <div className="bg-slate-800 rounded-xl border border-slate-600 p-5 sm:p-8 animate-in fade-in slide-in-from-bottom-3 duration-400">
        {/* Blurred preview hint */}
        <div className="relative overflow-hidden rounded-lg mb-6">
          <div className="flex rounded-xl overflow-hidden h-[72px] blur-md opacity-50 pointer-events-none select-none">
            <div className="flex-1 bg-gradient-to-br from-green-700 to-green-600 flex items-center justify-center">
              <span className="text-xl font-extrabold text-white">--.--%</span>
            </div>
            <div className="flex-[0.8] bg-gradient-to-br from-amber-600 to-amber-500 flex items-center justify-center">
              <span className="text-xl font-extrabold text-white">--.--%</span>
            </div>
            <div className="flex-1 bg-gradient-to-br from-red-700 to-red-600 flex items-center justify-center">
              <span className="text-xl font-extrabold text-white">--.--%</span>
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-800/50 to-slate-800" />
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="inline-block bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1 mb-4">
            <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Pro Feature</span>
          </div>

          <h3 className="text-xl font-bold text-white mb-2">
            {title || 'Unlock Match Model Results'}
          </h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
            {description || 'Get Dixon-Coles probability baselines, fair odds, and full calculation breakdowns with a SteamWatch Pro subscription.'}
          </p>

          {isLoading ? (
            <div className="text-slate-400 text-sm">Loading...</div>
          ) : !user ? (
            <div className="space-y-3">
              <button
                onClick={() => setShowLogin(true)}
                className="w-full max-w-xs mx-auto block bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold py-3 rounded-lg transition-all duration-200"
              >
                Sign In to Subscribe
              </button>
              <p className="text-xs text-slate-500">Passwordless email sign-in</p>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleSubscribe}
                disabled={subscribing}
                className="w-full max-w-xs mx-auto block bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 disabled:from-slate-600 disabled:to-slate-700 text-white font-bold py-3 rounded-lg transition-all duration-200"
              >
                {subscribing ? 'Redirecting to Stripe...' : 'Subscribe Now'}
              </button>
              <p className="text-xs text-slate-500">
                Signed in as {user.email}
              </p>
            </div>
          )}
        </div>
      </div>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
}
