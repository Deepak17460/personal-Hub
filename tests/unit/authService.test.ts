import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signOut: vi.fn(),
  config: { apiKey: 'k', authDomain: 'personal-hub-ea5ea.firebaseapp.com', projectId: 'p', appId: 'a' },
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    providerId = 'google.com';
    params: Record<string, string> = {};
    setCustomParameters(p: Record<string, string>) {
      this.params = p;
    }
  },
  signInWithPopup: fb.signInWithPopup,
  signInWithRedirect: fb.signInWithRedirect,
  getRedirectResult: fb.getRedirectResult,
  signOut: fb.signOut,
  onAuthStateChanged: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('@/lib/firebase/client', () => ({ getFirebaseAuth: () => ({ name: 'auth' }) }));
vi.mock('@/lib/firebase/config', () => ({ firebaseConfig: fb.config }));

import { authHandlerIsSameOrigin, authService, prefersRedirect } from '@/features/auth/authService';

const authError = (code: string) => Object.assign(new Error(code), { code });

function setPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === '(pointer: coarse)' ? coarse : query === '(pointer: fine)' ? !coarse : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

describe('authService Google sign-in', () => {
  beforeEach(() => {
    for (const f of [fb.signInWithPopup, fb.signInWithRedirect, fb.getRedirectResult, fb.signOut]) f.mockReset().mockResolvedValue(undefined);
    setPointer(false);
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('uses a Google popup with the account chooser', async () => {
    await authService.signInWithGoogle();
    expect(fb.signInWithPopup).toHaveBeenCalledOnce();
    const provider = fb.signInWithPopup.mock.calls[0]![1] as { providerId: string; params: Record<string, string> };
    expect(provider.providerId).toBe('google.com');
    expect(provider.params).toEqual({ prompt: 'select_account' });
    expect(fb.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('falls back to a redirect when the popup is blocked or unsupported', async () => {
    for (const code of ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']) {
      fb.signInWithRedirect.mockClear();
      fb.signInWithPopup.mockRejectedValueOnce(authError(code));
      await authService.signInWithGoogle();
      expect(fb.signInWithRedirect).toHaveBeenCalledOnce();
    }
  });

  it('does not redirect when the user simply closes the popup', async () => {
    fb.signInWithPopup.mockRejectedValueOnce(authError('auth/popup-closed-by-user'));
    await expect(authService.signInWithGoogle()).rejects.toMatchObject({ code: 'auth/popup-closed-by-user' });
    expect(fb.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('prefers a redirect on touch devices only when the auth handler is same-origin', () => {
    setPointer(true);
    expect(authHandlerIsSameOrigin('personal-hub-ea5ea.firebaseapp.com')).toBe(true);
    expect(authHandlerIsSameOrigin('localhost')).toBe(false);
    // jsdom runs on localhost, so the auth handler is cross-origin and popups are kept.
    expect(prefersRedirect()).toBe(false);
  });

  it('signs out through Firebase signOut()', async () => {
    await authService.signOut();
    expect(fb.signOut).toHaveBeenCalledOnce();
  });

  it('reads the redirect result so errors can be shown', async () => {
    fb.getRedirectResult.mockRejectedValueOnce(authError('auth/unauthorized-domain'));
    await expect(authService.completeRedirect()).rejects.toMatchObject({ code: 'auth/unauthorized-domain' });
  });
});
