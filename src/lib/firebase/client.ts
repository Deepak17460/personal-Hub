import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import { featureFlags, firebaseConfig, isFirebaseConfigured } from './config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function init(): void {
  if (app || !isFirebaseConfigured) return;
  app = initializeApp(firebaseConfig);

  // Session is persisted in IndexedDB (never localStorage); falls back to memory if unavailable.
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, inMemoryPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });

  // Firestore's own offline cache (IndexedDB, private to this origin and browser profile).
  // Queued writes survive reloads and sync automatically after reconnecting.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });

  if (featureFlags.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

export function getFirebaseAuth(): Auth {
  init();
  if (!auth) throw new Error('Firebase is not configured. See .env.example.');
  return auth;
}

export function getDb(): Firestore {
  init();
  if (!db) throw new Error('Firebase is not configured. See .env.example.');
  return db;
}

/**
 * Removes this device's offline copy of Firestore data. Firestore must be terminated first,
 * so the page is reloaded afterwards to get a fresh instance.
 */
export async function clearLocalFirestoreCache(): Promise<void> {
  if (!db) return;
  await terminate(db);
  await clearIndexedDbPersistence(db);
}
