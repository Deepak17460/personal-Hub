import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Bell, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { TaskCheck } from '@/features/tasks/TaskBits';
import { useEventsBetween, usePreferences, useRecurringEvents, useTasksDueBetween } from '@/hooks/useData';
import { deleteRecord } from '@/repositories/records';
import type { CalendarEvent, Task } from '@/types/models';
import { cn } from '@/utils/cn';
import { formatDateStr, monthGrid, todayStr } from '@/utils/dates';
import { describeRecurrence } from '@/utils/recurrence';
import { EventFormDialog } from './EventForm';
import { occurrencesInRange, type Occurrence } from './occurrences';

const KIND_STYLE = {
  event: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200',
  important: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  reminder: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
} as const;

export default function CalendarPage() {
  const { db, uid } = useSession();
  const { prefs } = usePreferences();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const today = todayStr();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month, prefs.weekStartsOn), [cursor, prefs.weekStartsOn]);
  const from = cells[0]!;
  const to = cells[cells.length - 1]!;
  const oneOff = useEventsBetween(from, to);
  const recurring = useRecurringEvents();
  const tasks = useTasksDueBetween(from, to);

  const occurrences = useMemo(() => occurrencesInRange([oneOff.data, recurring.data], from, to), [oneOff.data, recurring.data, from, to]);
  const byDay = useMemo(() => {
    const map = new Map<string, { occ: Occurrence[]; tasks: Task[] }>();
    const get = (d: string) => map.get(d) ?? map.set(d, { occ: [], tasks: [] }).get(d)!;
    for (const o of occurrences) get(o.date).occ.push(o);
    for (const t of tasks.data ?? []) if (t.dueDate) get(t.dueDate).tasks.push(t);
    return map;
  }, [occurrences, tasks.data]);

  const allEvents = useMemo(() => {
    const m = new Map<string, CalendarEvent>();
    for (const e of [...(oneOff.data ?? []), ...(recurring.data ?? [])]) m.set(e.id, e);
    return m;
  }, [oneOff.data, recurring.data]);

  const openId = params.get('open');
  const editing = openId ? (allEvents.get(openId) ?? null) : null;
  const isNew = params.get('new') === '1';

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 7 + prefs.weekStartsOn); // a Sunday + offset
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)),
    );
  }, [prefs.weekStartsOn]);

  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const goToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(today);
  };

  const remove = async (e: CalendarEvent) => {
    const msg = e.recurrence.freq !== 'none' ? `"${e.title}" and all its repeats will be deleted.` : `"${e.title}" will be deleted.`;
    if (!(await confirm({ title: 'Delete event?', message: msg, confirmLabel: 'Delete', danger: true }))) return;
    deleteRecord(db, uid, 'events', e.id);
    toast.info('Event deleted');
  };

  const day = byDay.get(selected) ?? { occ: [], tasks: [] };
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(cursor.year, cursor.month, 1));

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Events, important dates, reminders and task due dates."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>
            New event
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-base font-semibold" aria-live="polite">
              {monthLabel}
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" onClick={goToday}>
                Today
              </Button>
              <IconButton label="Previous month" onClick={() => shift(-1)}>
                <ChevronLeft className="h-4.5 w-4.5" />
              </IconButton>
              <IconButton label="Next month" onClick={() => shift(1)}>
                <ChevronRight className="h-4.5 w-4.5" />
              </IconButton>
            </div>
          </div>
          <div role="grid" aria-label={monthLabel} className="grid grid-cols-7">
            {weekdays.map((w) => (
              <div key={w} role="columnheader" className="border-b border-slate-100 py-2 text-center text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800">
                {w}
              </div>
            ))}
            {cells.map((date) => {
              const items = byDay.get(date);
              const inMonth = Number(date.slice(5, 7)) - 1 === cursor.month;
              const isToday = date === today;
              const isSelected = date === selected;
              const total = (items?.occ.length ?? 0) + (items?.tasks.length ?? 0);
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={`${formatDateStr(date, { dateStyle: 'full' })}${total ? `, ${total} items` : ''}`}
                  onClick={() => setSelected(date)}
                  onDoubleClick={() => setParams({ new: '1', date })}
                  className={cn(
                    'relative flex min-h-16 flex-col items-stretch gap-0.5 border-r border-b border-slate-100 p-1 text-left transition-colors sm:min-h-24 sm:p-1.5 dark:border-slate-800',
                    !inMonth && 'bg-slate-50/60 text-slate-400 dark:bg-slate-900/40 dark:text-slate-600',
                    isSelected && 'bg-indigo-50/70 ring-2 ring-indigo-500 ring-inset dark:bg-indigo-500/10',
                    'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center self-end rounded-full text-xs font-medium sm:self-start',
                      isToday && 'bg-indigo-600 text-white',
                    )}
                  >
                    {Number(date.slice(8))}
                  </span>
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {items?.occ.slice(0, 2).map((o) => (
                      <span key={o.key} className={cn('truncate rounded px-1 py-0.5 text-[10px] font-medium', KIND_STYLE[o.event.kind])}>
                        {o.event.time && <span className="tabular-nums">{o.event.time} </span>}
                        {o.event.title}
                      </span>
                    ))}
                    {items && items.tasks.length > 0 && items.occ.length < 2 && (
                      <span className="truncate rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                        {items.tasks.length} task{items.tasks.length > 1 ? 's' : ''} due
                      </span>
                    )}
                    {total > 2 && <span className="px-1 text-[10px] text-slate-500">+{total - 2} more</span>}
                  </span>
                  {total > 0 && (
                    <span className="mt-auto flex justify-center gap-0.5 sm:hidden" aria-hidden>
                      {items!.occ.slice(0, 3).map((o) => (
                        <span key={o.key} className={cn('h-1.5 w-1.5 rounded-full', o.event.kind === 'important' ? 'bg-violet-500' : o.event.kind === 'reminder' ? 'bg-amber-500' : 'bg-indigo-500')} />
                      ))}
                      {items!.tasks.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold">{formatDateStr(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              {selected === today && <p className="text-xs text-indigo-600 dark:text-indigo-400">Today</p>}
            </div>
            <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setParams({ new: '1', date: selected })}>
              Add
            </Button>
          </div>
          {day.occ.length === 0 && day.tasks.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="Nothing scheduled" description="Double-click a day or use Add to create an event." className="py-10" />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {day.occ.map((o) => (
                <li key={o.key} className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', o.event.kind === 'important' ? 'bg-violet-500' : o.event.kind === 'reminder' ? 'bg-amber-500' : 'bg-indigo-500')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{o.event.title}</p>
                    <p className="text-xs text-slate-500">{o.event.time ?? 'All day'}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {o.event.kind !== 'event' && <Badge tone={o.event.kind === 'important' ? 'violet' : 'amber'}>{o.event.kind === 'important' ? 'Important' : 'Reminder'}</Badge>}
                      {o.event.recurrence.freq !== 'none' && (
                        <Badge tone="neutral">
                          <Repeat className="h-3 w-3" aria-hidden /> {describeRecurrence(o.event.recurrence)}
                        </Badge>
                      )}
                      {o.event.reminderMinutes != null && (
                        <Badge tone="neutral">
                          <Bell className="h-3 w-3" aria-hidden /> Reminder
                        </Badge>
                      )}
                    </div>
                    {o.event.description && <p className="mt-1.5 text-xs whitespace-pre-wrap text-slate-600 dark:text-slate-400">{o.event.description}</p>}
                  </div>
                  <div className="flex shrink-0">
                    <IconButton label={`Edit ${o.event.title}`} className="h-8 w-8" onClick={() => setParams({ open: o.event.id })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label={`Delete ${o.event.title}`} className="h-8 w-8 hover:text-rose-600" onClick={() => void remove(o.event)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </li>
              ))}
              {day.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <TaskCheck task={t} />
                  <span className={cn('min-w-0 flex-1 truncate text-sm', t.status === 'done' && 'text-slate-400 line-through')}>{t.title}</span>
                  <CheckSquare className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Task" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <EventFormDialog open={isNew || editing !== null} event={editing} date={params.get('date') ?? selected} onClose={() => setParams({}, { replace: true })} />
    </div>
  );
}
