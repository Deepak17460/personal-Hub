// Refuses to deploy rules with the admin placeholder or an inconsistent access allowlist.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RULES = fileURLToPath(new URL('../firebase/firestore.rules', import.meta.url));
const source = readFileSync(RULES, 'utf8');

function list(name) {
  const match = new RegExp(`function ${name}\\(\\) \\{\\s*return \\[([^\\]]*)\\];\\s*\\}`).exec(source);
  if (!match) {
    console.error(`firestore.rules has no ${name}() function.`);
    process.exit(1);
  }
  return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

const admins = list('adminUids');
const members = list('memberUids');

if (source.includes('__OWNER_UID__') || admins.length === 0) {
  console.error('firestore.rules has no admin UID configured (placeholder __OWNER_UID__ still present).');
  console.error('Run: npm run access:set -- --admin <YOUR_FIREBASE_AUTH_UID>');
  console.error('(Deploying the placeholder is safe — it denies everyone — but the app will not work.)');
  process.exit(1);
}
const overlap = admins.filter((u) => members.includes(u));
if (overlap.length > 0) {
  console.error(`UIDs listed as both admin and member: ${overlap.join(', ')}`);
  process.exit(1);
}
console.log(`Rules check passed: ${admins.length} admin(s), ${members.length} member(s).`);
