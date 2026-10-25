import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/Button';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { friendlyAuthError } from '@/lib/firebase/errors';
import { authService } from './authService';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';

export default function SignInPage() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader label="Checking your session…" />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith('/') ? from : '/'} replace />;
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your Personal Hub">
      <GoogleSignIn />
      <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
        Only the owner&apos;s Google account can open this workspace. Other accounts can sign in but cannot see any data.
      </p>
    </AuthLayout>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      {message}
    </div>
  );
}

function GoogleSignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authService.completeRedirect().catch((e: unknown) => setError(friendlyAuthError(e)));
  }, []);

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <Button
        variant="secondary"
        className="w-full"
        loading={busy}
        autoFocus
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await authService.signInWithGoogle();
          } catch (e) {
            setError(friendlyAuthError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
        </svg>
        Continue with Google
      </Button>
    </div>
  );
}
