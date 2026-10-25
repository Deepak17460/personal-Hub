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
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore';
import { featureFlags, firebaseConfig, isFirebaseConfigured } from './config';

/**
 * - `memory`: Firestore is the only persistent store; the SDK keeps documents in memory only.
 * - `legacy`: this device still has the IndexedDB cache written by earlier versions of the app.
 *   It is opened once more so any changes queued in it can upload, then deleted
 *   (see `retireLegacyOfflineCache`).
 */
export type FirestoreCacheMode = 'memory' | 'legacy';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let cacheMode: FirestoreCacheMode = 'memory';

function init(): void {
  if (app || !isFirebaseConfigured) return;
  app = initializeApp(firebaseConfig);

  // Only the sign-in session is persisted (IndexedDB, never localStorage); falls back to memory.
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, inMemoryPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });

  db = initializeFirestore(app, {
    localCache: cacheMode === 'legacy' ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache(),
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

export function getCacheMode(): FirestoreCacheMode {
  return cacheMode;
}

/** IndexedDB database name used by Firestore's persistent cache for the default database. */
export function legacyCacheDbName(projectId = firebaseConfig.projectId): string {
  return `firestore/[DEFAULT]/${projectId}/main`;
}

/**
 * Must run before the first `getDb()`. Selects the legacy cache only when an old IndexedDB cache
 * for this project exists, so it can be drained; otherwise nothing is ever written to IndexedDB.
 */
export async function chooseFirestoreCacheMode(): Promise<FirestoreCacheMode> {
  if (db || !isFirebaseConfigured) return cacheMode;
  cacheMode = (await legacyCacheExists()) ? 'legacy' : 'memory';
  return cacheMode;
}

async function legacyCacheExists(): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return false;
  try {
    const name = legacyCacheDbName();
    return (await indexedDB.databases()).some((d) => d.name === name);
  } catch {
    return false;
  }
}

/** Multi-tab coordination entries the persistent cache kept in localStorage (no record content). */
function removeLegacyTabKeys(): void {
  try {
    const project = firebaseConfig.projectId;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('firestore_') && key.includes(project)) localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable */
  }
}

export type LegacyRetireResult = 'not-needed' | 'retired' | 'other-tabs-open';

/**
 * Waits until the server has acknowledged every write still queued in the legacy cache, then
 * deletes that cache. Never deletes anything that has not been confirmed by Firestore: if the
 * device is offline the promise simply waits. The caller reloads the page afterwards so the app
 * continues with the memory-only cache.
 */
export async function retireLegacyOfflineCache(): Promise<LegacyRetireResult> {
  if (cacheMode !== 'legacy' || !db) return 'not-needed';
  await waitForPendingWrites(db);
  await terminate(db);
  try {
    await clearIndexedDbPersistence(db);
  } catch {
    // Another tab still holds the cache open; its writes are confirmed, retry on the next start.
    return 'other-tabs-open';
  }
  removeLegacyTabKeys();
  return 'retired';
}

/**
 * Stops Firestore and removes any Firestore data stored by earlier versions on this device.
 * The page is reloaded afterwards to get a fresh instance.
 */
export async function clearLocalFirestoreCache(): Promise<void> {
  if (!db) return;
  await terminate(db);
  await clearIndexedDbPersistence(db);
  removeLegacyTabKeys();
}
