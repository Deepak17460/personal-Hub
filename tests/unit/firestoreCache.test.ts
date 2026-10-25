import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
let releasePendingWrites: () => void = () => undefined;
let clearFails = false;

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  browserPopupRedirectResolver: {},
  connectAuthEmulator: vi.fn(),
  indexedDBLocalPersistence: 'idb-auth',
  inMemoryPersistence: 'memory-auth',
  initializeAuth: (_app: unknown, opts: unknown) => ({ opts }),
}));
vi.mock('firebase/firestore', () => ({
  memoryLocalCache: () => ({ kind: 'memory' }),
  persistentLocalCache: () => ({ kind: 'persistent' }),
  persistentMultipleTabManager: () => ({}),
  initializeFirestore: (_app: unknown, settings: { localCache: { kind: string } }) => {
    calls.push(`init:${settings.localCache.kind}`);
    return { settings };
  },
  connectFirestoreEmulator: vi.fn(),
  waitForPendingWrites: () => {
    calls.push('wait');
    return new Promise<void>((r) => (releasePendingWrites = r));
  },
  terminate: async () => void calls.push('terminate'),
  clearIndexedDbPersistence: async () => {
    calls.push('clear');
    if (clearFails) throw Object.assign(new Error('in use'), { code: 'failed-precondition' });
  },
}));
vi.mock('@/lib/firebase/config', () => ({
  featureFlags: { useEmulators: false },
  firebaseConfig: { projectId: 'personal-hub-ea5ea' },
  isFirebaseConfigured: true,
}));

function stubDatabases(names: string[]) {
  vi.stubGlobal('indexedDB', { databases: async () => names.map((name) => ({ name, version: 1 })) });
}

async function freshClient() {
  vi.resetModules();
  return import('@/lib/firebase/client');
}

describe('Firestore cache mode', () => {
  beforeEach(() => {
    calls.length = 0;
    clearFails = false;
    localStorage.clear();
  });

  it('uses the memory-only cache when no legacy IndexedDB cache exists', async () => {
    stubDatabases(['firebaseLocalStorageDb']);
    const client = await freshClient();
    expect(await client.chooseFirestoreCacheMode()).toBe('memory');
    client.getDb();
    expect(calls).toEqual(['init:memory']);
    expect(await client.retireLegacyOfflineCache()).toBe('not-needed');
  });

  it('opens a legacy cache only to drain it, deleting it after Firestore confirms queued writes', async () => {
    stubDatabases(['firestore/[DEFAULT]/personal-hub-ea5ea/main']);
    localStorage.setItem('firestore_clients_firestore/[DEFAULT]/personal-hub-ea5ea/_abc', '{}');
    localStorage.setItem('ph-theme', 'dark');
    const client = await freshClient();
    expect(await client.chooseFirestoreCacheMode()).toBe('legacy');
    client.getDb();

    const result = client.retireLegacyOfflineCache();
    await Promise.resolve();
    expect(calls).toEqual(['init:persistent', 'wait']);

    releasePendingWrites();
    expect(await result).toBe('retired');
    expect(calls).toEqual(['init:persistent', 'wait', 'terminate', 'clear']);
    expect(localStorage.getItem('firestore_clients_firestore/[DEFAULT]/personal-hub-ea5ea/_abc')).toBeNull();
    expect(localStorage.getItem('ph-theme')).toBe('dark');
  });

  it('keeps the legacy cache when another tab still has it open', async () => {
    stubDatabases(['firestore/[DEFAULT]/personal-hub-ea5ea/main']);
    clearFails = true;
    const client = await freshClient();
    await client.chooseFirestoreCacheMode();
    client.getDb();
    const result = client.retireLegacyOfflineCache();
    releasePendingWrites();
    expect(await result).toBe('other-tabs-open');
  });

  it('falls back to memory when the browser cannot list databases', async () => {
    vi.stubGlobal('indexedDB', {});
    const client = await freshClient();
    expect(await client.chooseFirestoreCacheMode()).toBe('memory');
  });

  it('persists only the auth session in IndexedDB (never localStorage)', async () => {
    stubDatabases([]);
    const client = await freshClient();
    const auth = client.getFirebaseAuth() as unknown as { opts: { persistence: string[] } };
    expect(auth.opts.persistence).toEqual(['idb-auth', 'memory-auth']);
  });
});
