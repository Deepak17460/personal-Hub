import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, LogOut, ShieldAlert, WifiOff } from 'lucide-react';
import { getDb } from '@/lib/firebase/client';
import { errorCode } from '@/lib/firebase/errors';
import { loadPreferences } from '@/repositories/preferences';
import { Button } from '@/components/ui/Button';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { useAuth } from './AuthProvider';
import { SessionProvider } from './session';
import { signOutEverywhereLocal } from './signOut';

/**
 * Route guard: requires a signed-in user AND verifies with Firestore that this UID is on the
 * owner allowlist (enforced by Security Rules). Hiding UI is never the security boundary.
 */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  const probe = useQuery({
    queryKey: ['owner-probe', user?.uid],
    queryFn: () => loadPreferences(getDb(), user!.uid),
    enabled: Boolean(user),
    retry: (count, error) => errorCode(error) !== 'permission-denied' && count < 2,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (loading) return <FullScreenLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (probe.isPending) return <FullScreenLoader label="Opening your workspace…" />;

  if (probe.isError) {
    const code = errorCode(probe.error);
    if (code === 'permission-denied') {
      return <NotAuthorized uid={user.uid} email={user.email} onSignOut={() => void signOutEverywhereLocal(queryClient, false)} />;
    }
    return (
      <StatusScreen
        icon={<WifiOff className="h-6 w-6" />}
        title="Can't reach your workspace"
        message="You appear to be offline and this device has no saved copy of your data yet. Connect to the internet once to enable offline access."
        action={<Button onClick={() => void probe.refetch()}>Try again</Button>}
      />
    );
  }

  return <SessionProvider value={{ user, uid: user.uid, db: getDb() }}>{children}</SessionProvider>;
}

function NotAuthorized({ uid, email, onSignOut }: { uid: string; email: string | null; onSignOut: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <StatusScreen
      icon={<ShieldAlert className="h-6 w-6" />}
      title="This account is not authorised"
      message={`You are signed in${email ? ` as ${email}` : ''}, but this account is not on the owner allowlist in the Firestore Security Rules. If this is your owner account, add the UID below with "npm run owner:set" and deploy the rules.`}
      action={
        <div className="flex w-full flex-col items-center gap-3">
          <code className="w-full rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs break-all text-slate-700 dark:bg-slate-800 dark:text-slate-200">{uid}</code>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={<Copy className="h-4 w-4" />}
              onClick={() => {
                void navigator.clipboard?.writeText(uid).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy UID'}
            </Button>
            <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      }
    />
  );
}

export function StatusScreen({ icon, title, message, action }: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          {icon}
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{message}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </main>
  );
}
