import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { createRecord, updateRecord } from '@/repositories/records';
import { eventFormSchema, type EventFormValues } from '@/schemas/entities';
import type { CalendarEvent, EventFields } from '@/types/models';
import { todayStr } from '@/utils/dates';
import { REMINDER_OPTIONS } from './occurrences';

export function toEventFields(v: EventFormValues): EventFields {
  return {
    title: v.title.trim(),
    description: v.description,
    date: v.date,
    time: v.time || null,
    kind: v.kind,
    recurrence: v.recurrence,
    reminderMinutes: v.reminder === 'none' ? null : Number(v.reminder),
  };
}

function toForm(e: CalendarEvent | null, date?: string): EventFormValues {
  const known = REMINDER_OPTIONS.some((o) => o.value === String(e?.reminderMinutes));
  return {
    title: e?.title ?? '',
    description: e?.description ?? '',
    date: e?.date ?? date ?? todayStr(),
    time: e?.time ?? '',
    kind: e?.kind ?? 'event',
    recurrence: e?.recurrence ?? { freq: 'none', interval: 1 },
    reminder: e?.reminderMinutes == null ? 'none' : known ? (String(e.reminderMinutes) as EventFormValues['reminder']) : '30',
  };
}

export function EventFormDialog({ open, event, date, onClose }: { open: boolean; event: CalendarEvent | null; date?: string; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={event ? 'Edit event' : 'New event'}>
      {open && <Body key={event?.id ?? `new-${date}`} event={event} date={date} onDone={onClose} />}
    </Dialog>
  );
}

function Body({ event, date, onDone }: { event: CalendarEvent | null; date?: string; onDone: () => void }) {
  const { db, uid } = useSession();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema), defaultValues: toForm(event, date) });
  const freq = watch('recurrence.freq');

  const onSubmit = handleSubmit((values) => {
    const fields = toEventFields(values);
    if (event) updateRecord(db, uid, 'events', event, fields);
    else createRecord(db, uid, 'events', fields);
    toast.success(event ? 'Event updated' : 'Event added');
    onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Title" error={errors.title?.message}>
        {(p) => <Input {...p} {...register('title')} autoFocus maxLength={200} placeholder="e.g. Dentist, Mum's birthday" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" error={errors.date?.message}>
          {(p) => <Input {...p} {...register('date')} type="date" />}
        </Field>
        <Field label="Time" error={errors.time?.message} hint="Empty = all day">
          {(p) => <Input {...p} {...register('time')} type="time" />}
        </Field>
        <Field label="Type">
          {(p) => (
            <Select {...p} {...register('kind')}>
              <option value="event">Event</option>
              <option value="important">Important date</option>
              <option value="reminder">Reminder</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Repeat">
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
        {freq !== 'none' ? (
          <Field label="Every (interval)" error={errors.recurrence?.interval?.message}>
            {(p) => <Input {...p} {...register('recurrence.interval', { valueAsNumber: true })} type="number" min={1} max={365} inputMode="numeric" />}
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="Reminder" hint="Shown while the app is open">
          {(p) => (
            <Select {...p} {...register('reminder')}>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Notes" error={errors.description?.message}>
        {(p) => <Textarea {...p} {...register('description')} rows={3} />}
      </Field>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-slate-800">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{event ? 'Save changes' : 'Add event'}</Button>
      </div>
    </form>
  );
}
