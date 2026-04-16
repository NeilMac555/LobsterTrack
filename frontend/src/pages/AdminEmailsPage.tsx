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

interface AccountRow {
  id: number;
  email: string;
  created_at: string;
  stripe_customer_id: string | null;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface UsersData {
  total: number;
  never_paid: number;
  active: number;
  canceled: number;
  past_due: number;
  other: number;
  users: AccountRow[];
}

type UserFilter = 'all' | 'never_paid' | 'active' | 'canceled' | 'past_due';

export default function AdminEmailsPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<AdminData | null>(null);
  const [users, setUsers] = useState<UsersData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<'accounts' | 'newsletter'>('accounts');
  const [userFilter, setUserFilter] = useState<UserFilter>('never_paid');
  const [activating, setActivating] = useState<number | null>(null);
  const [activateMsg, setActivateMsg] = useState<string>('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const [emailsRes, usersRes] = await Promise.all([
        fetch(`/api/admin/emails?password=${encodeURIComponent(password)}`),
        fetch(`/api/admin/users?password=${encodeURIComponent(password)}`),
      ]);

      if (emailsRes.status === 401 || usersRes.status === 401) {
        setError('Invalid password');
        setLoading(false);
        return;
      }

      if (!emailsRes.ok || !usersRes.ok) {
        setError('Something went wrong');
        setLoading(false);
        return;
      }

      setData(await emailsRes.json());
      setUsers(await usersRes.json());
      setAuthenticated(true);
    } catch {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  const refreshUsers = async () => {
    try {
      const res = await fetch(`/api/admin/users?password=${encodeURIComponent(password)}`);
      if (res.ok) setUsers(await res.json());
    } catch {
      /* ignore */
    }
  };

  const handleForceActivate = async (email: string, userId: number) => {
    setActivating(userId);
    setActivateMsg('');
    try {
      const res = await fetch(
        `/api/admin/force-activate?password=${encodeURIComponent(password)}&email=${encodeURIComponent(email)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Failed' }));
        setActivateMsg(`Error: ${body.detail || 'Failed to activate'}`);
      } else {
        setActivateMsg(`Activated ${email}`);
        await refreshUsers();
      }
    } catch {
      setActivateMsg('Network error');
    } finally {
      setActivating(null);
      setTimeout(() => setActivateMsg(''), 4000);
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

  const downloadUsersCSV = () => {
    if (!users) return;
    const rows = filteredUsers.map(u => [
      u.email,
      u.subscription_status,
      format(new Date(u.created_at), 'yyyy-MM-dd HH:mm:ss'),
      u.stripe_customer_id || '',
    ]);
    const csv = [
      ['Email', 'Status', 'Signed Up', 'Stripe Customer'].join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steamwatch-accounts-${userFilter}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredUsers = (users?.users || []).filter(u =>
    userFilter === 'all' ? true : u.subscription_status === userFilter
  );

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

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      never_paid: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      canceled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      past_due: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    const cls = map[status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    const label = status === 'never_paid' ? 'Never Paid' : status.replace('_', ' ');
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wide ${cls}`}>
        {label}
      </span>
    );
  };

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 border-b border-slate-700/50">
        <button
          onClick={() => setTab('accounts')}
          className={`px-4 py-2.5 font-semibold transition-colors border-b-2 -mb-px ${
            tab === 'accounts'
              ? 'text-white border-blue-500'
              : 'text-slate-400 border-transparent hover:text-slate-300'
          }`}
        >
          Accounts ({users?.total ?? 0})
        </button>
        <button
          onClick={() => setTab('newsletter')}
          className={`px-4 py-2.5 font-semibold transition-colors border-b-2 -mb-px ${
            tab === 'newsletter'
              ? 'text-white border-blue-500'
              : 'text-slate-400 border-transparent hover:text-slate-300'
          }`}
        >
          Newsletter ({data?.count ?? 0})
        </button>
      </div>

      {tab === 'accounts' && users && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <button
              onClick={() => setUserFilter('all')}
              className={`bg-slate-800/80 rounded-lg border p-3 text-left ${
                userFilter === 'all' ? 'border-blue-500' : 'border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="text-xs text-slate-400 uppercase">Total</div>
              <div className="text-xl font-bold text-white">{users.total}</div>
            </button>
            <button
              onClick={() => setUserFilter('active')}
              className={`bg-slate-800/80 rounded-lg border p-3 text-left ${
                userFilter === 'active' ? 'border-emerald-500' : 'border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="text-xs text-emerald-400 uppercase">Active</div>
              <div className="text-xl font-bold text-white">{users.active}</div>
            </button>
            <button
              onClick={() => setUserFilter('never_paid')}
              className={`bg-slate-800/80 rounded-lg border p-3 text-left ${
                userFilter === 'never_paid' ? 'border-amber-500' : 'border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="text-xs text-amber-400 uppercase">Never Paid</div>
              <div className="text-xl font-bold text-white">{users.never_paid}</div>
            </button>
            <button
              onClick={() => setUserFilter('canceled')}
              className={`bg-slate-800/80 rounded-lg border p-3 text-left ${
                userFilter === 'canceled' ? 'border-slate-500' : 'border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="text-xs text-slate-400 uppercase">Canceled</div>
              <div className="text-xl font-bold text-white">{users.canceled}</div>
            </button>
            <button
              onClick={() => setUserFilter('past_due')}
              className={`bg-slate-800/80 rounded-lg border p-3 text-left ${
                userFilter === 'past_due' ? 'border-red-500' : 'border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="text-xs text-red-400 uppercase">Past Due</div>
              <div className="text-xl font-bold text-white">{users.past_due}</div>
            </button>
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-400 text-sm">
              Showing <span className="text-white font-semibold">{filteredUsers.length}</span>{' '}
              {userFilter === 'all' ? 'accounts' : userFilter.replace('_', ' ') + ' accounts'}
            </p>
            <button
              onClick={downloadUsersCSV}
              disabled={filteredUsers.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Download CSV
            </button>
          </div>

          {activateMsg && (
            <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
              activateMsg.startsWith('Error') || activateMsg === 'Network error'
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            }`}>
              {activateMsg}
            </div>
          )}

          {filteredUsers.length > 0 ? (
            <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="bg-slate-700/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Signed Up</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Stripe</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-700/20">
                      <td className="px-4 py-3 text-white font-medium">{u.email}</td>
                      <td className="px-4 py-3">{statusBadge(u.subscription_status)}</td>
                      <td className="px-4 py-3 text-slate-400 text-sm">
                        {format(new Date(u.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                        {u.stripe_customer_id || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.subscription_status !== 'active' && (
                          <button
                            onClick={() => handleForceActivate(u.email, u.id)}
                            disabled={activating === u.id}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white text-xs font-semibold rounded-md transition-colors"
                          >
                            {activating === u.id ? 'Activating...' : 'Force Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
              <p className="text-slate-400">No accounts matching this filter</p>
            </div>
          )}
        </>
      )}

      {tab === 'newsletter' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Newsletter Signups</h2>
              <p className="text-slate-400 mt-1 text-sm">{data?.count || 0} total signups</p>
            </div>
            <button
              onClick={downloadCSV}
              disabled={!data || data.count === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              Download CSV
            </button>
          </div>

          {data && data.count > 0 ? (
            <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700/30">
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Signed Up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {data.subscribers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-700/20">
                      <td className="px-6 py-4 text-white font-medium">{s.email}</td>
                      <td className="px-6 py-4 text-slate-400">
                        {format(new Date(s.created_at), 'MMM d, yyyy h:mm a')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
              <p className="text-slate-400">No newsletter signups yet</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
