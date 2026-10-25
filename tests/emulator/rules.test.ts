import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { buildCreateData } from '@/repositories/records';
import { buildNoteCreateData, buildNoteUpdateData, EMPTY_NOTE } from '@/repositories/notes';
import { DEFAULT_PREFERENCES } from '@/repositories/preferences';
import { EMPTY_TASK } from '@/repositories/tasks';
import { GOOGLE_TOKEN, OWNER, STRANGER, ownerDb, setupEnv } from './helpers';

let env: RulesTestEnvironment;
let owner: Firestore;
let stranger: Firestore;
let anon: Firestore;

const notePath = (uid: string, id = 'n1') => `users/${uid}/notes/${id}`;
const taskData = (id: string, patch: Record<string, unknown> = {}) => ({ ...buildCreateData('tasks', id, { ...EMPTY_TASK, title: 'Task' }), ...patch });
const bookmarkData = (id: string, url = 'https://example.com') =>
  buildCreateData('bookmarks', id, { url, title: 'B', description: '', category: '', tags: [], favorite: false });

beforeAll(async () => {
  env = await setupEnv('demo-rules-test');
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  owner = ownerDb(env);
  stranger = env.authenticatedContext(STRANGER, GOOGLE_TOKEN).firestore() as unknown as Firestore;
  anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
});

describe('access control', () => {
  it('lets the allowlisted owner create, read, list and delete their notes', async () => {
    await assertSucceeds(setDoc(doc(owner, notePath(OWNER)), buildNoteCreateData('n1', { ...EMPTY_NOTE, title: 'Hi' }, 'rev1')));
    await assertSucceeds(getDoc(doc(owner, notePath(OWNER))));
    await assertSucceeds(getDocs(collection(owner, `users/${OWNER}/notes`)));
    await assertSucceeds(deleteDoc(doc(owner, notePath(OWNER))));
  });

  it('denies unauthenticated users everything', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), notePath(OWNER)), { title: 'secret' });
    });
    await assertFails(getDoc(doc(anon, notePath(OWNER))));
    await assertFails(getDocs(collection(anon, `users/${OWNER}/notes`)));
    await assertFails(setDoc(doc(anon, notePath(OWNER, 'x')), buildNoteCreateData('x', EMPTY_NOTE, 'r')));
  });

  it("denies other signed-in users access to the owner's records", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), notePath(OWNER)), { title: 'secret' });
    });
    await assertFails(getDoc(doc(stranger, notePath(OWNER))));
    await assertFails(getDocs(collection(stranger, `users/${OWNER}/notes`)));
    await assertFails(deleteDoc(doc(stranger, notePath(OWNER))));
    await assertFails(setDoc(doc(stranger, notePath(OWNER, 'evil')), buildNoteCreateData('evil', EMPTY_NOTE, 'r')));
  });

  it('denies the owner UID when it did not sign in with Google', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), notePath(OWNER)), { title: 'secret' });
    });
    for (const provider of ['password', 'anonymous', 'custom', 'phone'] as const) {
      const other = env.authenticatedContext(OWNER, { firebase: { sign_in_provider: provider } }).firestore() as unknown as Firestore;
      await assertFails(getDoc(doc(other, notePath(OWNER))));
      await assertFails(setDoc(doc(other, notePath(OWNER, 'x')), buildNoteCreateData('x', EMPTY_NOTE, 'r')));
    }
  });

  it('denies a non-allowlisted user even inside their own user path', async () => {
    await assertFails(setDoc(doc(stranger, notePath(STRANGER)), buildNoteCreateData('n1', EMPTY_NOTE, 'r')));
    await assertFails(getDoc(doc(stranger, `users/${STRANGER}/settings/preferences`)));
  });

  it('denies access to paths outside users/{uid}', async () => {
    await assertFails(setDoc(doc(owner, 'public/anything'), { a: 1 }));
    await assertFails(getDoc(doc(owner, 'config/owner')));
    await assertFails(setDoc(doc(owner, `users/${OWNER}`), { a: 1 }));
    await assertFails(setDoc(doc(owner, `users/${OWNER}/secrets/x`), { a: 1 }));
  });
});

describe('data validation', () => {
  it('requires the document id field to match the path', async () => {
    await assertFails(setDoc(doc(owner, notePath(OWNER, 'a')), buildNoteCreateData('b', EMPTY_NOTE, 'r')));
  });

  it('rejects unknown fields and wrong types', async () => {
    await assertFails(setDoc(doc(owner, notePath(OWNER)), { ...buildNoteCreateData('n1', EMPTY_NOTE, 'r'), isAdmin: true }));
    await assertFails(setDoc(doc(owner, notePath(OWNER)), { ...buildNoteCreateData('n1', EMPTY_NOTE, 'r'), pinned: 'yes' }));
    await assertFails(setDoc(doc(owner, `users/${OWNER}/tasks/t1`), taskData('t1', { priority: 'urgent' })));
    await assertFails(setDoc(doc(owner, `users/${OWNER}/tasks/t1`), taskData('t1', { dueDate: '10/03/2024' })));
    await assertFails(setDoc(doc(owner, `users/${OWNER}/tasks/t1`), taskData('t1', { title: '' })));
    await assertSucceeds(setDoc(doc(owner, `users/${OWNER}/tasks/t1`), taskData('t1')));
  });

  it('rejects unsafe bookmark URL schemes', async () => {
    await assertFails(setDoc(doc(owner, `users/${OWNER}/bookmarks/b1`), { ...bookmarkData('b1'), url: 'javascript:alert(1)' }));
    await assertFails(setDoc(doc(owner, `users/${OWNER}/bookmarks/b1`), { ...bookmarkData('b1'), url: 'data:text/html,x' }));
    await assertSucceeds(setDoc(doc(owner, `users/${OWNER}/bookmarks/b1`), bookmarkData('b1')));
  });

  it('rejects oversized content and too many tags', async () => {
    await assertFails(setDoc(doc(owner, notePath(OWNER)), { ...buildNoteCreateData('n1', EMPTY_NOTE, 'r'), content: 'x'.repeat(100_001) }));
    await assertFails(setDoc(doc(owner, notePath(OWNER)), { ...buildNoteCreateData('n1', EMPTY_NOTE, 'r'), tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }));
  });

  it('keeps createdAt immutable and forces server time on updatedAt', async () => {
    await assertSucceeds(setDoc(doc(owner, `users/${OWNER}/tasks/t1`), taskData('t1')));
    await assertFails(updateDoc(doc(owner, `users/${OWNER}/tasks/t1`), { createdAt: Timestamp.fromDate(new Date('2000-01-01')), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(owner, `users/${OWNER}/tasks/t1`), { title: 'x', updatedAt: Timestamp.fromDate(new Date('2000-01-01')) }));
    await assertSucceeds(updateDoc(doc(owner, `users/${OWNER}/tasks/t1`), { title: 'x', updatedAt: serverTimestamp() }));
  });

  it('rejects timestamps in the future on create', async () => {
    const future = Timestamp.fromDate(new Date(Date.now() + 3 * 3600_000));
    await assertFails(setDoc(doc(owner, `users/${OWNER}/tasks/t1`), taskData('t1', { createdAt: future })));
  });

  it('validates preferences', async () => {
    const ref = doc(owner, `users/${OWNER}/settings/preferences`);
    await assertSucceeds(setDoc(ref, { ...DEFAULT_PREFERENCES, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { ...DEFAULT_PREFERENCES, theme: 'neon', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(owner, `users/${OWNER}/settings/other`), { ...DEFAULT_PREFERENCES, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
  });
});

describe('note revision chain (conflict detection)', () => {
  it('accepts an edit based on the current revision and rejects a stale one', async () => {
    const ref = doc(owner, notePath(OWNER));
    await assertSucceeds(setDoc(ref, buildNoteCreateData('n1', { ...EMPTY_NOTE, title: 'v1' }, 'rev1')));
    // Device A edits based on rev1 -> rev2: accepted.
    await assertSucceeds(setDoc(ref, buildNoteUpdateData({ ...EMPTY_NOTE, title: 'A' }, 'rev1', 'rev2'), { merge: true }));
    // Device B was offline and also based its edit on rev1: rejected instead of overwriting A.
    await assertFails(setDoc(ref, buildNoteUpdateData({ ...EMPTY_NOTE, title: 'B' }, 'rev1', 'rev3'), { merge: true }));
    // B's second queued edit chained on its own rejected revision: also rejected.
    await assertFails(setDoc(ref, buildNoteUpdateData({ ...EMPTY_NOTE, title: 'B2' }, 'rev3', 'rev4'), { merge: true }));
    // Reusing the same revId is rejected.
    await assertFails(setDoc(ref, buildNoteUpdateData({ ...EMPTY_NOTE, title: 'A' }, 'rev2', 'rev2'), { merge: true }));
  });

  it('does not let an edit resurrect a deleted note without a full create', async () => {
    const ref = doc(owner, notePath(OWNER));
    await assertSucceeds(setDoc(ref, buildNoteCreateData('n1', EMPTY_NOTE, 'rev1')));
    await assertSucceeds(deleteDoc(ref));
    await assertFails(setDoc(ref, buildNoteUpdateData({ ...EMPTY_NOTE, title: 'late edit' }, 'rev1', 'rev2'), { merge: true }));
  });
});
