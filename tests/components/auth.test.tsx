import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  listener: null as null | ((u: unknown) => void),
  signInWithGoogle: vi.fn(),
  completeRedirect: vi.fn(),
}));

vi.mock('@/features/auth/authService', () => ({
  authService: {
    onChange: (cb: (u: unknown) => void) => {
      authMock.listener = cb;
      cb(null);
      return () => {};
    },
    signInWithGoogle: authMock.signInWithGoogle,
    completeRedirect: authMock.completeRedirect,
    signOut: vi.fn(),
  },
}));

import { AuthProvider } from '@/features/auth/AuthProvider';
import SignInPage from '@/features/auth/SignInPage';

const authError = (code: string) => Object.assign(new Error(code), { code });

function renderSignIn() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/signin']}>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/" element={<p>Workspace home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('Google-only sign-in page', () => {
  beforeEach(() => {
    authMock.signInWithGoogle.mockReset().mockResolvedValue(undefined);
    authMock.completeRedirect.mockReset().mockResolvedValue(undefined);
  });

  it('offers only "Continue with Google" — no email, password, sign-up or reset UI', () => {
    renderSignIn();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /forgot password/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('starts Google sign-in when the button is clicked', async () => {
    renderSignIn();
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(authMock.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('shows a friendly error when sign-in fails', async () => {
    authMock.signInWithGoogle.mockRejectedValueOnce(authError('auth/popup-closed-by-user'));
    renderSignIn();
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The Google sign-in window was closed before finishing.');
  });

  it('reports an error returned from a sign-in redirect', async () => {
    authMock.completeRedirect.mockRejectedValueOnce(authError('auth/unauthorized-domain'));
    renderSignIn();
    expect(await screen.findByRole('alert')).toHaveTextContent(/domain is not authorised/i);
  });

  it('redirects to the workspace once a user is signed in', async () => {
    renderSignIn();
    act(() => authMock.listener?.({ uid: 'u1', email: 'me@example.com' }));
    expect(await screen.findByText('Workspace home')).toBeInTheDocument();
  });
});
