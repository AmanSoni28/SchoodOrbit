import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, BookOpen, Brain, Building2, CalendarCheck, ChevronDown, ClipboardList, FileClock, GraduationCap, HeartHandshake, LayoutDashboard,
  LogOut, Megaphone, Menu, Settings, ShieldCheck, Sparkles, Users, X, BarChart3, Award, Lock, Server, UserCog, ChevronsLeft, ChevronsRight, Trophy, Wallet,
} from 'lucide-react';
import { useAuth, ROLE_LABEL, fullName, type Role } from '../lib/auth';
import { useBranding, featureOn } from '../lib/branding';
import { api } from '../lib/api';
import { cx } from './ui';

type Item = { to: string; label: string; icon: ReactNode; feature?: string; badge?: 'unread' };
type Group = { section: string; items: Item[] };
const i = (C: any) => <C className="size-[18px] shrink-0" aria-hidden />;

const COMMON: Group = { section: 'Account', items: [
  { to: '/notifications', label: 'Notifications', icon: i(Bell), badge: 'unread' },
  { to: '/account', label: 'Account & security', icon: i(UserCog) },
] };

const NAV: Record<Role, Group[]> = {
  SUPER_ADMIN: [
    { section: 'System', items: [
      { to: '/', label: 'System overview', icon: i(Server) },
      { to: '/admin/settings', label: 'Branding & features', icon: i(Settings) },
    ] },
    { section: 'People', items: [{ to: '/admin/users', label: 'Users & provisioning', icon: i(Users) }] },
    { section: 'Governance', items: [{ to: '/admin/audit', label: 'Audit log', icon: i(FileClock) }] },
    COMMON,
  ],
  COLLEGE_ADMIN: [
    { section: 'Insights', items: [
      { to: '/', label: 'Overview', icon: i(LayoutDashboard) },
      { to: '/admin/reports', label: 'Reports & analytics', icon: i(BarChart3) },
    ] },
    { section: 'Academics', items: [
      { to: '/admin/academics', label: 'Academic structure', icon: i(Building2) },
      { to: '/admin/courses', label: 'Course catalogue', icon: i(BookOpen) },
      { to: '/admin/offerings', label: 'Course offerings', icon: i(ClipboardList) },
      { to: '/admin/results', label: 'Results', icon: i(Trophy) },
    ] },
    { section: 'Finance', items: [{ to: '/admin/fees', label: 'Fees & payments', icon: i(Wallet) }] },
    { section: 'People', items: [
      { to: '/admin/users', label: 'Users', icon: i(Users) },
      { to: '/admin/parent-links', label: 'Parent access', icon: i(HeartHandshake), feature: 'parentPortal' },
    ] },
    { section: 'Communication', items: [{ to: '/announcements', label: 'Announcements', icon: i(Megaphone) }] },
    { section: 'Governance', items: [{ to: '/admin/audit', label: 'Audit log', icon: i(FileClock) }] },
    COMMON,
  ],
  FACULTY: [
    { section: 'Teaching', items: [
      { to: '/', label: 'Dashboard', icon: i(LayoutDashboard) },
      { to: '/courses', label: 'My courses', icon: i(BookOpen) },
    ] },
    { section: 'Communication', items: [{ to: '/announcements', label: 'Announcements', icon: i(Megaphone) }] },
    COMMON,
  ],
  STUDENT: [
    { section: 'Learning', items: [
      { to: '/', label: 'Dashboard', icon: i(LayoutDashboard) },
      { to: '/courses', label: 'My courses', icon: i(BookOpen) },
      { to: '/revision', label: 'Daily revision', icon: i(CalendarCheck), feature: 'dailyRevision' },
      { to: '/ai-helper', label: 'AI Homework Helper', icon: i(Sparkles), feature: 'aiHomework' },
    ] },
    { section: 'Achievements', items: [
      { to: '/results', label: 'Results', icon: i(Trophy) },
      { to: '/certificates', label: 'Certificates', icon: i(Award) },
    ] },
    { section: 'Finance', items: [{ to: '/fees', label: 'My fees', icon: i(Wallet) }] },
    { section: 'Communication', items: [{ to: '/announcements', label: 'Announcements', icon: i(Megaphone) }] },
    { section: 'Privacy', items: [{ to: '/privacy', label: 'Parent access', icon: i(Lock), feature: 'parentPortal' }] },
    COMMON,
  ],
  PARENT: [
    { section: 'My child', items: [{ to: '/', label: 'Progress overview', icon: i(GraduationCap) }] },
    { section: 'Preferences', items: [{ to: '/parent/settings', label: 'Notification settings', icon: i(Settings) }] },
    COMMON,
  ],
};

const readCollapsed = () => { try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; } };

export function AppShell() {
  const { me, role, setRole, logout } = useAuth();
  const b = useBranding();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const unread = useQuery({ queryKey: ['notifications', 'unread'], queryFn: async () => (await api('/notifications?pageSize=1')).meta.unread as number, refetchInterval: 60_000 });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); } catch { /* storage blocked */ } return !c; });
  const groups = (role ? NAV[role] : []).map((g) => ({ ...g, items: g.items.filter((x) => !x.feature || featureOn(b, x.feature)) })).filter((g) => g.items.length);
  const current = groups.flatMap((g) => g.items).find((x) => (x.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(x.to)));

  const sidebar = (mini: boolean) => (
    <nav aria-label="Main" className="flex h-full flex-col bg-gradient-to-b from-navy via-navy to-[#0b1430] text-white/70">
      <div className={cx('flex items-center gap-3 py-5', mini ? 'justify-center px-2' : 'px-5')}>
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-3" onClick={() => setOpen(false)} title={b.name}>
          {b.logoUrl ? <img src={b.logoUrl} alt="" className="size-10 shrink-0 rounded-xl bg-white object-contain p-1" /> : (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-primary text-white shadow-lg shadow-accent/20"><Brain className="size-5" aria-hidden /></span>
          )}
          {!mini && <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{b.shortName}</span>
            <span className="block truncate text-xs text-white/50">{b.name}</span>
          </span>}
        </Link>
      </div>
      <div className="mx-4 mb-2 h-px bg-white/10" />
      <div className="flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">
        {groups.map((g) => (
          <div key={g.section} className="mt-3">
            {mini ? <div className="mx-auto mb-1.5 h-px w-6 bg-white/10" /> : <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[.12em] text-white/35">{g.section}</div>}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const count = it.badge === 'unread' ? unread.data ?? 0 : 0;
                return (
                  <li key={it.to}>
                    <NavLink to={it.to} end={it.to === '/'} onClick={() => setOpen(false)} title={mini ? it.label : undefined}
                      className={({ isActive }) => cx('relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition', mini ? 'justify-center px-0' : 'px-3',
                        isActive ? 'bg-gradient-to-r from-primary to-primary/75 text-white shadow-lg shadow-primary/25' : 'hover:bg-white/[.06] hover:text-white')}>
                      {it.icon}
                      {mini ? <span className="sr-only">{it.label}</span> : <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                      {count > 0 && (mini
                        ? <span className="absolute right-2 top-1.5 size-2 rounded-full bg-danger ring-2 ring-navy" aria-label={`${count} unread`} />
                        : <span className="rounded-full bg-danger px-1.5 py-px text-[10px] font-bold text-white">{count > 99 ? '99+' : count}</span>)}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {me && me.roles.length > 1 && !mini && (
        <div className="border-t border-white/10 px-4 py-3">
          <label htmlFor="role-switch" className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[.12em] text-white/35">Workspace</label>
          <select id="role-switch" value={role ?? ''} onChange={(e) => { setRole(e.target.value as Role); nav('/'); setOpen(false); }}
            className="w-full rounded-lg border border-white/15 bg-navy-2 px-2 py-2 text-sm text-white">
            {me.roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
      )}
      {me && (
        <div className={cx('m-3 flex items-center gap-3 rounded-xl bg-white/[.05] ring-1 ring-white/[.06]', mini ? 'justify-center p-2' : 'p-3')} title={mini ? fullName(me) : undefined}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-white" aria-hidden>{me.firstName[0]}{me.lastName[0]}</span>
          {!mini && <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{fullName(me)}</span>
            <span className="block truncate text-xs text-white/50">{role ? ROLE_LABEL[role] : me.email}</span>
          </span>}
          {!mini && <button onClick={async () => { await logout(); nav('/login'); }} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out"><LogOut className="size-4" /></button>}
        </div>
      )}
    </nav>
  );

  return (
    <div className="flex h-full overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className={cx('relative hidden h-full shrink-0 transition-[width] duration-200 lg:block', collapsed ? 'w-[76px]' : 'w-64')}>
        {sidebar(collapsed)}
        <button onClick={toggleCollapsed} className="absolute -right-3 top-7 z-10 grid size-6 place-items-center rounded-full border border-line bg-white text-muted shadow hover:text-primary" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} aria-expanded={!collapsed}>
          {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
        </button>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar(false)}</aside>
          <button className="absolute right-4 top-4 rounded-lg bg-white p-2" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line/70 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <button className="rounded-lg p-2 hover:bg-cloud lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {current && <span className="hidden truncate text-[15px] font-semibold text-navy sm:block">{current.label}</span>}
            {role && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"><ShieldCheck className="size-3.5" aria-hidden />{ROLE_LABEL[role]}</span>}
          </div>
          <span className="hidden text-xs text-muted md:block">{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <Link to="/notifications" className="relative rounded-lg p-2 hover:bg-cloud" aria-label={`Notifications${unread.data ? `, ${unread.data} unread` : ''}`}>
            <Bell className="size-5 text-ink" />
            {!!unread.data && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread.data > 99 ? '99+' : unread.data}</span>}
          </Link>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-cloud">
              <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-white" aria-hidden>{me?.firstName[0]}{me?.lastName[0]}</span>
              <span className="hidden text-sm font-medium sm:block">{fullName(me)}</span>
              <ChevronDown className="size-4 text-muted" aria-hidden />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-white p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                <div className="px-3 py-2 text-xs text-muted">{me?.email}</div>
                <Link role="menuitem" to="/account" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-cloud"><Lock className="size-4" aria-hidden />Account & security</Link>
                <button role="menuitem" onClick={async () => { await logout(); nav('/login'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-cloud"><LogOut className="size-4" aria-hidden />Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main id="main" key={loc.pathname} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
