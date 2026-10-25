import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';

export const OWNER = 'ownerUid1234567890';
export const STRANGER = 'strangerUid12345678';

/** Loads the real rules file and swaps the placeholder for the test owner UID. */
export function rulesForTests(): string {
  const path = fileURLToPath(new URL('../../firebase/firestore.rules', import.meta.url));
  const src = readFileSync(path, 'utf8');
  const replaced = src.replace(/function ownerUids\(\) \{\s*return \[[^\]]*\];\s*\}/, `function ownerUids() { return ['${OWNER}']; }`);
  if (replaced === src) throw new Error('ownerUids() not found in rules');
  return replaced;
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
