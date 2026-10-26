import { collection, doc, type CollectionReference, type DocumentReference, type Firestore } from 'firebase/firestore';
import type { CollectionName } from '@/types/models';

/** All private data lives under users/{uid}/..., and rules only let an allowlisted user reach their own uid. */
export function colRef(db: Firestore, uid: string, name: CollectionName): CollectionReference {
  return collection(db, 'users', uid, name);
}

export function docRef(db: Firestore, uid: string, name: CollectionName, id: string): DocumentReference {
  return doc(db, 'users', uid, name, id);
}

export function preferencesRef(db: Firestore, uid: string): DocumentReference {
  return doc(db, 'users', uid, 'settings', 'preferences');
}

export function newDocId(db: Firestore, uid: string, name: CollectionName): string {
  return doc(colRef(db, uid, name)).id;
}
