import { getDoc, serverTimestamp, setDoc, type DocumentSnapshot, type Firestore } from 'firebase/firestore';
import { preferencesSchema } from '@/schemas/entities';
import { trackWrite } from '@/lib/sync/syncStore';
import type { Preferences } from '@/types/models';
import { preferencesRef } from './paths';

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  notificationsEnabled: false,
  weekStartsOn: 1,
  dashboardWidgets: {
    stats: true,
    quickActions: true,
    tasks: true,
    reminders: true,
    notes: true,
    bookmarks: true,
    recent: true,
    sync: true,
  },
  schemaVersion: 1,
};

export function mapPreferences(snap: DocumentSnapshot): Preferences {
  const raw = snap.data() ?? {};
  const merged = {
    ...DEFAULT_PREFERENCES,
    ...raw,
    dashboardWidgets: { ...DEFAULT_PREFERENCES.dashboardWidgets, ...(raw.dashboardWidgets ?? {}) },
  };
  const parsed = preferencesSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}

/**
 * Authorisation probe used right after sign-in. Rules only let the allowlisted owner read
 * this document, so `permission-denied` here means the signed-in account is not the owner.
 */
export async function loadPreferences(db: Firestore, uid: string): Promise<Preferences> {
  const snap = await getDoc(preferencesRef(db, uid));
  if (!snap.exists()) {
    void savePreferences(db, uid, DEFAULT_PREFERENCES);
    return DEFAULT_PREFERENCES;
  }
  return mapPreferences(snap);
}

export function savePreferences(db: Firestore, uid: string, prefs: Preferences): Promise<void> {
  const valid = preferencesSchema.parse(prefs);
  return trackWrite(() => setDoc(preferencesRef(db, uid), { ...valid, updatedAt: serverTimestamp() }));
}
