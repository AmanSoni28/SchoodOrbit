import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, get, setSessionExpiredHandler } from './api';

export type Role = 'SUPER_ADMIN' | 'COLLEGE_ADMIN' | 'FACULTY' | 'STUDENT' | 'PARENT';
export type Me = { id: string; email: string; firstName: string; lastName: string; roles: Role[]; mfaEnabled: boolean };

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin', COLLEGE_ADMIN: 'College Admin', FACULTY: 'Faculty', STUDENT: 'Student', PARENT: 'Parent',
};
const ROLE_ORDER: Role[] = ['SUPER_ADMIN', 'COLLEGE_ADMIN', 'FACULTY', 'STUDENT', 'PARENT'];

type Ctx = {
  me: Me | null; loading: boolean; role: Role | null; setRole: (r: Role) => void;
  login: (email: string, password: string, mfaCode?: string) => Promise<{ mfaSetupRequired: boolean }>;
  logout: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try { return await get<Me>('/auth/me'); } catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
    staleTime: 5 * 60_000, retry: false,
  });
  const me = meQ.data ?? null;
  // A user with several roles picks which workspace they are in; remembered per browser.
  const [role, setRoleState] = useState<Role | null>(null);
  useEffect(() => {
    if (!me) return setRoleState(null);
    let saved: string | null = null;
    try { saved = localStorage.getItem('lms.role'); } catch { /* storage blocked */ }
    setRoleState(me.roles.includes(saved as Role) ? (saved as Role) : ROLE_ORDER.find((r) => me.roles.includes(r)) ?? null);
  }, [me]);
  const setRole = (r: Role) => { setRoleState(r); try { localStorage.setItem('lms.role', r); } catch { /* ignore */ } };

  // Drops other users' cached data but updates the *existing* ['me'] query in place.
  // (qc.clear() would delete the query this hook observes, so the new user would never reach the UI.)
  const resetSession = (user: Me | null) => {
    qc.cancelQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'branding' });
    qc.setQueryData(['me'], user);
  };

  // Session ended (expired, revoked, or signed out elsewhere): RequireAuth then redirects to /login.
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    // Guarded: only act when a user is cached, so an anonymous 401 (e.g. on the login page) can't loop.
    const clearLocal = () => { if (qc.getQueryData(['me'])) resetSession(null); };
    setSessionExpiredHandler(clearLocal);
    let ch: BroadcastChannel | null = null;
    try { ch = new BroadcastChannel('lms-auth'); ch.onmessage = (e) => e.data === 'logout' && clearLocal(); } catch { /* unsupported */ }
    channel.current = ch;
    return () => { setSessionExpiredHandler(() => {}); ch?.close(); };
  }, [qc]);

  const login: Ctx['login'] = async (email, password, mfaCode) => {
    const res = await api<{ data: { user: Me; mfaSetupRequired: boolean } }>('/auth/login', { body: { email, password, mfaCode } });
    resetSession(res.data.user);
    return { mfaSetupRequired: res.data.mfaSetupRequired };
  };
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } finally {
      resetSession(null);
      channel.current?.postMessage('logout'); // sign out other open tabs too
    }
  };
  return <AuthCtx.Provider value={{ me, loading: meQ.isLoading, role, setRole, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
export const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : '');
