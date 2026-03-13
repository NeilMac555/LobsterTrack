const API_BASE = '/api';

export interface SubscriptionInfo {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface UserInfo {
  id: number;
  email: string;
  subscription: SubscriptionInfo;
}

export interface AuthResponse {
  token: string;
  user: UserInfo;
}

export async function requestMagicLink(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(data.detail || 'Request failed');
  }
  return res.json();
}

export async function verifyMagicLink(token: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Verification failed' }));
    throw new Error(data.detail || 'Verification failed');
  }
  return res.json();
}

export async function getMe(token: string): Promise<UserInfo> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function createCheckoutSession(token: string): Promise<{ checkout_url: string }> {
  const res = await fetch(`${API_BASE}/stripe/create-checkout-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Failed to create checkout' }));
    throw new Error(data.detail || 'Failed to create checkout');
  }
  return res.json();
}

export async function createPortalSession(token: string): Promise<{ portal_url: string }> {
  const res = await fetch(`${API_BASE}/stripe/create-portal-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Failed to create portal session' }));
    throw new Error(data.detail || 'Failed to create portal session');
  }
  return res.json();
}
