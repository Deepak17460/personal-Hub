// Refuses to deploy rules that still contain the owner placeholder.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RULES = fileURLToPath(new URL('../firebase/firestore.rules', import.meta.url));
const source = readFileSync(RULES, 'utf8');

if (source.includes('__OWNER_UID__')) {
  console.error('firestore.rules still contains the __OWNER_UID__ placeholder.');
  console.error('Run: npm run owner:set -- <YOUR_FIREBASE_AUTH_UID>');
  console.error('(Deploying the placeholder is safe — it denies everyone — but the app will not work.)');
  process.exit(1);
}
console.log('Rules check passed: owner allowlist is configured.');
