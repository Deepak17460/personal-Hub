import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Menu, Moon, Plus, Search, Sun, X } from 'lucide-react';
import { useSession } from '@/features/auth/session';
import { useReminderEngine } from '@/features/calendar/useReminders';
import { usePreferences } from '@/hooks/useData';
import { themeStore, useTheme } from '@/hooks/useTheme';
import { cn } from '@/utils/cn';
import { ErrorBoundary } from '../ErrorBoundary';
import { IconButton } from '../ui/Button';
import { PageLoader } from './FullScreenLoader';
import { NAV_ITEMS } from './nav';
import { SyncIndicator } from './SyncIndicator';
import { UpdatePrompt } from './UpdatePrompt';

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white',
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/favicon.svg" alt="" className="h-8 w-8" width={32} height={32} />
      <span className="text-[15px] font-semibold tracking-tight">Personal Hub</span>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={navClass} onClick={onNavigate}>
          <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserChip() {
  const { user } = useSession();
  const name = user.displayName || user.email || 'Owner';
  return (
    <NavLink to="/settings" className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800/70">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold text-white uppercase">
        {name.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{user.displayName || 'Owner'}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</span>
      </span>
    </NavLink>
  );
}

function GlobalSearchBox() {
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(value.trim())}`);
  };

  return (
    <form role="search" onSubmit={submit} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search everything…"
        aria-label="Search everything"
        className="input-base h-10 pr-14 pl-9"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-slate-200 px-1.5 text-[10px] text-slate-400 dark:border-slate-700">
        Ctrl K
      </kbd>
    </form>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const { update } = usePreferences();
  const isDark = theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark'));
  return (
    <IconButton
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => {
        const next = isDark ? 'light' : 'dark';
        setTheme(next);
        update({ theme: next });
      }}
    >
      {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </IconButton>
  );
}

/** Applies the theme stored in synced preferences (e.g. changed on another device). */
function PreferencesEffects() {
  const { prefs, loading } = usePreferences();
  useEffect(() => {
    if (!loading && prefs.theme !== themeStore.get()) themeStore.set(prefs.theme);
  }, [prefs.theme, loading]);
  useReminderEngine();
  return null;
}

function MobileNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.filter((n) => n.mobile).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400',
              )
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </NavLink>
        ))}
        <button type="button" onClick={onMore} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <Menu className="h-5 w-5" aria-hidden />
          More
        </button>
      </div>
    </nav>
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only z-50 rounded-lg bg-indigo-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <Brand />
        <div className="mt-8 flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <UserChip />
        </div>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 animate-fade-in bg-slate-900/50" onClick={() => setDrawerOpen(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 animate-slide-up rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <IconButton label="Close navigation" onClick={() => setDrawerOpen(false)}>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <UserChip />
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-slate-50/85 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/85">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <div className="lg:hidden">
            <Brand />
          </div>
          <GlobalSearchBox />
          <div className="ml-auto flex items-center gap-1.5">
            <SyncIndicator compact />
            <IconButton label="Search" className="md:hidden" onClick={() => navigate('/search')}>
              <Search className="h-4.5 w-4.5" />
            </IconButton>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl px-4 pt-6 pb-28 sm:px-6 lg:pb-10">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <MobileNav onMore={() => setDrawerOpen(true)} />
      <QuickAddFab />
      <PreferencesEffects />
      <UpdatePrompt />
    </div>
  );
}

function QuickAddFab() {
  const navigate = useNavigate();
  const location = useLocation();
  if (location.pathname !== '/') return null;
  return (
    <button
      type="button"
      aria-label="New note"
      onClick={() => navigate('/notes?new=1')}
      className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 lg:hidden"
    >
      <Plus className="h-6 w-6" />
    </button>
  );
}
