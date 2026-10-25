// Writes the owner allowlist into firebase/firestore.rules.
// Usage: npm run owner:set -- <UID> [<SECOND_UID> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RULES = fileURLToPath(new URL('../firebase/firestore.rules', import.meta.url));
const uids = process.argv.slice(2);

if (uids.length === 0) {
  console.error('Usage: npm run owner:set -- <FIREBASE_AUTH_UID>');
  process.exit(1);
}
for (const uid of uids) {
  if (!/^[A-Za-z0-9]{10,128}$/.test(uid)) {
    console.error(`"${uid}" does not look like a Firebase Auth UID (copy it from Firebase console > Authentication > Users).`);
    process.exit(1);
  }
}

const source = readFileSync(RULES, 'utf8');
const pattern = /function ownerUids\(\) \{\s*return \[[^\]]*\];\s*\}/;
if (!pattern.test(source)) {
  console.error('Could not find the ownerUids() function in firestore.rules.');
  process.exit(1);
}
const list = uids.map((u) => `'${u}'`).join(', ');
writeFileSync(RULES, source.replace(pattern, `function ownerUids() {\n      return [${list}];\n    }`));
console.log(`Owner allowlist set to: ${uids.join(', ')}`);
console.log('Next: npm run deploy:firestore -- --project <your-project-id>');
