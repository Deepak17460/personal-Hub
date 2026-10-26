import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';

/** The admin (the original owner account). */
export const OWNER = 'ownerUid1234567890';
export const MEMBER = 'memberUid123456789';
export const STRANGER = 'strangerUid12345678';

/** Loads the real rules file and swaps the allowlists for the test admin and member UIDs. */
export function rulesForTests(): string {
  const path = fileURLToPath(new URL('../../firebase/firestore.rules', import.meta.url));
  let src = readFileSync(path, 'utf8');
  for (const [name, uid] of [['adminUids', OWNER], ['memberUids', MEMBER]] as const) {
    const replaced = src.replace(new RegExp(`function ${name}\\(\\) \\{\\s*return \\[[^\\]]*\\];\\s*\\}`), `function ${name}() { return ['${uid}']; }`);
    if (replaced === src) throw new Error(`${name}() not found in rules`);
    src = replaced;
  }
  return src;
}

export async function setupEnv(projectId: string): Promise<RulesTestEnvironment> {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  return initializeTestEnvironment({
    projectId,
    firestore: { rules: rulesForTests(), host, port: Number(port) },
  });
}

export const GOOGLE_TOKEN = { firebase: { sign_in_provider: 'google.com' } } as const;

export function ownerDb(env: RulesTestEnvironment): Firestore {
  return env.authenticatedContext(OWNER, GOOGLE_TOKEN).firestore() as unknown as Firestore;
}

export function memberDb(env: RulesTestEnvironment): Firestore {
  return env.authenticatedContext(MEMBER, GOOGLE_TOKEN).firestore() as unknown as Firestore;
}
