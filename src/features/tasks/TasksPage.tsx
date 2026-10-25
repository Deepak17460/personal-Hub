import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CheckSquare, ListChecks, Pencil, Plus, Repeat, Search, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ListSkeleton, PageHeader, Segmented, TagList } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { useOpenTasksDueBy, usePagedCollection } from '@/hooks/useData';
import { createRecord, deleteRecord, pickFields } from '@/repositories/records';
import { isOverdue, PRIORITY_ORDER, toggleSubtask } from '@/repositories/tasks';
import type { Priority, Task } from '@/types/models';
import { cn } from '@/utils/cn';
import { describeDue, todayStr } from '@/utils/dates';
import { describeRecurrence } from '@/utils/recurrence';
import { textMatches } from '@/utils/searchTokens';
import { PriorityBadge, PRIORITY_LABEL, TaskCheck } from './TaskBits';
import { TaskFormDialog } from './TaskForm';

type View = 'open' | 'today' | 'upcoming' | 'overdue' | 'done' | 'all';
type Sort = 'due' | 'priority' | 'updated' | 'title';

export function filterTasks(tasks: Task[], view: View, today: string): Task[] {
  switch (view) {
    case 'open':
      return tasks.filter((t) => t.status !== 'done');
    case 'today':
      return tasks.filter((t) => t.status !== 'done' && t.dueDate !== null && t.dueDate <= today);
    case 'upcoming':
      return tasks.filter((t) => t.status !== 'done' && t.dueDate !== null && t.dueDate > today);
    case 'overdue':
      return tasks.filter((t) => isOverdue(t, today));
    case 'done':
      return tasks.filter((t) => t.status === 'done');
    case 'all':
      return tasks;
  }
}

export function sortTasks(tasks: Task[], sort: Sort): Task[] {
  const copy = [...tasks];
  switch (sort) {
    case 'due':
      return copy.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    case 'priority':
      return copy.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
    case 'updated':
      return copy.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export default function TasksPage() {
  const { db, uid } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const today = todayStr();
  const paged = usePagedCollection('tasks');
  const due = useOpenTasksDueBy(today, 100);

  const [view, setView] = useState<View>('open');
  const [sort, setSort] = useState<Sort>('due');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');

  // Merge recent window with all open tasks due by today, so overdue items are never missed.
  const all = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of paged.data ?? []) map.set(t.id, t);
    for (const t of due.data ?? []) map.set(t.id, t);
    return [...map.values()];
  }, [paged.data, due.data]);

  const categories = useMemo(() => [...new Set(all.map((t) => t.category).filter(Boolean))].sort(), [all]);
  const counts = useMemo(
    () => ({
      open: all.filter((t) => t.status !== 'done').length,
      overdue: all.filter((t) => isOverdue(t, today)).length,
      done: all.filter((t) => t.status === 'done').length,
    }),
    [all, today],
  );

  const visible = useMemo(() => {
    let rows = filterTasks(all, view, today);
    if (priority) rows = rows.filter((t) => t.priority === priority);
    if (category) rows = rows.filter((t) => t.category === category);
    if (text.trim()) rows = rows.filter((t) => textMatches([t.title, t.description, t.tags, t.category, t.subtasks.map((s) => s.title)], text));
    return sortTasks(rows, sort);
  }, [all, view, priority, category, text, sort, today]);

  const isNew = params.get('new') === '1';
  const openId = params.get('open');
  const editing = openId ? (all.find((t) => t.id === openId) ?? null) : null;
  const closeForm = () => setParams({}, { replace: true });

  const remove = async (task: Task) => {
    const ok = await confirm({ title: 'Delete task?', message: `"${task.title}" will be permanently deleted.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    deleteRecord(db, uid, 'tasks', task.id);
    toast.show('Task deleted', 'info', {
      label: 'Undo',
      onClick: () => createRecord(db, uid, 'tasks', pickFields('tasks', task as unknown as Record<string, unknown>), { id: task.id, createdAt: task.createdAt }),
    });
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={`${counts.open} open · ${counts.overdue} overdue · ${counts.done} completed`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>
            New task
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Task view"
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'today', label: 'Today' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'overdue', label: `Overdue${counts.overdue ? ` (${counts.overdue})` : ''}` },
            { value: 'done', label: 'Completed' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="relative col-span-2 sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter tasks" aria-label="Filter tasks" className="h-10 pl-9" type="search" />
          </div>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} aria-label="Priority filter" className="h-10 py-2 sm:w-36">
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter" className="h-10 py-2 sm:w-36">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort tasks" className="col-span-2 h-10 py-2 sm:w-36">
            <option value="due">Sort: Due date</option>
            <option value="priority">Sort: Priority</option>
            <option value="updated">Sort: Updated</option>
            <option value="title">Sort: Title</option>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {paged.loading ? (
          <div className="p-4">
            <ListSkeleton rows={5} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<CheckSquare className="h-5 w-5" />}
            title={all.length === 0 ? 'No tasks yet' : 'No tasks match'}
            description={all.length === 0 ? 'Create your first task to start planning.' : 'Try a different view or filter.'}
            action={
              all.length === 0 && (
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>
                  New task
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((t) => (
              <TaskRow key={t.id} task={t} today={today} onEdit={() => setParams({ open: t.id })} onDelete={() => void remove(t)} />
            ))}
          </ul>
        )}
      </Card>

      {paged.hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={paged.loadMore}>
            Load more
          </Button>
        </div>
      )}

      <TaskFormDialog open={isNew || editing !== null} task={editing} categories={categories} onClose={closeForm} />
    </div>
  );
}

function TaskRow({ task, today, onEdit, onDelete }: { task: Task; today: string; onEdit: () => void; onDelete: () => void }) {
  const { db, uid } = useSession();
  const done = task.status === 'done';
  const dueInfo = task.dueDate ? describeDue(task.dueDate, today) : null;
  const doneSubs = task.subtasks.filter((s) => s.done).length;

  return (
    <li className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
      <TaskCheck task={task} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className="block max-w-full text-left">
          <span className={cn('block text-sm font-medium break-words', done && 'text-slate-400 line-through dark:text-slate-500')}>{task.title}</span>
          {task.description && <span className="mt-0.5 line-clamp-1 block text-xs text-slate-500 dark:text-slate-400">{task.description}</span>}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {task.status === 'in_progress' && <Badge tone="indigo">In progress</Badge>}
          {dueInfo && !done && <Badge tone={dueInfo.tone === 'overdue' ? 'red' : dueInfo.tone === 'today' ? 'sky' : 'neutral'}>{dueInfo.label}</Badge>}
          {task.recurrence.freq !== 'none' && (
            <Badge tone="violet">
              <Repeat className="h-3 w-3" aria-hidden /> {describeRecurrence(task.recurrence)}
            </Badge>
          )}
          {task.category && <Badge>{task.category}</Badge>}
          <TagList tags={task.tags} max={3} />
          {task.pending && <Badge tone="amber">Pending sync</Badge>}
        </div>
        {task.subtasks.length > 0 && (
          <details className="mt-2">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 select-none">
              <ListChecks className="h-3.5 w-3.5" aria-hidden /> {doneSubs}/{task.subtasks.length} subtasks
            </summary>
            <ul className="mt-1.5 space-y-1 pl-1">
              {task.subtasks.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={s.done} onChange={() => toggleSubtask(db, uid, task, s.id)} className="h-4 w-4 rounded accent-indigo-600" />
                    <span className={cn(s.done && 'text-slate-400 line-through')}>{s.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <IconButton label={`Edit ${task.title}`} onClick={onEdit} className="h-9 w-9">
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton label={`Delete ${task.title}`} onClick={onDelete} className="h-9 w-9 hover:text-rose-600">
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </li>
  );
}
