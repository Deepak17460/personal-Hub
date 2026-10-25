import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { errorCode } from '@/lib/firebase/errors';

/** Thin wrapper around Firebase Auth so UI code (and tests) do not depend on the SDK directly. */
export const authService = {
  onChange(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(getFirebaseAuth(), callback);
  },

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  },

  async signUp(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  },

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (error) {
      if (errorCode(error) === 'auth/popup-blocked') {
        await signInWithRedirect(getFirebaseAuth(), provider);
        return;
      }
      throw error;
    }
  },

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
  },

  async signOut(): Promise<void> {
    await signOut(getFirebaseAuth());
  },

  async updateDisplayName(user: User, displayName: string): Promise<void> {
    await updateProfile(user, { displayName: displayName.trim() || null });
  },
};
