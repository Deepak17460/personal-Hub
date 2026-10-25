import { useEffect, useMemo } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useEventsBetween, usePreferences, useRecurringEvents } from '@/hooks/useData';
import { useNow } from '@/hooks/useUtils';
import { addDays, todayStr } from '@/utils/dates';
import { dueReminders, occurrencesInRange, type Occurrence } from './occurrences';

const FIRED_KEY = 'ph-reminders-fired';
const UPCOMING_DAYS = 30;

/** Stores only "eventId@date" keys (no event content) so a reminder fires once per device. */
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

async function showSystemNotification(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/pwa-192.png', badge: '/pwa-192.png', tag: title });
    else new Notification(title, { body, icon: '/pwa-192.png' });
  } catch {
    /* Some platforms (e.g. Android without a service worker) do not support page notifications. */
  }
}

/**
 * In-app reminder engine. Runs only while the app is open in a tab or installed PWA window:
 * browsers do not run this code when the app is closed, so reminders are NOT guaranteed then.
 */
export function useReminderEngine(): void {
  const toast = useToast();
  const { prefs } = usePreferences();
  const { occurrences } = useUpcomingOccurrences();
  const now = useNow(30_000);

  useEffect(() => {
    const fired = loadFired();
    const due = dueReminders(occurrences, now, new Set(fired.keys()));
    if (due.length === 0) return;
    for (const o of due) {
      fired.set(o.key, Date.now());
      const when = o.event.time ? `at ${o.event.time}` : 'today';
      const message = `Reminder: ${o.event.title} — ${o.date === todayStr() ? when : o.date}`;
      toast.show(message, 'info');
      if (prefs.notificationsEnabled) void showSystemNotification(o.event.title, o.event.time ? `${o.date} ${o.event.time}` : o.date);
    }
    saveFired(fired);
  }, [occurrences, now, prefs.notificationsEnabled, toast]);
}
