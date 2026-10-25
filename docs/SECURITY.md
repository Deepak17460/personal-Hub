# Security model and checklist

## Threat model in one paragraph

The app is public static files; anyone can download them and read the Firebase config. That is
by design. **The only thing standing between the internet and your data is
`firebase/firestore.rules`**, which grants access exclusively to the Firebase Auth UID(s) in
`ownerUids()`, only when that user signed in with **Google** (`sign_in_provider == 'google.com'`),
and only under `users/{thatUid}/…`. Any Google account can complete sign-in; hiding UI or checking email
addresses in the frontend are conveniences, not controls.

## How each requirement is met

| Requirement | Implementation |
| --- | --- |
| Owner allowlist by UID, enforced server-side | `ownerUids()` in `firebase/firestore.rules`; `isOwner(uid)` requires `request.auth.uid == uid`, membership in the list **and** `request.auth.token.firebase.sign_in_provider == 'google.com'`. Tested in `tests/emulator/rules.test.ts` (unauthenticated, other users, non-allowlisted Google user in their own path, the owner UID via password/anonymous/custom/phone tokens, paths outside `users/`). |
| Not relying on the frontend | The UI's "not authorised" screen is driven by the server's `permission-denied` response, not by a client-side list. |
| Schema enforcement | Rules check exact field sets, types, string/array sizes, ID = document ID, timestamps (`updatedAt == request.time`), immutable `createdAt`, and a note revision chain. |
| No admin credentials or service-account keys in the client | Only the public web config (`VITE_FIREBASE_*`). No Admin SDK, no service account anywhere in the repo. |
| No passwords/tokens in localStorage | Auth persistence is IndexedDB (falls back to in-memory). `localStorage` holds only the theme, fired-reminder keys, and Firestore's multi-tab coordination flags (verified to contain no tokens or content). |
| No private data in public caches | The service worker precaches only built static assets and has **no runtime caching**; Firestore traffic is never cached by it. `/assets/*` is long-cached (content-hashed); HTML and `sw.js` are `no-cache`. Private data lives only in the browser's IndexedDB for this origin. |
| Export contains no secrets | Backups include records and preferences only — no UIDs' tokens, passwords, API keys, revision IDs or search tokens (checked in tests and in the browser). |
| Safe URLs | `normalizeUrl` / `isSafeHttpUrl` allow only `http:`/`https:` and reject credentials-in-URL and control characters; rules re-check `^https?://`. Links render with `rel="noopener noreferrer nofollow"`. |
| No XSS | No `dangerouslySetInnerHTML` (blocked by ESLint). Markdown uses `react-markdown` with raw HTML skipped, a URL allowlist, and images converted to links (no tracking pixels). Bookmark HTML import is parsed with `DOMParser` and only text/`href` values are kept. |
| Google-only sign-in | The UI offers only **Continue with Google** (`signInWithPopup`, `signInWithRedirect` fallback); Email/Password, Phone and Anonymous are disabled in Firebase and rejected by the rules anyway. No passwords are handled by the app. |
| CSP and headers | `public/_headers` (Cloudflare) and `firebase.json` → `hosting.headers` (Firebase Hosting, kept identical by a unit test; the reserved `/__/` auth handler paths are excluded): strict CSP (`script-src 'self'`, no inline scripts, no `eval`), HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, `noindex`. |
| Authorised domains | Restricted manually in the Firebase console ([deployment step 8](DEPLOYMENT.md#8-restrict-authorised-domains-and-the-api-key)). Currently `localhost`, `personal-hub-ea5ea.firebaseapp.com`, `personal-hub-ea5ea.web.app`. |
| No silently enabled billable services | Only Auth (Google provider), Firestore and Firebase Hosting (Spark quota) are used. No Storage, Functions, Analytics, Identity Platform, or paid App Check providers. |

## Pre-launch checklist

- [ ] `firebase/firestore.rules` contains your UID (not `__OWNER_UID__`) and was deployed with
      `npm run deploy:firestore`.
- [ ] `npm run test:rules` passes.
- [ ] Firebase Console → Firestore → Rules shows the deployed version (no `allow read, write: if true`).
- [ ] Authentication → Sign-in method: only **Google** enabled. Authentication → Users lists only you.
- [ ] Authorised domains: your app domain + `<project>.firebaseapp.com` only.
- [ ] Browser API key restricted to your domain and to Identity Toolkit, Token Service and Cloud
      Firestore APIs.
- [ ] Your Google account has 2-Step Verification (ideally a passkey or security key).
- [ ] `.env.local` is not in git (`git ls-files | findstr .env` shows only `.env.example`/`.env.emulator`).
- [ ] GitHub repository is private (recommended), Cloudflare's GitHub app is limited to this repo.
- [ ] Cloudflare preview deployments disabled, or at least not added to Firebase authorised domains.
- [ ] Response headers verified on the live domain (CSP present, no console CSP violations).
- [ ] Export a backup and store it somewhere you control.

## Ongoing

- Review Authentication → Users occasionally; delete unknown accounts.
- `npm audit` and dependency updates every few months; re-run `npm run test:all` and `npm run build`.
- On shared devices, use **Settings → Sign out & remove data from this device**.
- If you suspect account compromise: secure your Google account (myaccount.google.com → Security),
  revoke sessions by disabling and re-enabling the user in the Firebase console, and
  review recent data.

## Known limitations (accepted for a single-user, zero-cost app)

- Data is not end-to-end encrypted; Google can technically access Firestore contents.
- Any Google account can sign in and create a Firebase Auth user record (it gets no data access).
  Blocking that at the Auth level needs Identity Platform blocking functions; not required here.
- Firebase App Check is not configured (its reCAPTCHA Enterprise provider can bill beyond the
  free assessments). The rules make abuse pointless for reading or changing data; a determined
  attacker could only burn some of the daily free quota with denied requests, which on the Spark
  plan results in temporary throttling, never a bill.
- Reminders only fire while the app is open (no paid push infrastructure).
