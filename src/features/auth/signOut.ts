import type { QueryClient } from '@tanstack/react-query';
import { clearLocalFirestoreCache } from '@/lib/firebase/client';
import { disposeAllLiveQueries } from '@/lib/firestore/liveQuery';
import { syncStore } from '@/lib/sync/syncStore';
import { authService } from './authService';

/**
 * Signs out. With `clearDeviceData` Firestore is shut down and any on-device cache left by older
 * versions is deleted too (recommended on shared devices). Unacknowledged writes are lost in that
 * case, so callers must warn first when changes are pending.
 */
export async function signOutEverywhereLocal(queryClient: QueryClient, clearDeviceData: boolean): Promise<void> {
  disposeAllLiveQueries();
  queryClient.clear();
  await authService.signOut();
  syncStore.reset();
  if (clearDeviceData) {
    try {
      await clearLocalFirestoreCache();
    } finally {
      window.location.assign('/signin');
    }
  }
}
