import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, KeyRound, LayoutDashboard, LogOut, Monitor, Moon, Palette, Smartphone, Sun, User, Wifi } from 'lucide-react';
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

const WIDGET_LABELS: Record<DashboardWidget, string> = {
  stats: 'Task summary',
  quickActions: 'Quick actions',
  tasks: "Today's tasks",
  reminders: 'Upcoming events & reminders',
  notes: 'Recent notes',
  bookmarks: 'Pinned bookmarks',
  recent: 'Recently modified',
  sync: 'Sync & storage',
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
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-medium">How reminders work</p>
          <p className="mt-1">
            Reminders are checked by the app while it is open (in a tab or as an installed app). They appear as in-app alerts and, if enabled, as system
            notifications. When the app is fully closed, no reminders are delivered — this app does not use a paid push-notification server.
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
        {(Object.keys(WIDGET_LABELS) as DashboardWidget[]).map((key) => (
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

function SyncSection() {
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
  const { user } = useSession();
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
            <dt>User ID</dt>
            <dd className="truncate text-right font-mono">{user.uid}</dd>
          </div>
        </dl>
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
