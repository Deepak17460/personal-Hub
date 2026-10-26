// Edits the access allowlists (adminUids / memberUids) in firebase/firestore.rules.
//
//   npm run access:list
//   npm run access:set -- --admin <UID> [--member <UID> ...]   replace the given role's list
//   npm run member:add -- <UID>                                 add a member
//   npm run member:remove -- <UID>                              remove a member
//   npm run owner:set -- <UID>                                  same as --admin <UID>
//
// Existing admins are never removed unless --replace-admin is passed.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RULES = fileURLToPath(new URL('../firebase/firestore.rules', import.meta.url));
const PLACEHOLDER = '__OWNER_UID__';
const UID_RE = /^[A-Za-z0-9]{10,128}$/;
const fnPattern = (name) => new RegExp(`function ${name}\\(\\) \\{\\s*return \\[([^\\]]*)\\];\\s*\\}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readList(source, name) {
  const match = fnPattern(name).exec(source);
  if (!match) fail(`Could not find ${name}() in firestore.rules.`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

function writeList(source, name, uids) {
  const list = uids.map((u) => `'${u}'`).join(', ');
  return source.replace(fnPattern(name), `function ${name}() {\n      return [${list}];\n    }`);
}

const args = process.argv.slice(2);
const source = readFileSync(RULES, 'utf8');
const current = { admins: readList(source, 'adminUids'), members: readList(source, 'memberUids') };
const realAdmins = current.admins.filter((u) => u !== PLACEHOLDER);

if (args.length === 0 || args.includes('--list')) {
  console.log(`Admins:  ${realAdmins.join(', ') || '(none: placeholder)'}`);
  console.log(`Members: ${current.members.join(', ') || '(none)'}`);
  process.exit(0);
}

const next = { admins: null, members: null, addMembers: [], removeMembers: [] };
let mode = null;
let replaceAdmin = false;
for (const arg of args) {
  if (arg === '--replace-admin') replaceAdmin = true;
  else if (arg === '--admin') (mode = 'admins'), (next.admins ??= []);
  else if (arg === '--member') (mode = 'members'), (next.members ??= []);
  else if (arg === '--add-member') mode = 'addMembers';
  else if (arg === '--remove-member') mode = 'removeMembers';
  else if (arg.startsWith('--')) fail(`Unknown option ${arg}`);
  else if (!mode) fail('Put --admin, --member, --add-member or --remove-member before the UID.');
  else if (!UID_RE.test(arg)) fail(`"${arg}" does not look like a Firebase Auth UID (Firebase console > Authentication > Users).`);
  else next[mode].push(arg);
}

let admins = next.admins ?? realAdmins;
if (next.admins) {
  const dropped = realAdmins.filter((u) => !admins.includes(u));
  if (dropped.length > 0 && !replaceAdmin) {
    // Keep existing admins; the new UIDs are added alongside them.
    admins = [...realAdmins, ...admins.filter((u) => !realAdmins.includes(u))];
    console.log(`Kept existing admin(s) ${dropped.join(', ')} (pass --replace-admin to remove them).`);
  }
}
let members = next.members ?? current.members;
members = [...members, ...next.addMembers.filter((u) => !members.includes(u))];
members = members.filter((u) => !next.removeMembers.includes(u));

const both = admins.filter((u) => members.includes(u));
if (both.length > 0) fail(`A UID cannot be both admin and member: ${both.join(', ')}`);
if (admins.length === 0) fail('At least one admin UID is required.');

let updated = writeList(source, 'adminUids', [...new Set(admins)]);
updated = writeList(updated, 'memberUids', [...new Set(members)]);
writeFileSync(RULES, updated);
console.log(`Admins:  ${admins.join(', ')}`);
console.log(`Members: ${members.join(', ') || '(none)'}`);
console.log('Next: npm run test:rules, then npm run deploy:firestore -- --project <your-project-id>');
