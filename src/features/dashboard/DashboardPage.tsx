import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  Bookmark as BookmarkIcon,
  CalendarPlus,
  CheckCircle2,
  CheckSquare,
  Clock,
  ExternalLink,
  FilePlus2,
  FileText,
  FolderOpen,
  History,
  HardDrive,
  ListTodo,
  Plus,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { Card, CardHeader, EmptyState, ListSkeleton, Badge } from '@/components/ui/Display';
import { SyncIndicator, SYNC_COPY } from '@/components/layout/SyncIndicator';
import { useSession } from '@/features/auth/session';
import { useUpcomingOccurrences } from '@/features/calendar/useReminders';
import { TaskCheck } from '@/features/tasks/TaskBits';
import { useFavoriteBookmarks, useOpenTasksDueBy, usePreferences, useRecent, useTaskCounts } from '@/hooks/useData';
import { useNow, useSyncState } from '@/hooks/useUtils';
import { deriveStatus } from '@/lib/sync/syncStore';
import type { CollectionName } from '@/types/models';
import { describeDue, formatDateStr, formatRelative, todayStr } from '@/utils/dates';
import { formatBytes, markdownPreview } from '@/utils/format';
import { hostnameOf, safeHref } from '@/utils/url';
import { cn } from '@/utils/cn';

function greeting(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { user } = useSession();
  const { prefs } = usePreferences();
  const now = useNow(15_000);
  const w = prefs.dashboardWidgets;
  const firstName = (user.displayName || '').split(' ')[0];

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            {new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting(now.getHours())}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        <p className="text-3xl font-light text-slate-400 tabular-nums dark:text-slate-500" aria-label="Current time">
          {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(now)}
        </p>
      </section>

      {w.stats && <TaskStats />}
      {w.quickActions && <QuickActions />}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {w.tasks && <TodayTasks />}
        {w.reminders && <UpcomingReminders />}
        {w.notes && <RecentNotes />}
        {w.bookmarks && <PinnedBookmarks />}
        {w.recent && <RecentlyModified />}
        {w.sync && <SyncCard />}
      </div>
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: ReactNode; icon: ReactNode; tone: string }) {
  return (
    <Card className="flex items-center gap-4 p-4 sm:p-5">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </Card>
  );
}

function TaskStats() {
  const today = todayStr();
  const counts = useTaskCounts(today);
  const due = useOpenTasksDueBy(today);
  const dueToday = due.data?.filter((t) => t.dueDate === today).length;
  const fallbackOverdue = due.data?.filter((t) => t.dueDate! < today).length;
  const show = (v: number | undefined) => (v === undefined ? '—' : v);
  return (
    <section aria-label="Task summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Stat label="Pending tasks" value={show(counts.data?.open)} icon={<ListTodo className="h-5 w-5" />} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300" />
      <Stat label="Due today" value={show(dueToday)} icon={<Clock className="h-5 w-5" />} tone="bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" />
      <Stat label="Overdue" value={show(counts.data?.overdue ?? fallbackOverdue)} icon={<TriangleAlert className="h-5 w-5" />} tone="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" />
      <Stat label="Completed" value={show(counts.data?.done)} icon={<CheckCircle2 className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" />
    </section>
  );
}

function QuickActions() {
  const actions = [
    { to: '/notes?new=1', label: 'New note', icon: FilePlus2 },
    { to: '/tasks?new=1', label: 'New task', icon: CheckSquare },
    { to: '/calendar?new=1', label: 'New event', icon: CalendarPlus },
    { to: '/bookmarks?new=1', label: 'Save link', icon: BookmarkIcon },
  ];
  return (
    <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="card group flex items-center gap-3 p-3.5 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:hover:border-indigo-500/40"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-slate-800 dark:text-slate-300">
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="text-sm font-medium">{label}</span>
        </Link>
      ))}
    </section>
  );
}

function WidgetLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
      {label}
    </Link>
  );
}

function TodayTasks() {
  const today = todayStr();
  const { data, loading, error } = useOpenTasksDueBy(today);
  return (
    <Card>
      <CardHeader title="Today's tasks" icon={<CheckSquare className="h-4 w-4" />} action={<WidgetLink to="/tasks" label="All tasks" />} />
      <div className="px-3 pb-4">
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <p className="px-2 text-sm text-rose-600">Could not load tasks.</p>
        ) : !data?.length ? (
          <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="Nothing due today" description="Tasks due today or overdue appear here." className="py-6" />
        ) : (
          <ul className="space-y-0.5">
            {data.map((t) => {
              const due = describeDue(t.dueDate!, today);
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TaskCheck task={t} />
                  <Link to={`/tasks?open=${t.id}`} className="min-w-0 flex-1 truncate text-sm">
                    {t.title}
                  </Link>
                  <Badge tone={due.tone === 'overdue' ? 'red' : 'sky'}>{due.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function UpcomingReminders() {
  const { occurrences, loading } = useUpcomingOccurrences();
  const items = occurrences.slice(0, 6);
  return (
    <Card>
      <CardHeader title="Upcoming" icon={<AlarmClock className="h-4 w-4" />} action={<WidgetLink to="/calendar" label="Calendar" />} />
      <div className="px-3 pb-4">
        {loading ? (
          <ListSkeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState icon={<AlarmClock className="h-5 w-5" />} title="No upcoming events" description="Events and reminders for the next 30 days appear here." className="py-6" />
        ) : (
          <ul className="space-y-0.5">
            {items.map((o) => (
              <li key={o.key} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <div className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-slate-100 py-1 dark:bg-slate-800">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">{formatDateStr(o.date, { month: 'short' })}</span>
                  <span className="text-sm leading-none font-semibold">{formatDateStr(o.date, { day: 'numeric' })}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.event.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {o.event.time ?? 'All day'}
                    {o.event.reminderMinutes != null && ' · reminder set'}
                  </p>
                </div>
                {o.event.kind !== 'event' && <Badge tone={o.event.kind === 'important' ? 'violet' : 'amber'}>{o.event.kind}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RecentNotes() {
  const { data, loading } = useRecent('notes', 6);
  const notes = data?.filter((n) => !n.archived).slice(0, 5);
  return (
    <Card>
      <CardHeader title="Recent notes" icon={<FileText className="h-4 w-4" />} action={<WidgetLink to="/notes" label="All notes" />} />
      <div className="px-3 pb-4">
        {loading ? (
          <ListSkeleton rows={3} />
        ) : !notes?.length ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No notes yet"
            action={
              <Link to="/notes?new=1" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                <Plus className="h-4 w-4" /> Write a note
              </Link>
            }
            className="py-6"
          />
        ) : (
          <ul className="space-y-0.5">
            {notes.map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`} className="block rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {n.pinned && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Pinned" />}
                    {n.title || 'Untitled'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {formatRelative(n.updatedAt)} · {markdownPreview(n.content, 80) || 'Empty note'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function PinnedBookmarks() {
  const { data, loading } = useFavoriteBookmarks(8);
  return (
    <Card>
      <CardHeader title="Pinned bookmarks" icon={<Star className="h-4 w-4" />} action={<WidgetLink to="/bookmarks" label="All bookmarks" />} />
      <div className="px-3 pb-4">
        {loading ? (
          <ListSkeleton rows={3} />
        ) : !data?.length ? (
          <EmptyState icon={<BookmarkIcon className="h-5 w-5" />} title="No favourites" description="Star a bookmark to pin it here." className="py-6" />
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {data.map((b) => (
              <li key={b.id}>
                <a
                  href={safeHref(b.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700 uppercase dark:bg-indigo-500/15 dark:text-indigo-300">
                    {(b.title || hostnameOf(b.url)).slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{b.title}</span>
                    <span className="block truncate text-xs text-slate-500">{hostnameOf(b.url)}</span>
                  </span>
                  <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

const MODULE_META: Record<CollectionName, { label: string; icon: typeof FileText; href: (id: string) => string }> = {
  notes: { label: 'Note', icon: FileText, href: (id) => `/notes/${id}` },
  tasks: { label: 'Task', icon: CheckSquare, href: (id) => `/tasks?open=${id}` },
  bookmarks: { label: 'Bookmark', icon: BookmarkIcon, href: (id) => `/bookmarks?open=${id}` },
  documents: { label: 'Document', icon: FolderOpen, href: (id) => `/documents?open=${id}` },
  events: { label: 'Event', icon: CalendarPlus, href: (id) => `/calendar?open=${id}` },
};

function RecentlyModified() {
  const n = useRecent('notes', 6);
  const t = useRecent('tasks', 5);
  const b = useRecent('bookmarks', 5);
  const d = useRecent('documents', 5);
  const e = useRecent('events', 5);
  const items = useMemo(() => {
    const all: { c: CollectionName; id: string; title: string; updatedAt: Date }[] = [];
    const push = (c: CollectionName, rows?: { id: string; title: string; updatedAt: Date }[]) =>
      rows?.forEach((r) => all.push({ c, id: r.id, title: r.title || 'Untitled', updatedAt: r.updatedAt }));
    push('notes', n.data);
    push('tasks', t.data);
    push('bookmarks', b.data);
    push('documents', d.data);
    push('events', e.data);
    return all.sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime()).slice(0, 7);
  }, [n.data, t.data, b.data, d.data, e.data]);
  const loading = n.loading || t.loading;

  return (
    <Card>
      <CardHeader title="Recently modified" icon={<History className="h-4 w-4" />} />
      <div className="px-3 pb-4">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState icon={<History className="h-5 w-5" />} title="No activity yet" description="Items you create or edit show up here." className="py-6" />
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => {
              const meta = MODULE_META[item.c];
              const Icon = meta.icon;
              return (
                <li key={`${item.c}-${item.id}`}>
                  <Link to={meta.href(item.id)} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                    <span className="shrink-0 text-xs text-slate-500">{formatRelative(item.updatedAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function SyncCard() {
  const state = useSyncState();
  const status = deriveStatus(state);
  const storage = useQuery({
    queryKey: ['storage-estimate'],
    queryFn: async () => (navigator.storage?.estimate ? await navigator.storage.estimate() : null),
    staleTime: 60_000,
  });
  const usage = storage.data?.usage;
  const quota = storage.data?.quota;
  const pct = usage != null && quota ? Math.min(100, (usage / quota) * 100) : null;

  return (
    <Card>
      <CardHeader title="Sync & storage" icon={<HardDrive className="h-4 w-4" />} action={<SyncIndicator />} />
      <div className="space-y-4 px-5 pb-5 text-sm">
        <p className="text-slate-600 dark:text-slate-400">{SYNC_COPY[status].detail}</p>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <dt className="text-slate-500">Last synced</dt>
            <dd className="mt-0.5 font-medium">{state.lastSyncedAt ? formatRelative(new Date(state.lastSyncedAt)) : '—'}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <dt className="text-slate-500">Uploads in progress</dt>
            <dd className="mt-0.5 font-medium">{state.inFlightWrites}</dd>
          </div>
        </dl>
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-slate-500">
            <span>Offline storage on this device</span>
            <span>
              {formatBytes(usage)} {quota ? `of ${formatBytes(quota)}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Device storage used">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(pct ?? 0, 1)}%` }} />
          </div>
        </div>
      </div>
    </Card>
  );
}
