import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { firebaseConfig } from '@/lib/firebase/config';
import { errorCode } from '@/lib/firebase/errors';

/** Popup failures where a full-page redirect is the only remaining way to sign in. */
const REDIRECT_FALLBACK_CODES = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']);

/**
 * A redirect only completes reliably when the auth handler is served from the app's own origin
 * (e.g. the app is opened on <project>.firebaseapp.com or a domain whose authDomain points to
 * it); otherwise browsers that partition third-party storage lose the result.
 */
export function authHandlerIsSameOrigin(hostname: string = window.location.hostname): boolean {
  return firebaseConfig.authDomain.toLowerCase() === hostname.toLowerCase();
}

/** Installed PWAs and touch devices get a full-page redirect instead of a popup when it is safe. */
export function prefersRedirect(): boolean {
  if (!authHandlerIsSameOrigin()) return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const touchOnly = window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(pointer: fine)').matches;
  return Boolean(standalone || touchOnly);
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/** Thin wrapper around Firebase Auth so UI code (and tests) do not depend on the SDK directly. */
export const authService = {
  onChange(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(getFirebaseAuth(), callback);
  },

  /** Google is the only sign-in method. Resolves once signed in, or when a redirect has started. */
  async signInWithGoogle(): Promise<void> {
    const auth = getFirebaseAuth();
    const provider = googleProvider();
    if (prefersRedirect()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (REDIRECT_FALLBACK_CODES.has(errorCode(error) ?? '')) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  },

  /** Surfaces errors from a sign-in redirect that returned to the app; success arrives via onChange. */
  async completeRedirect(): Promise<void> {
    await getRedirectResult(getFirebaseAuth());
  },

  async signOut(): Promise<void> {
    await signOut(getFirebaseAuth());
  },

  async updateDisplayName(user: User, displayName: string): Promise<void> {
    await updateProfile(user, { displayName: displayName.trim() || null });
  },
};
