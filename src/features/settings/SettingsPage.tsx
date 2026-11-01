import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, KeyRound, LayoutDashboard, LogOut, Monitor, Moon, Palette, RefreshCw, Smartphone, Sun, User, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader, Segmented } from '@/components/ui/Display';
import { Field, Input, Select, Switch } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { SyncDetails, SyncIndicator } from '@/components/layout/SyncIndicator';
import { authService } from '@/features/auth/authService';
import { useSession } from '@/features/auth/session';
import { signOutEverywhereLocal } from '@/features/auth/signOut';
import { usePreferences } from '@/hooks/useData';
import { useTheme } from '@/hooks/useTheme';
import { useInstallPrompt, useSyncState } from '@/hooks/useUtils';
import { friendlyAuthError } from '@/lib/firebase/errors';
import type { DashboardWidget, ThemePreference } from '@/types/models';
import { BackupSection } from './BackupSection';

const WIDGET_LABELS: { [K in Exclude<DashboardWidget, 'sync'>]: string } = {
  stats: 'Task summary',
  quickActions: 'Quick actions',
  tasks: "Today's tasks",
  reminders: 'Upcoming events & reminders',
  notes: 'Recent notes',
  bookmarks: 'Pinned bookmarks',
  recent: 'Recently modified',
};

export default function SettingsPage() {
  const { online } = useSyncState();
  return (
    <div>
      <PageHeader title="Settings" description="Profile, appearance, data and security." />
      <div className="grid gap-6 lg:grid-cols-2">
        <fieldset disabled={!online} className="min-w-0 space-y-6">
          <ProfileSection />
          <AppearanceSection />
          <NotificationSection />
          <DashboardSection />
        </fieldset>
        <div className="space-y-6">
          <fieldset disabled={!online} className="min-w-0 space-y-6">
            <BackupSection />
            <SyncSection />
          </fieldset>
          <InstallSection />
          <SecuritySection />
        </div>
      </div>
    </div>
  );
}

function ProfileSection() {
  const { user } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user.displayName ?? '');
  const [saving, setSaving] = useState(false);
  return (
    <Card>
      <CardHeader title="Profile" icon={<User className="h-4 w-4" />} />
      <form
        className="space-y-4 px-5 pb-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await authService.updateDisplayName(user, name.slice(0, 60));
            toast.success('Profile updated');
          } catch (err) {
            toast.error(friendlyAuthError(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Display name" hint="Used for the dashboard greeting. Stored in your Firebase Auth profile only.">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />}
        </Field>
        <Field label="Email">{(p) => <Input {...p} value={user.email ?? ''} readOnly disabled />}</Field>
        <Button type="submit" variant="secondary" loading={saving}>
          Save profile
        </Button>
      </form>
    </Card>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  const { prefs, update } = usePreferences();
  return (
    <Card>
      <CardHeader title="Appearance" icon={<Palette className="h-4 w-4" />} />
      <div className="space-y-4 px-5 pb-5">
        <Segmented<ThemePreference>
          label="Theme"
          value={theme}
          onChange={(t) => {
            setTheme(t);
            update({ theme: t });
          }}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
        <p className="flex items-center gap-2 text-xs text-slate-500">
          {theme === 'light' ? <Sun className="h-3.5 w-3.5" /> : theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
          Theme syncs to your other devices.
        </p>
        <Field label="Week starts on">
          {(p) => (
            <Select {...p} value={prefs.weekStartsOn} onChange={(e) => update({ weekStartsOn: Number(e.target.value) as 0 | 1 })}>
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </Select>
          )}
        </Field>
      </div>
    </Card>
  );
}

function NotificationSection() {
  const { prefs, update } = usePreferences();
  const toast = useToast();
  const supported = typeof Notification !== 'undefined';
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied');
  const [testing, setTesting] = useState(false);

  const toggle = async (on: boolean) => {
    if (!on) {
      update({ notificationsEnabled: false });
      return;
    }
    if (!supported) {
      toast.warning('This browser does not support notifications.');
      return;
    }
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      update({ notificationsEnabled: true });
      toast.success('Notifications enabled on this device');
    } else {
      toast.warning('Permission was not granted. You can change it in your browser’s site settings.');
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      if (!supported) {
        toast.warning('This browser does not support notifications.');
        return;
      }
      const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        toast.warning('Allow notifications first, then try again.');
        return;
      }
      if (!prefs.notificationsEnabled) update({ notificationsEnabled: true });
      const { sendTestReminderNotification } = await import('@/features/calendar/useReminders');
      const { REMINDER_IMAGE, buildTestReminderCopy } = await import('@/features/calendar/reminderCopy');
      const copy = buildTestReminderCopy();
      toast.reminder({ title: copy.title, body: copy.body, image: REMINDER_IMAGE });
      const ok = await sendTestReminderNotification();
      if (!ok) toast.warning('In-app reminder shown, but the system notification could not be sent on this device.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Reminders & notifications" icon={<Bell className="h-4 w-4" />} />
      <div className="space-y-4 px-5 pb-5 text-sm">
        <Switch
          checked={prefs.notificationsEnabled && permission === 'granted'}
          onChange={(v) => void toggle(v)}
          label="System notifications"
          description={`Browser permission: ${supported ? permission : 'not supported'}`}
        />
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-indigo-50 p-3 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-indigo-500/10">
          <img src="/reminder-cartoon.jpg" alt="" className="h-14 w-14 rounded-xl object-cover shadow-sm" width={56} height={56} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Cartoon reminder alerts</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              Calendar and task reminders show a friendly card in the app and a system notification with this artwork.
            </p>
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" loading={testing} onClick={() => void sendTest()}>
          Send test reminder
        </Button>
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-medium">How reminders work</p>
          <p className="mt-1">
            Set a reminder on a calendar item or a task (due date, optional due time, and remind-before). While Personal Hub is open (tab or
            installed app), due reminders appear as in-app cards and, if enabled, system notifications. When the app is fully closed, browsers
            cannot deliver these without a paid push server.
          </p>
        </div>
      </div>
    </Card>
  );
}

function DashboardSection() {
  const { prefs, update } = usePreferences();
  return (
    <Card>
      <CardHeader title="Dashboard widgets" icon={<LayoutDashboard className="h-4 w-4" />} />
      <div className="space-y-3 px-5 pb-5">
        {(Object.keys(WIDGET_LABELS) as Exclude<DashboardWidget, 'sync'>[]).map((key) => (
          <Switch
            key={key}
            label={WIDGET_LABELS[key]}
            checked={prefs.dashboardWidgets[key]}
            onChange={(v) => update({ dashboardWidgets: { ...prefs.dashboardWidgets, [key]: v } })}
          />
        ))}
      </div>
    </Card>
  );
}

async function hardRefreshAppShell() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
}

function SyncSection() {
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <Card>
      <CardHeader title="Sync & storage" icon={<Wifi className="h-4 w-4" />} action={<SyncIndicator />} />
      <div className="space-y-4 px-5 pb-5 text-sm">
        <SyncDetails />
        <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
          <p className="font-medium text-slate-800 dark:text-slate-200">Where your data lives</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>All notes, tasks, bookmarks, events, documents and settings are stored only in Cloud Firestore.</li>
            <li>This device keeps a temporary copy in memory while the app is open; nothing is saved to the device’s disk.</li>
            <li>Offline, the app still opens but editing is paused, because changes could not be saved safely.</li>
            <li>If the same note is edited on two devices, you will be asked which version to keep — nothing is silently overwritten. Other items use the most recent change.</li>
            <li>Firestore is not a backup of itself: export regularly.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-800 dark:text-slate-200">Installed app looking stale?</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Clears this device’s offline app shell (not your Firestore data) and reloads the latest version. Use this if the assistant works in Chrome but not in the home-screen app.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" />}
            loading={refreshing}
            onClick={() => {
              setRefreshing(true);
              void hardRefreshAppShell().catch(() => {
                setRefreshing(false);
                toast.error('Could not refresh the app shell. Try again.');
              });
            }}
          >
            Refresh app cache
          </Button>
        </div>
      </div>
    </Card>
  );
}

function InstallSection() {
  const { canInstall, install, installed } = useInstallPrompt();
  return (
    <Card>
      <CardHeader title="Install the app" icon={<Smartphone className="h-4 w-4" />} />
      <div className="space-y-3 px-5 pb-5 text-sm text-slate-600 dark:text-slate-400">
        {installed ? (
          <p>Personal Hub is running as an installed app.</p>
        ) : canInstall ? (
          <Button onClick={() => void install()}>Install Personal Hub</Button>
        ) : (
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>Android (Chrome):</strong> menu ⋮ → <em>Add to Home screen</em> / <em>Install app</em>.
            </li>
            <li>
              <strong>Desktop (Chrome/Edge):</strong> click the install icon in the address bar.
            </li>
            <li>
              <strong>iPhone/iPad (Safari):</strong> Share → <em>Add to Home Screen</em>.
            </li>
          </ul>
        )}
      </div>
    </Card>
  );
}

function SecuritySection() {
  const { user, role } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const state = useSyncState();
  const pending = state.inFlightWrites > 0 || state.snapshotPending;
  const providers = user.providerData.map((p) => (p.providerId === 'google.com' ? 'Google' : p.providerId));

  const signOut = async (clear: boolean) => {
    if (clear && pending) {
      const ok = await confirm({
        title: 'Unsynced changes',
        message: 'Some changes have not reached the cloud yet. Removing this device’s data now will lose them. Continue?',
        confirmLabel: 'Sign out and delete',
        danger: true,
      });
      if (!ok) return;
    }
    await signOutEverywhereLocal(queryClient, clear);
  };

  return (
    <Card>
      <CardHeader title="Account security" icon={<KeyRound className="h-4 w-4" />} />
      <div className="space-y-4 px-5 pb-5 text-sm">
        <dl className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex justify-between gap-4">
            <dt>Sign-in methods</dt>
            <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{providers.join(', ') || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Last sign-in</dt>
            <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
              {user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Role</dt>
            <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{role === 'admin' ? 'Admin' : 'Member'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>User ID</dt>
            <dd className="truncate text-right font-mono">{user.uid}</dd>
          </div>
        </dl>
        {role === 'admin' ? (
          <p className="text-xs text-slate-500">
            Access is managed only in the Firestore Security Rules (<code>npm run access:list</code>, <code>member:add</code>,{' '}
            <code>member:remove</code>, then test and deploy the rules). Each account has its own private workspace; your role does not
            grant access to a member’s data in the app.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Your workspace is private to your account: other users of this app cannot read it. Access is managed by the admin. Note that the
            Firebase project’s owners can still see stored data in the Firebase Console.
          </p>
        )}
        <p className="text-xs text-slate-500">
          You sign in with Google. Protect your Google account with 2-Step Verification; manage it at myaccount.google.com.
        </p>
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row dark:border-slate-800">
          <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut(false)}>
            Sign out
          </Button>
          <Button variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut(true)}>
            Sign out & remove data from this device
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Use “remove data” on shared or borrowed devices: it also clears any copy left by older versions of the app. Your Firestore data is not affected.
        </p>
      </div>
    </Card>
  );
}
