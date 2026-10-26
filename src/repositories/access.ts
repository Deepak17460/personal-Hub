import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { errorCode } from '@/lib/firebase/errors';

export type Role = 'admin' | 'member';

/**
 * Asks the Security Rules whether the signed-in user is an admin: only admins may read
 * `access/admin` (the document does not need to exist). Call only after the user's own data
 * was readable, i.e. they are an admin or a member. The role only shapes the UI; the rules
 * remain the access boundary.
 */
export async function loadRole(db: Firestore): Promise<Role> {
  try {
    await getDoc(doc(db, 'access', 'admin'));
    return 'admin';
  } catch (error) {
    if (errorCode(error) === 'permission-denied') return 'member';
    throw error;
  }
}
