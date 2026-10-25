import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  listener: null as null | ((u: unknown) => void),
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('@/features/auth/authService', () => ({
  authService: {
    onChange: (cb: (u: unknown) => void) => {
      authMock.listener = cb;
      cb(null);
      return () => {};
    },
    signIn: authMock.signIn,
    signUp: authMock.signUp,
    resetPassword: authMock.resetPassword,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  },
}));

import { AuthProvider } from '@/features/auth/AuthProvider';
import SignInPage from '@/features/auth/SignInPage';
import ResetPasswordPage from '@/features/auth/ResetPasswordPage';

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<p>Workspace home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('sign-in flow', () => {
  beforeEach(() => {
    authMock.signIn.mockReset();
    authMock.resetPassword.mockReset();
  });

  it('validates input before calling Firebase', async () => {
    renderAt('/signin');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(authMock.signIn).not.toHaveBeenCalled();
  });

  it('submits credentials and shows a friendly error on failure', async () => {
    authMock.signIn.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/invalid-credential' }));
    renderAt('/signin');
    await userEvent.type(screen.getByLabelText('Email'), 'me@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(authMock.signIn).toHaveBeenCalledWith('me@example.com', 'secret-pass');
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });

  it('redirects to the workspace once a user is signed in', async () => {
    renderAt('/signin');
    act(() => authMock.listener?.({ uid: 'u1', email: 'me@example.com' }));
    expect(await screen.findByText('Workspace home')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    renderAt('/signin');
    const pwd = screen.getByLabelText('Password');
    expect(pwd).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pwd).toHaveAttribute('type', 'text');
  });

  it('sends a password reset without revealing whether the account exists', async () => {
    authMock.resetPassword.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/user-not-found' }));
    renderAt('/reset-password');
    await userEvent.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/if an account exists/i));
  });
});
