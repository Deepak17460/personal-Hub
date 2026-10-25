import { useState, type ComponentPropsWithRef } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { featureFlags } from '@/lib/firebase/config';
import { friendlyAuthError } from '@/lib/firebase/errors';
import { authService } from './authService';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';
import { signInSchema, signUpSchema, type SignInValues, type SignUpValues } from './authSchemas';

export default function SignInPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  if (loading) return <FullScreenLoader label="Checking your session…" />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith('/') ? from : '/'} replace />;
  }

  return (
    <AuthLayout
      title={mode === 'signin' ? 'Welcome back' : 'Create owner account'}
      subtitle={mode === 'signin' ? 'Sign in to your Personal Hub' : 'One-time setup for the workspace owner'}
    >
      {mode === 'signin' ? <SignInForm /> : <SignUpForm />}
      {featureFlags.googleSignIn && <GoogleButton />}
      {featureFlags.allowSignup && (
        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          {mode === 'signin' ? 'Setting up for the first time? ' : 'Already have an account? '}
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Create account' : 'Sign in'}
          </button>
        </p>
      )}
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

function PasswordInput(props: ComponentPropsWithRef<'input'> & { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await authService.signIn(values.email, values.password);
    } catch (e) {
      setError(friendlyAuthError(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError message={error} />
      <Field label="Email" error={errors.email?.message}>
        {(p) => <Input {...p} {...register('email')} type="email" autoComplete="username" inputMode="email" autoFocus />}
      </Field>
      <Field label="Password" error={errors.password?.message}>
        {(p) => <PasswordInput {...p} {...register('password')} autoComplete="current-password" />}
      </Field>
      <div className="flex justify-end">
        <Link to="/reset-password" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting} icon={<LogIn className="h-4 w-4" />}>
        Sign in
      </Button>
    </form>
  );
}

function SignUpForm() {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema), defaultValues: { email: '', password: '', confirm: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await authService.signUp(values.email, values.password);
    } catch (e) {
      setError(friendlyAuthError(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError message={error} />
      <Field label="Email" error={errors.email?.message}>
        {(p) => <Input {...p} {...register('email')} type="email" autoComplete="username" autoFocus />}
      </Field>
      <Field label="Password" error={errors.password?.message} hint="At least 12 characters. A passphrase works well.">
        {(p) => <PasswordInput {...p} {...register('password')} autoComplete="new-password" />}
      </Field>
      <Field label="Confirm password" error={errors.confirm?.message}>
        {(p) => <PasswordInput {...p} {...register('confirm')} autoComplete="new-password" />}
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting} icon={<UserPlus className="h-4 w-4" />}>
        Create account
      </Button>
    </form>
  );
}

function GoogleButton() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /> or <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>
      <FormError message={error} />
      <Button
        variant="secondary"
        className="w-full"
        loading={busy}
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
