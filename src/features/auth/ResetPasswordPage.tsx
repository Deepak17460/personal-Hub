import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { errorCode, friendlyAuthError } from '@/lib/firebase/errors';
import { authService } from './authService';
import { AuthLayout } from './AuthLayout';
import { resetSchema, type ResetValues } from './authSchemas';

export default function ResetPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await authService.resetPassword(email);
      setSent(true);
    } catch (e) {
      // Do not reveal whether an account exists for this address.
      if (errorCode(e) === 'auth/user-not-found') setSent(true);
      else setError(friendlyAuthError(e));
    }
  });

  return (
    <AuthLayout title="Reset password" subtitle="We'll email you a secure reset link">
      {sent ? (
        <div className="space-y-4 text-center" role="status">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.
          </p>
          <Link to="/signin" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}
          <Field label="Email" error={errors.email?.message}>
            {(p) => <Input {...p} {...register('email')} type="email" autoComplete="username" autoFocus />}
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
          <Link to="/signin" className="flex items-center justify-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
