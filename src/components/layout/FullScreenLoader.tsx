import { Loader2 } from 'lucide-react';

export function FullScreenLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading page">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" aria-hidden />
    </div>
  );
}
