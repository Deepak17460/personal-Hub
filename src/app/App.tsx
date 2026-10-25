import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 60_000 },
  },
});

function NotConfigured() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-lg p-8">
        <h1 className="text-lg font-semibold">Firebase is not configured</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env.local</code> and fill in your Firebase web
          app settings, or set the same variables in Cloudflare Pages. See <code className="font-mono">docs/DEPLOYMENT.md</code>.
        </p>
      </div>
    </main>
  );
}

export function App() {
  if (!isFirebaseConfigured) return <NotConfigured />;
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Suspense fallback={<FullScreenLoader />}>
                <RouterProvider router={router} />
              </Suspense>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
