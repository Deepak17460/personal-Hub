# Deployment guide

Target setup: data and sign-in on **Firebase (Spark, no billing)** with **Google sign-in only**,
static hosting on **Firebase Hosting** (Spark quota) — or, alternatively, **Cloudflare Pages
(Free)** — and optionally a subdomain such as `app.example.com` whose DNS stays in your existing
**AWS Route 53** hosted zone.

`app.example.com` and `example.com` are placeholders throughout — substitute your own names.
Nothing here moves your domain, changes nameservers, or touches existing DNS records.

Steps that need your credentials or console access are marked **[you]**. Nothing in this guide
requires entering a payment method. If any console asks you to upgrade, add billing or start a
trial, stop and re-read [COSTS.md](COSTS.md) — none of it is needed.

---

## 1. Firebase project **[you]**

Project used by this repository: `personal-hub-ea5ea` (set as the default in `.firebaserc`).

1. Plan shown in the bottom-left: **Spark (no-cost)**. Do not click **Upgrade**.
2. **Build → Firestore Database**: Standard edition, Native mode, production mode (deny all).
3. **Build → Authentication → Sign-in method**: **Google → Enabled**, with a project support
   email. Leave **Email/Password**, Email link, Phone and Anonymous **disabled** — the app has no
   UI for them and the rules reject every provider other than `google.com`.
4. **Do not** open Storage, Functions, App Check with paid providers, or Extensions.
5. **Project settings → General → Your apps → Web app**: copy `apiKey`, `authDomain`,
   `projectId`, `appId` (or `npx firebase apps:sdkconfig WEB --project personal-hub-ea5ea`).

These four values are not secrets. They only identify the project; the security rules are what
protect your data.

## 2. Configure the app locally

```sh
cp .env.example .env.local          # Windows PowerShell: Copy-Item .env.example .env.local
```

Fill in the four `VITE_FIREBASE_*` values. Keep `VITE_FIREBASE_AUTH_DOMAIN` as
`<project-id>.firebaseapp.com` unless you follow the custom auth domain option in step 8.
`.env.local` is git-ignored. Never commit it.

```sh
npx firebase login
npx firebase projects:list          # personal-hub-ea5ea should be listed
```

## 3. Deploy rules and indexes (placeholder first)

Deploying the placeholder is safe — it denies everyone, including you:

```sh
npx firebase deploy --only firestore:rules,firestore:indexes --project personal-hub-ea5ea
```

(`npm run deploy:firestore` refuses to deploy the placeholder on purpose; the raw command above is
fine for this first, deny-all deploy.)

## 4. Get your UID and allowlist it

1. `npm run dev` and open <http://localhost:5173> (`localhost` is an authorised domain by default).
2. **Continue with Google** and choose your own Google account.
3. You will see **"This account is not authorised"** and your **UID**, with a **Copy UID**
   button. The same value is in **Firebase Console → Authentication → Users → User UID**; check
   that the row's provider is Google and the email is yours.
4. Allowlist it, test, and deploy:

   ```sh
   npm run owner:set -- <YOUR_UID>
   npm run test:rules
   npm run deploy:firestore -- --project personal-hub-ea5ea
   ```

5. Refresh — the dashboard opens.
6. Commit the updated `firebase/firestore.rules`. A UID is an identifier, not a credential; it
   is safe in a private or public repository.

Any other Google account can complete Google sign-in (Firebase cannot stop that on the Spark plan
without Identity Platform blocking functions), but it only ever reaches the "not authorised"
screen: the rules require **both** an allowlisted UID **and** `sign_in_provider == 'google.com'`.
Periodically check **Authentication → Users** and delete unknown accounts.

## 5. Firebase Hosting **[you]**

`firebase.json` serves `dist/` with an SPA rewrite and the same security headers as
`public/_headers` (CSP, HSTS, frame blocking, cache rules).

```sh
npm run build                                  # uses .env.local
npx firebase deploy --only hosting --project personal-hub-ea5ea
```

The site appears at `https://personal-hub-ea5ea.web.app` (and `.firebaseapp.com`). Both are
already authorised for sign-in. Hosting on Spark has fixed free quotas (storage and daily
transfer); exceeding them suspends serving until the next period, it does not bill.

## 6. Push to GitHub **[you]**

```sh
git add -A
git commit -m "..."
git push
```

Check before pushing: `git status` must not list `.env.local` or anything in `dist/`.

`.github/workflows/ci.yml` runs lint, type-check, tests and a build on each push. On a private
repository it uses GitHub Actions minutes from the free allowance (roughly 3–5 minutes per run);
delete the workflow if you prefer not to use Actions at all.

### Alternative: Cloudflare Pages

Workers & Pages → Create → Pages → Connect to Git (this repository only). Build command
`npm run build`, output `dist`, and Production environment variables `NODE_VERSION=22`,
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN` (`<project-id>.firebaseapp.com`),
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Do not set `VITE_USE_EMULATORS`. Disable
preview branches. `public/_headers` is applied automatically. Add the `pages.dev` or custom
domain you use to Firebase authorised domains (step 8).

## 7. Custom subdomain with Route 53 **[you]** (optional)

**Firebase Hosting:** Hosting → **Add custom domain** → `app.example.com`. Firebase shows the
records to create (A records, or a TXT verification record first). In **Route 53 → Hosted zones →
`example.com` → Create record**, create exactly those records for `app` — Simple routing, Alias
off. Wait for Firebase to show **Connected** and a certificate.

**Cloudflare Pages:** Pages project → Custom domains → `app.example.com` first, then a Route 53
`CNAME` `app` → `<pages-project>.pages.dev`, TTL 300, Alias off.

Either way: leave every other record alone — **do not** edit the NS or SOA records, the apex, mail
records, or the registrar's nameservers. If the zone has **CAA** records, they must allow the CA
the host uses (`letsencrypt.org` and `pki.goog` cover both).

## 8. Restrict authorised domains and the API key **[you]**

1. **Firebase → Authentication → Settings → Authorized domains**. Currently:
   `localhost`, `personal-hub-ea5ea.firebaseapp.com`, `personal-hub-ea5ea.web.app`.
   - Add `app.example.com` once the custom domain is live.
   - Keep `personal-hub-ea5ea.firebaseapp.com`: it hosts the Google sign-in handler
     (`/__/auth/handler`) used by the popup.
   - Remove `localhost` when local development is finished (re-add temporarily when needed).
   - Do not add `*.pages.dev` wildcards or preview URLs.
2. Optional, recommended on Firebase Hosting with a custom domain (better on iPhone/Safari, which
   block the third-party storage the cross-domain sign-in relies on):
   - Set `VITE_FIREBASE_AUTH_DOMAIN=app.example.com` and rebuild/deploy.
   - Google Cloud console → **APIs & Services → Credentials → OAuth 2.0 Client IDs → "Web client
     (auto created by Google Service)"** → **Authorised redirect URIs** → add
     `https://app.example.com/__/auth/handler`. Without this, Google sign-in fails with
     `redirect_uri_mismatch`.
   - With the auth domain equal to the app's own domain, installed/touch devices use
     `signInWithRedirect`; everywhere else the popup is used, falling back to redirect if the
     popup is blocked.
3. **Google Cloud console → APIs & Services → Credentials** → "Browser key (auto created by
   Firebase)":
   - **Application restrictions → Websites**: `https://app.example.com/*`,
     `https://personal-hub-ea5ea.web.app/*`, `https://personal-hub-ea5ea.firebaseapp.com/*`
     (the sign-in handler uses the key), plus `http://localhost:5173/*` while developing.
   - **API restrictions → Restrict key**: Identity Toolkit API, Token Service API, Cloud
     Firestore API.
   - Save, wait a few minutes, then re-run the smoke test. If sign-in breaks, the referrer or API
     list is wrong.

## 9. Smoke test after deploying

On the deployed URL (`*.web.app` or your custom domain):

- [ ] Page loads with a valid certificate; no CSP errors in DevTools Console.
- [ ] Response headers include `content-security-policy`, `strict-transport-security`,
      `x-frame-options: DENY` (DevTools → Network → document).
- [ ] The sign-in page shows only **Continue with Google** — no email/password fields.
- [ ] Google sign-in with your account opens the dashboard; reload — still signed in.
- [ ] On the phone: Google sign-in works (popup, or redirect on an installed app with a custom
      auth domain), and the same data appears; edit there and watch it appear on the laptop.
- [ ] Sign in with a different Google account in a private window: "This account is not
      authorised", no data.
- [ ] Create a note, task, bookmark, document link and event; reload — all persist.
- [ ] DevTools → Network → **Offline**: the offline banner appears and forms are disabled; a note
      being typed shows "Offline · not saved yet"; go online → it saves and the indicator returns
      to **Synced**. DevTools → Application → IndexedDB has no `firestore/…` database.
- [ ] Settings → **Sign out** returns to the sign-in page; **Export everything** downloads JSON.

Record what you checked. Until this list passes on the real domain, treat the deployment as
unverified.

## Updating the app later

`npm run build && npx firebase deploy --only hosting` (or push to `main` if using Cloudflare).
Open clients show **"A new version is available"** and update when you click **Reload**. If you
change `firebase/firestore.rules` or indexes, also run `npm run test:rules` and
`npm run deploy:firestore -- --project personal-hub-ea5ea`.

## Rollback

Firebase Hosting → **Release history** → roll back to an earlier release (Cloudflare: Deployments
→ Rollback). Firestore rules: check out the previous `firestore.rules` and deploy it again.
