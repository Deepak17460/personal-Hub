import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadRole } from '@/repositories/access';
import { buildCreateData } from '@/repositories/records';
import { buildNoteCreateData, EMPTY_NOTE } from '@/repositories/notes';
import { DEFAULT_PREFERENCES } from '@/repositories/preferences';
import { EMPTY_TASK } from '@/repositories/tasks';
import { GOOGLE_TOKEN, MEMBER, OWNER, STRANGER, memberDb, ownerDb, setupEnv } from './helpers';

let env: RulesTestEnvironment;
let admin: Firestore;
let member: Firestore;
let stranger: Firestore;

const COLLECTIONS = ['notes', 'tasks', 'bookmarks', 'documents', 'events'] as const;

async function seed(uid: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const c of COLLECTIONS) await setDoc(doc(db, `users/${uid}/${c}/seed`), { id: 'seed', title: `${uid} private` });
    await setDoc(doc(db, `users/${uid}/settings/preferences`), { theme: 'dark' });
  });
}

beforeAll(async () => {
  env = await setupEnv('demo-roles-test');
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  admin = ownerDb(env);
  member = memberDb(env);
  stranger = env.authenticatedContext(STRANGER, GOOGLE_TOKEN).firestore() as unknown as Firestore;
});

describe('member account', () => {
  it('can use its own workspace: preferences and CRUD on its records', async () => {
    const prefs = doc(member, `users/${MEMBER}/settings/preferences`);
    await assertSucceeds(getDoc(prefs));
    await assertSucceeds(setDoc(prefs, { ...DEFAULT_PREFERENCES, updatedAt: serverTimestamp() }));
    const note = doc(member, `users/${MEMBER}/notes/n1`);
    await assertSucceeds(setDoc(note, buildNoteCreateData('n1', { ...EMPTY_NOTE, title: 'Mine' }, 'rev1')));
    await assertSucceeds(getDocs(collection(member, `users/${MEMBER}/notes`)));
    const task = doc(member, `users/${MEMBER}/tasks/t1`);
    await assertSucceeds(setDoc(task, buildCreateData('tasks', 't1', { ...EMPTY_TASK, title: 'Task' })));
    await assertSucceeds(updateDoc(task, { title: 'Done', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(task));
    await assertSucceeds(deleteDoc(note));
  });

  it('is still subject to schema validation', async () => {
    await assertFails(setDoc(doc(member, `users/${MEMBER}/notes/n1`), { ...buildNoteCreateData('n1', EMPTY_NOTE, 'r'), isAdmin: true }));
  });

  it('must sign in with Google', async () => {
    const pw = env.authenticatedContext(MEMBER, { firebase: { sign_in_provider: 'password' } }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(pw, `users/${MEMBER}/settings/preferences`)));
    await assertFails(setDoc(doc(pw, `users/${MEMBER}/notes/n1`), buildNoteCreateData('n1', EMPTY_NOTE, 'r')));
  });
});

describe('isolation between users', () => {
  it("member cannot read, list, write or delete the admin's data", async () => {
    await seed(OWNER);
    for (const c of COLLECTIONS) {
      await assertFails(getDoc(doc(member, `users/${OWNER}/${c}/seed`)));
      await assertFails(getDocs(collection(member, `users/${OWNER}/${c}`)));
      await assertFails(deleteDoc(doc(member, `users/${OWNER}/${c}/seed`)));
    }
    await assertFails(getDoc(doc(member, `users/${OWNER}/settings/preferences`)));
    await assertFails(setDoc(doc(member, `users/${OWNER}/notes/evil`), buildNoteCreateData('evil', EMPTY_NOTE, 'r')));
    await assertFails(setDoc(doc(member, `users/${OWNER}/settings/preferences`), { ...DEFAULT_PREFERENCES, updatedAt: serverTimestamp() }));
  });

  it("admin cannot read, list, write or delete the member's data", async () => {
    await seed(MEMBER);
    for (const c of COLLECTIONS) {
      await assertFails(getDoc(doc(admin, `users/${MEMBER}/${c}/seed`)));
      await assertFails(getDocs(collection(admin, `users/${MEMBER}/${c}`)));
      await assertFails(deleteDoc(doc(admin, `users/${MEMBER}/${c}/seed`)));
    }
    await assertFails(getDoc(doc(admin, `users/${MEMBER}/settings/preferences`)));
    await assertFails(setDoc(doc(admin, `users/${MEMBER}/notes/evil`), buildNoteCreateData('evil', EMPTY_NOTE, 'r')));
  });

  it('admin keeps full access to their existing records', async () => {
    await seed(OWNER);
    for (const c of COLLECTIONS) await assertSucceeds(getDoc(doc(admin, `users/${OWNER}/${c}/seed`)));
    await assertSucceeds(getDocs(collection(admin, `users/${OWNER}/notes`)));
  });

  it('an unauthorised Google account cannot read either user or create its own workspace', async () => {
    await seed(OWNER);
    await seed(MEMBER);
    for (const uid of [OWNER, MEMBER]) {
      await assertFails(getDoc(doc(stranger, `users/${uid}/notes/seed`)));
      await assertFails(getDocs(collection(stranger, `users/${uid}/tasks`)));
    }
    await assertFails(getDoc(doc(stranger, `users/${STRANGER}/settings/preferences`)));
    await assertFails(setDoc(doc(stranger, `users/${STRANGER}/notes/n1`), buildNoteCreateData('n1', EMPTY_NOTE, 'r')));
  });

  it('no collection-group query can reach across users', async () => {
    await seed(OWNER);
    await seed(MEMBER);
    await assertFails(getDocs(query(collectionGroup(member, 'notes'))));
    await assertFails(getDocs(query(collectionGroup(admin, 'notes'))));
  });
});

describe('roles and access management', () => {
  it('only the admin passes the role probe', async () => {
    await assertSucceeds(getDoc(doc(admin, 'access/admin')));
    await assertFails(getDoc(doc(member, 'access/admin')));
    await assertFails(getDoc(doc(stranger, 'access/admin')));
    expect(await loadRole(admin)).toBe('admin');
    expect(await loadRole(member)).toBe('member');
  });

  it('nobody can write or list access documents from a client, not even the admin', async () => {
    for (const db of [admin, member, stranger]) {
      await assertFails(setDoc(doc(db, 'access/admin'), { uids: [MEMBER] }));
      await assertFails(setDoc(doc(db, 'access/member'), { uids: [STRANGER] }));
      await assertFails(getDocs(collection(db, 'access')));
    }
    await assertFails(getDoc(doc(member, 'access/member')));
  });

  it('a member cannot create profile or other top-level documents to escalate', async () => {
    await assertFails(setDoc(doc(member, `users/${MEMBER}`), { role: 'admin' }));
    await assertFails(setDoc(doc(member, 'roles/admin'), { uid: MEMBER }));
    await assertFails(setDoc(doc(member, `users/${MEMBER}/settings/role`), { role: 'admin' }));
  });
});
