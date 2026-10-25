import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/Display';
import { useSession } from '@/features/auth/session';
import { setTaskStatus } from '@/repositories/tasks';
import type { Priority, Task } from '@/types/models';
import { cn } from '@/utils/cn';

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const PRIORITY_TONE = { low: 'neutral', medium: 'sky', high: 'amber', critical: 'red' } as const;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function TaskCheck({ task, className }: { task: Task; className?: string }) {
  const { db, uid } = useSession();
  const done = task.status === 'done';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
      onClick={(e) => {
        e.stopPropagation();
        setTaskStatus(db, uid, task, done ? 'todo' : 'done');
      }}
      className={cn(
        'flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
        done
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500 dark:border-slate-600',
        className,
      )}
    >
      <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
    </button>
  );
}
