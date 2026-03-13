import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { requestMagicLink, verifyMagicLink, getMe, createCheckoutSession, createPortalSession } from '../api/auth';
import type { UserInfo } from '../api/auth';

interface AuthContextType {
  user: UserInfo | null;
  token: string | null;
  isLoading: boolean;
  isSubscribed: boolean;
  login: (email: string) => Promise<void>;
  verify: (token: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  subscribe: () => Promise<void>;
  manageSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isSubscribed = user?.subscription?.status === 'active';

  // Hydrate user on mount (only if we don't already have the user from verify)
  useEffect(() => {
    if (token && !user) {
      console.log('[Auth] Hydrating user with token:', token.substring(0, 20) + '...');
      getMe(token)
        .then((u) => {
          console.log('[Auth] User hydrated:', u.email);
          setUser(u);
        })
        .catch((err) => {
          console.error('[Auth] getMe failed, clearing token:', err);
          setToken(null);
          setUser(null);
          localStorage.removeItem('auth_token');
        })
        .finally(() => setIsLoading(false));
    } else {
      if (token && user) console.log('[Auth] User already set, skipping hydration');
      if (!token) console.log('[Auth] No token found');
      setIsLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email: string) => {
    await requestMagicLink(email);
  }, []);

  const verify = useCallback(async (magicToken: string) => {
    console.log('[Auth] Calling verifyMagicLink...');
    const res = await verifyMagicLink(magicToken);
    console.log('[Auth] Verify response:', res);
    localStorage.setItem('auth_token', res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const t = token || localStorage.getItem('auth_token');
    if (!t) return;
    try {
      const u = await getMe(t);
      setUser(u);
    } catch {
      // ignore
    }
  }, [token]);

  const subscribe = useCallback(async () => {
    const t = token || localStorage.getItem('auth_token');
    if (!t) return;
    console.log('[Auth] subscribe() token prefix:', t.substring(0, 20) + '...');
    const { checkout_url } = await createCheckoutSession(t);
    window.location.href = checkout_url;
  }, [token]);

  const manageSubscription = useCallback(async () => {
    const t = token || localStorage.getItem('auth_token');
    if (!t) return;
    const { portal_url } = await createPortalSession(t);
    window.location.href = portal_url;
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isSubscribed, login, verify, logout, refreshUser, subscribe, manageSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}
