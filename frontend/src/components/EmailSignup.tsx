import { useState } from 'react';

export default function EmailSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) return;

    setStatus('loading');

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setMessage(data.message);
        setEmail('');
      } else {
        setStatus('error');
        setMessage('Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <div className="relative rounded-2xl py-10 sm:py-12 px-6 sm:px-8 overflow-hidden border border-blue-500/30"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 58, 95, 0.7) 0%, rgba(15, 30, 55, 0.85) 50%, rgba(20, 40, 70, 0.75) 100%)',
          boxShadow: '0 0 30px -5px rgba(59, 130, 246, 0.25), 0 8px 32px -8px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600" />

        <div className="flex items-center gap-4 ml-2">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-lg">{message}</p>
            <p className="text-slate-400 text-sm mt-0.5">We'll notify you when steam alerts are live.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl py-10 sm:py-12 px-6 sm:px-8 overflow-hidden border border-blue-500/30"
      style={{
        background: 'linear-gradient(135deg, rgba(30, 58, 95, 0.7) 0%, rgba(15, 30, 55, 0.85) 50%, rgba(20, 40, 70, 0.75) 100%)',
        boxShadow: '0 0 30px -5px rgba(59, 130, 246, 0.25), 0 8px 32px -8px rgba(0, 0, 0, 0.4)'
      }}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600" />

      {/* Top gradient line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.6) 0%, rgba(59, 130, 246, 0.3) 50%, rgba(59, 130, 246, 0.6) 100%)'
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-5 ml-2">
        <div className="flex-1">
          <h3 className="text-white font-semibold text-lg flex items-center gap-2.5">
            {/* Bell icon with pulse animation */}
            <span className="relative">
              <svg className="w-5 h-5 text-blue-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {/* Glow behind icon */}
              <span className="absolute inset-0 bg-blue-400/30 blur-lg rounded-full" />
            </span>
            Get Steam Alerts
          </h3>
          <p className="text-slate-300 text-sm mt-1.5">
            Get alerted within 15 mins when Pinnacle lines move 5%+
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 w-full sm:w-auto">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="flex-1 sm:w-56 px-4 py-2.5 bg-slate-900/70 border border-slate-500/40 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-lg text-sm transition-all whitespace-nowrap hover:shadow-lg hover:shadow-blue-500/25"
          >
            {status === 'loading' ? 'Sending...' : 'Notify Me'}
          </button>
        </form>
      </div>

      {status === 'error' && (
        <p className="text-red-400 text-sm mt-4 ml-2">{message}</p>
      )}
    </div>
  );
}
