# Personal Hub

A private, single-owner workspace: notes, tasks, bookmarks, document links, calendar and
reminders, global search and JSON backup. It is a static PWA (React + Vite) that talks directly
to Firebase Authentication and Cloud Firestore. There is no custom backend and nothing that
needs a paid server.

- **Access control lives in Firestore Security Rules**: only the Firebase Auth UID(s) listed in
  `firebase/firestore.rules` can read or write anything. Signing up does not grant access.
- **Offline first**: data is cached in IndexedDB, edits made offline are queued and uploaded on
  reconnect, and the app shell is served by a service worker.
- **No file storage**: "Documents" stores metadata and an external link (Drive, OneDrive, …).
  Firebase Cloud Storage is never enabled.

| Guide | Contents |
| --- | --- |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Firebase, GitHub, Cloudflare Pages and Route 53 setup, step by step |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model and pre-launch checklist |
| [docs/COSTS.md](docs/COSTS.md) | Free-tier limits, what could cost money, how to keep it at ₹0 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data model, sync and conflict handling, offline behaviour |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Backup and restore, updates, manual test plan |

## Requirements

- Node.js 20.19+ (22 LTS recommended)
- Java 21+ (only for the Firebase emulators used by `npm run test:rules` and local emulator mode)

## Run locally against the emulators (no Firebase project needed)

```sh
npm install
npm run emulators          # terminal 1: Auth on :9099, Firestore on :8080 (demo project)
npm run dev:emulators      # terminal 2: app on http://localhost:5173
```

1. Open the app, choose **Create account** and sign up (any email; the Auth emulator is fake).
2. You will see **"This account is not authorised"** with your UID. That is the rules working.
3. Run `npm run owner:set -- <that UID>`. The emulator reloads the rules automatically; refresh
   the page and the workspace opens.
4. Before committing, put the placeholder back (`'__OWNER_UID__'` in `firebase/firestore.rules`)
   or set your real production UID instead — see [deployment](docs/DEPLOYMENT.md#5-bootstrap-the-owner-account).

Emulator data is in memory and disappears when the emulators stop.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server using `.env.local` (real Firebase project) |
| `npm run dev:emulators` | Dev server using `.env.emulator` (local emulators) |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run preview` | Serve `dist/` with the same security headers as Cloudflare (`public/_headers`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit and component tests (jsdom) |
| `npm run test:rules` | Firestore rules and repository tests inside the emulators |
| `npm run test:all` | Both test suites |
| `npm run owner:set -- <uid>` | Write the owner UID allowlist into `firebase/firestore.rules` |
| `npm run rules:check` | Fails if the owner placeholder is still present |
| `npm run deploy:firestore -- --project <id>` | Check, then deploy rules and indexes |
| `npm run icons` | Regenerate PWA icons from `scripts/generate-icons.mjs` |

To test the production bundle locally with real headers and the service worker:
`npx vite build --mode emulator && npx vite preview --mode emulator` (with the emulators running).

## Project layout

```
src/
  app/            providers, router, "not configured" screen
  features/       one folder per area (auth, dashboard, notes, tasks, bookmarks, documents,
                  calendar, search, settings, backup)
  components/     shared UI primitives and the app shell
  repositories/   the only code that reads/writes Firestore
  schemas/        Zod schemas shared by forms, repositories and backup import
  lib/            Firebase client, live-query store, sync status
  utils/          dates, recurrence, URLs, search tokens, formatting
firebase/         firestore.rules, firestore.indexes.json
public/           _headers (CSP etc. for Cloudflare Pages), icons, theme bootstrap
scripts/          owner allowlist, rules check, icon generator, emulator test runner
tests/            unit/, components/, emulator/
```

## What has been verified

Verified locally (emulators + production build in Chrome):

- Type-check, lint, 81 unit/component tests, 22 emulator tests (rules + repositories), production build.
- Sign-up → "not authorised" screen → owner allowlist → workspace access; wrong-password error.
- Note autosave; Markdown rendering strips `<script>`/event handlers, neutralises `javascript:` links
  and shows remote images as links; production CSP with no violations.
- Offline edit → "waiting to sync" → offline reload (service worker + IndexedDB) → reconnect uploads.
- Two-device conflict on the same note → "Keep mine / Use other version / Keep both".
- Recurring task completion creates the next instance; unsafe bookmark URLs rejected (UI and rules).
- Global multi-word prefix search; backup export contains data but no tokens or secrets.
- Phone (390 px) layout on every page without horizontal overflow; PWA update prompt.
- "Sign out & remove data" deletes the Firestore IndexedDB cache.

**Not verified** (needs your accounts): a real Firebase project, Google sign-in, Cloudflare Pages
build/deploy, Route 53 DNS, HTTPS on your domain, and installation on a physical phone.
Follow the smoke test at the end of [DEPLOYMENT.md](docs/DEPLOYMENT.md#10-smoke-test-after-deploying).
