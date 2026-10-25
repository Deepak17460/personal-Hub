import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { TagInput } from '@/components/ui/TagInput';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { dedupeTags } from '@/schemas/common';
import { taskFormSchema, type TaskFormValues } from '@/schemas/entities';
import { createRecord, updateRecord } from '@/repositories/records';
import { EMPTY_TASK } from '@/repositories/tasks';
import { serverTimestamp } from 'firebase/firestore';
import type { Task, TaskFields } from '@/types/models';
import { randomId } from '@/utils/ids';
import { PRIORITY_LABEL } from './TaskBits';

export function toTaskFields(values: TaskFormValues): TaskFields {
  return {
    ...values,
    title: values.title.trim(),
    dueDate: values.dueDate || null,
    tags: dedupeTags(values.tags),
    category: values.category.trim(),
    subtasks: values.subtasks.filter((s) => s.title.trim()),
  };
}

function toFormValues(task: Task | null, defaults?: Partial<TaskFields>): TaskFormValues {
  const base = { ...EMPTY_TASK, ...defaults, ...(task ?? {}) };
  return {
    title: base.title,
    description: base.description,
    priority: base.priority,
    status: base.status,
    dueDate: base.dueDate ?? '',
    category: base.category,
    tags: base.tags,
    subtasks: base.subtasks,
    recurrence: base.recurrence,
  };
}

interface TaskFormProps {
  open: boolean;
  task: Task | null;
  defaults?: Partial<TaskFields>;
  categories: string[];
  onClose: () => void;
}

export function TaskFormDialog({ open, task, defaults, categories, onClose }: TaskFormProps) {
  return (
    <Dialog open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} size="lg">
      {open && <TaskFormBody key={task?.id ?? 'new'} task={task} defaults={defaults} categories={categories} onDone={onClose} />}
    </Dialog>
  );
}

function TaskFormBody({ task, defaults, categories, onDone }: { task: Task | null; defaults?: Partial<TaskFields>; categories: string[]; onDone: () => void }) {
  const { db, uid } = useSession();
  const toast = useToast();
  const [newSubtask, setNewSubtask] = useState('');
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TaskFormValues>({ resolver: zodResolver(taskFormSchema), defaultValues: toFormValues(task, defaults) });
  const subtasks = useFieldArray({ control, name: 'subtasks', keyName: 'key' });
  const freq = watch('recurrence.freq');

  const onSubmit = handleSubmit((values) => {
    const fields = toTaskFields(values);
    if (task) {
      const completedAt = fields.status === task.status ? {} : { completedAt: fields.status === 'done' ? serverTimestamp() : null };
      updateRecord(db, uid, 'tasks', task, fields, completedAt);
      toast.success('Task updated');
    } else {
      createRecord(db, uid, 'tasks', fields);
      toast.success('Task created');
    }
    onDone();
  });

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    subtasks.append({ id: randomId(12), title, done: false });
    setNewSubtask('');
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" id="task-form">
      <Field label="Title" error={errors.title?.message}>
        {(p) => <Input {...p} {...register('title')} autoFocus placeholder="What needs to be done?" maxLength={200} />}
      </Field>
      <Field label="Description" error={errors.description?.message}>
        {(p) => <Textarea {...p} {...register('description')} rows={3} placeholder="Optional details" />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Priority">
          {(p) => (
            <Select {...p} {...register('priority')}>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status">
          {(p) => (
            <Select {...p} {...register('status')}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </Select>
          )}
        </Field>
        <Field label="Due date" error={errors.dueDate?.message}>
          {(p) => <Input {...p} {...register('dueDate')} type="date" />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category?.message}>
          {(p) => (
            <>
              <Input {...p} {...register('category')} list="task-categories" placeholder="e.g. Home, Work" maxLength={60} />
              <datalist id="task-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Tags" error={errors.tags?.message}>
          {(p) => <Controller control={control} name="tags" render={({ field }) => <TagInput {...p} value={field.value} onChange={field.onChange} />} />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Repeat" hint="Completing a repeating task creates the next one automatically.">
          {(p) => (
            <Select {...p} {...register('recurrence.freq')}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          )}
        </Field>
        {freq !== 'none' && (
          <Field label="Every (interval)" error={errors.recurrence?.interval?.message}>
            {(p) => <Input {...p} {...register('recurrence.interval', { valueAsNumber: true })} type="number" min={1} max={365} inputMode="numeric" />}
          </Field>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Subtasks</legend>
        {subtasks.fields.length > 0 && (
          <ul className="space-y-1.5">
            {subtasks.fields.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <input type="checkbox" {...register(`subtasks.${i}.done`)} aria-label={`Subtask ${i + 1} done`} className="h-4 w-4 rounded accent-indigo-600" />
                <Input {...register(`subtasks.${i}.title`)} aria-label={`Subtask ${i + 1}`} className="h-9 py-1.5" />
                <IconButton label="Remove subtask" onClick={() => subtasks.remove(i)} className="h-9 w-9">
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSubtask();
              }
            }}
            placeholder="Add a subtask"
            aria-label="New subtask"
            className="h-9 py-1.5"
            disabled={subtasks.fields.length >= 50}
          />
          <Button variant="secondary" size="sm" className="h-9" onClick={addSubtask} icon={<Plus className="h-4 w-4" />}>
            Add
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-slate-800">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{task ? 'Save changes' : 'Create task'}</Button>
      </div>
    </form>
  );
}
