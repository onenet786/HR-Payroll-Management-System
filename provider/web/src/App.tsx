import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Building2, LayoutDashboard, LogOut, Menu, PlusCircle, Settings, ShieldCheck, Users } from 'lucide-react';
import { api } from './api';
import { LoginScreen } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { NewClient } from './pages/NewClient';
import { ClientDetail } from './pages/ClientDetail';
import { JobPage } from './pages/JobPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';

export interface ProviderUser { id: string; email: string; name: string; role: 'owner' | 'operator' | 'viewer'; totpEnabled: boolean }

export const navigate = (hash: string) => { window.location.hash = hash; };
const useHash = () => {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => { const on = () => setHash(window.location.hash.replace(/^#/, '') || '/'); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return hash;
};

export const RoleContext = React.createContext<ProviderUser | null>(null);
export const canOperate = (user: ProviderUser | null) => user?.role === 'owner' || user?.role === 'operator';

export function App() {
  const [user, setUser] = useState<ProviderUser | null>(null);
  const [mfaOk, setMfaOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const hash = useHash();

  const loadMe = useCallback(async () => {
    try { const me = await api<{ user: ProviderUser; mfaOk: boolean }>('/auth/me'); setUser(me.user); setMfaOk(me.mfaOk); }
    catch { setUser(null); setMfaOk(false); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadMe(); }, [loadMe]);
  useEffect(() => { const on = () => { setUser(null); setMfaOk(false); }; window.addEventListener('provider:signed-out', on); return () => window.removeEventListener('provider:signed-out', on); }, []);
  useEffect(() => { setMenuOpen(false); }, [hash]);

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (!user || !mfaOk) return <LoginScreen user={user} onSignedIn={loadMe} />;

  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); setUser(null); setMfaOk(false); };
  const parts = hash.split('/').filter(Boolean);
  let page: React.ReactNode;
  if (parts[0] === 'clients' && parts[1] === 'new') page = <NewClient />;
  else if (parts[0] === 'clients' && parts[1]) page = <ClientDetail id={parts[1]} tab={parts[2] || 'overview'} />;
  else if (parts[0] === 'jobs' && parts[1]) page = <JobPage id={parts[1]} />;
  else if (parts[0] === 'activity') page = <ActivityPage />;
  else if (parts[0] === 'settings') page = <SettingsPage />;
  else if (parts[0] === 'users' && user.role === 'owner') page = <UsersPage />;
  else page = <Dashboard />;

  const nav = [
    { hash: '/', label: 'Dashboard', icon: LayoutDashboard, active: parts.length === 0 },
    { hash: '/clients/new', label: 'New client', icon: PlusCircle, active: parts[0] === 'clients' && parts[1] === 'new', hidden: !canOperate(user) },
    { hash: '/activity', label: 'Activity log', icon: Activity, active: parts[0] === 'activity' },
    { hash: '/settings', label: 'Server & releases', icon: Settings, active: parts[0] === 'settings' },
    { hash: '/users', label: 'Provider users', icon: Users, active: parts[0] === 'users', hidden: user.role !== 'owner' },
  ].filter(item => !item.hidden);

  return (
    <RoleContext.Provider value={user}>
      <div className="flex h-full">
        <aside className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-slate-900 text-slate-300 transition-transform md:static md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-4">
            <span className="rounded-lg bg-emerald-600 p-1.5 text-white"><ShieldCheck className="h-5 w-5" /></span>
            <div><p className="text-sm font-bold text-white">OneNet</p><p className="text-[11px] text-slate-400">Provider Console</p></div>
          </div>
          <nav className="flex-1 space-y-0.5 p-2">
            {nav.map(item => (
              <a key={item.hash} href={`#${item.hash}`} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${item.active ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white'}`}>
                <item.icon className="h-4 w-4" /> {item.label}
              </a>
            ))}
          </nav>
          <div className="border-t border-slate-800 p-3 text-xs">
            <p className="truncate font-semibold text-white">{user.name}</p>
            <p className="truncate text-slate-400">{user.email} · {user.role}</p>
            <button type="button" onClick={logout} className="mt-2 inline-flex items-center gap-1.5 text-slate-400 hover:text-white"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
          </div>
        </aside>
        {menuOpen && <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 bg-slate-900/40 md:hidden" onClick={() => setMenuOpen(false)} />}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur md:hidden">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="rounded p-1.5 hover:bg-slate-100"><Menu className="h-5 w-5" /></button>
            <Building2 className="h-4 w-4 text-emerald-600" /><span className="text-sm font-bold">Provider Console</span>
          </div>
          <div className="mx-auto max-w-7xl p-4 md:p-6">{page}</div>
        </main>
      </div>
    </RoleContext.Provider>
  );
}
