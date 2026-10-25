import type { ReactNode } from 'react';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-400/25 via-violet-400/20 to-transparent blur-3xl dark:from-indigo-600/25 dark:via-violet-700/20" />
      </div>
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" width={48} height={48} className="mb-4 h-12 w-12" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="card p-6 sm:p-7">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">Private workspace · Authorised owner only</p>
      </div>
    </main>
  );
}
