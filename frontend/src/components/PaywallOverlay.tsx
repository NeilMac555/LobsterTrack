import { Link } from 'react-router-dom';

interface PaywallOverlayProps {
  title?: string;
  description?: string;
}

export default function PaywallOverlay({ title, description }: PaywallOverlayProps = {}) {
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

          <Link to="/pro" className="block rounded-lg bg-cyan-400 px-6 py-3 font-bold text-slate-950 hover:bg-cyan-300">Explore Pro — €19.99 / month →</Link>
          <p className="mt-3 text-xs text-slate-400">See everything included in your membership</p>
        </div>
      </div>
    </>
  );
}
