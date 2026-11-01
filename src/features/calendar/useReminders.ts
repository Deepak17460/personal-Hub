import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '@/components/ui/Toast';
import { useEventsBetween, usePreferences, useRecurringEvents, useTasksDueBetween } from '@/hooks/useData';
import { useNow } from '@/hooks/useUtils';
import { addDays, todayStr } from '@/utils/dates';
import { dueTaskReminders } from '@/features/tasks/taskReminders';
import { dueReminders, occurrencesInRange, type Occurrence } from './occurrences';
import {
  buildReminderCopy,
  buildTaskReminderCopy,
  buildTestReminderCopy,
  REMINDER_BADGE,
  REMINDER_ICON,
  REMINDER_IMAGE,
} from './reminderCopy';

const FIRED_KEY = 'ph-reminders-fired';
const UPCOMING_DAYS = 30;

/** Stores only reminder keys (no content) so a reminder fires once per device. */
function loadFired(): Map<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}') as Record<string, number>;
    const cutoff = Date.now() - 14 * 86_400_000;
    return new Map(Object.entries(raw).filter(([, t]) => typeof t === 'number' && t > cutoff));
  } catch {
    return new Map();
  }
}

function saveFired(map: Map<string, number>): void {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    /* ignore */
  }
}

/** Upcoming occurrences for the next 30 days (shared listener with the dashboard). */
export function useUpcomingOccurrences(): { occurrences: Occurrence[]; loading: boolean } {
  const today = todayStr();
  const end = addDays(today, UPCOMING_DAYS);
  const oneOff = useEventsBetween(today, end);
  const recurring = useRecurringEvents();
  const occurrences = useMemo(() => occurrencesInRange([oneOff.data, recurring.data], today, end), [oneOff.data, recurring.data, today, end]);
  return { occurrences, loading: oneOff.loading || recurring.loading };
}

export async function showReminderNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const base = {
    body,
    icon: REMINDER_ICON,
    badge: REMINDER_BADGE,
    tag,
    requireInteraction: true,
  } as NotificationOptions;
  const withImage = { ...base, image: REMINDER_IMAGE } as NotificationOptions;

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, withImage);
      return true;
    }
    new Notification(title, withImage);
    return true;
  } catch {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, base);
      else new Notification(title, base);
      return true;
    } catch {
      return false;
    }
  }
}

export async function sendTestReminderNotification(): Promise<boolean> {
  const copy = buildTestReminderCopy();
  return showReminderNotification(copy.title, copy.body, copy.tag);
}

/**
 * In-app reminder engine for calendar events and tasks.
 * Runs only while the app is open in a tab or installed PWA window:
 * browsers do not run this code when the app is closed, so reminders are NOT guaranteed then.
 */
export function useReminderEngine(): void {
  const toast = useToast();
  const navigate = useNavigate();
  const { prefs } = usePreferences();
  const { occurrences } = useUpcomingOccurrences();
  const today = todayStr();
  const tasks = useTasksDueBetween(addDays(today, -1), addDays(today, UPCOMING_DAYS));
  const now = useNow(30_000);

  useEffect(() => {
    const fired = loadFired();
    const firedKeys = new Set(fired.keys());
    const dueEvents = dueReminders(occurrences, now, firedKeys);
    const dueTasks = dueTaskReminders(tasks.data, now, firedKeys);
    if (dueEvents.length === 0 && dueTasks.length === 0) return;

    for (const o of dueEvents) {
      fired.set(o.key, Date.now());
      const copy = buildReminderCopy(o, now);
      toast.reminder({
        title: copy.title,
        body: copy.body,
        image: REMINDER_IMAGE,
        action: {
          label: 'Open calendar',
          onClick: () => navigate('/calendar'),
        },
      });
      if (prefs.notificationsEnabled) {
        void showReminderNotification(copy.title, copy.body, copy.tag);
      }
    }

    for (const item of dueTasks) {
      fired.set(item.key, Date.now());
      const copy = buildTaskReminderCopy(item.task, now);
      toast.reminder({
        title: copy.title,
        body: copy.body,
        image: REMINDER_IMAGE,
        action: {
          label: 'Open tasks',
          onClick: () => navigate('/tasks'),
        },
      });
      if (prefs.notificationsEnabled) {
        void showReminderNotification(copy.title, copy.body, copy.tag);
      }
    }

    saveFired(fired);
  }, [occurrences, tasks.data, now, prefs.notificationsEnabled, toast, navigate]);
}
