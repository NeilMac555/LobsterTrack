import { useState } from 'react';
import { format } from 'date-fns';

interface Subscriber {
  id: number;
  email: string;
  created_at: string;
}

interface AdminData {
  count: number;
  subscribers: Subscriber[];
}

export default function AdminEmailsPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/emails?password=${encodeURIComponent(password)}`);

      if (response.status === 401) {
        setError('Invalid password');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setError('Something went wrong');
        setLoading(false);
        return;
      }

      const result = await response.json();
      setData(result);
      setAuthenticated(true);
    } catch {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!data) return;

    const headers = ['Email', 'Signed Up'];
    const rows = data.subscribers.map(s => [
      s.email,
      format(new Date(s.created_at), 'yyyy-MM-dd HH:mm:ss')
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steamwatch-emails-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-6">
          <h1 className="text-xl font-bold text-white mb-6">Admin Access</h1>

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm mb-4">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Loading...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Subscribers</h1>
          <p className="text-slate-400 mt-1">{data?.count || 0} total signups</p>
        </div>

        <button
          onClick={downloadCSV}
          disabled={!data || data.count === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download CSV
        </button>
      </div>

      {/* Table */}
      {data && data.count > 0 ? (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/30">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Signed Up
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data.subscribers.map((subscriber) => (
                <tr key={subscriber.id} className="hover:bg-slate-700/20">
                  <td className="px-6 py-4 text-white font-medium">
                    {subscriber.email}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {format(new Date(subscriber.created_at), 'MMM d, yyyy h:mm a')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
          <p className="text-slate-400">No email signups yet</p>
        </div>
      )}
    </div>
  );
}
