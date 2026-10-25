# Deployment guide

Target setup: source on **GitHub**, static hosting on **Cloudflare Pages (Free)**, data on
**Firebase (Spark, no billing)**, and a subdomain such as `app.example.com` whose DNS stays in your
existing **AWS Route 53** hosted zone.

`app.example.com` and `example.com` are placeholders throughout — substitute your own names.
Nothing here moves your domain, changes nameservers, or touches existing DNS records.

Steps that need your credentials or console access are marked **[you]**. Nothing in this guide
requires entering a payment method. If any console asks you to upgrade, add billing or start a
trial, stop and re-read [COSTS.md](COSTS.md) — none of it is needed.

---

## 1. Create the Firebase project **[you]**

1. <https://console.firebase.google.com> → **Create a project**. Google Analytics: **off**
   (not used, keeps the project minimal).
2. Confirm the plan shown in the bottom-left is **Spark (no-cost)**. Do not click **Upgrade**.
3. **Build → Firestore Database → Create database**
   - Edition/mode: **Standard**, **Native mode**.
   - Location: pick one close to you, e.g. `asia-south1 (Mumbai)`. **The location cannot be
     changed later.**
   - Start in **production mode** (deny all). Our rules are deployed in step 4.
4. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**
   (leave "Email link" off).
   - Optional: enable **Google** too, then set `VITE_ENABLE_GOOGLE_SIGNIN=true` later.
5. **Do not** open Storage, Functions, Hosting, App Check with paid providers, or Extensions.
6. **Project settings → General → Your apps → Web (`</>`)** → register an app (no Firebase
   Hosting). Copy `apiKey`, `authDomain`, `projectId`, `appId`.

These four values are not secrets. They only identify the project; the security rules are what
protect your data.

## 2. Configure the app locally

```sh
cp .env.example .env.local          # Windows PowerShell: Copy-Item .env.example .env.local
```

Fill in the four `VITE_FIREBASE_*` values. For the one-time owner bootstrap also set
`VITE_ALLOW_SIGNUP=true` (you will turn it off again in step 5).

`.env.local` is git-ignored. Never commit it.

## 3. Install the Firebase CLI login **[you]**

The CLI is already a dev dependency:

```sh
npx firebase login
npx firebase projects:list          # your project ID should be listed
```

## 4. Deploy rules and indexes (placeholder first)

Deploying the placeholder is safe — it denies everyone, including you:

```sh
npx firebase deploy --only firestore:rules,firestore:indexes --project <your-project-id>
```

(`npm run deploy:firestore` refuses to deploy the placeholder on purpose; the raw command above is
fine for this first, deny-all deploy.)

## 5. Bootstrap the owner account

1. `npm run dev` and open <http://localhost:5173>.
2. **Create account** with your real email and a strong passphrase (≥ 12 characters).
   - Alternative: create the user in **Authentication → Users → Add user** and simply sign in.
3. You will see **"This account is not authorised"** and your **UID**. Copy it.
4. Allowlist it and deploy:

   ```sh
   npm run owner:set -- <YOUR_UID>
   npm run deploy:firestore -- --project <your-project-id>
   ```

5. Refresh — the dashboard opens.
6. Commit the updated `firebase/firestore.rules`. A UID is an identifier, not a credential; it
   is safe in a private or public repository.
7. Turn sign-up off: set `VITE_ALLOW_SIGNUP=false` in `.env.local` (and keep it `false` in
   Cloudflare). This hides the form; it is a convenience, not the security boundary. Additional
   accounts, if anyone creates one through the Firebase API, still cannot read or write anything.
   - If your Firebase console offers **Authentication → Settings → User actions → Enable create
     (sign-up)**, you can untick it as an extra layer. Do **not** upgrade to Identity Platform
     just to get this setting.
   - Periodically check **Authentication → Users** and delete unknown accounts.

## 6. Push to GitHub **[you]**

The repository is already initialised on branch `main`.

```sh
git add -A
git commit -m "Personal Hub initial version"
# Create an empty PRIVATE repository on github.com (no README/.gitignore), then:
git remote add origin https://github.com/<you>/personal-hub.git
git push -u origin main
```

Check before pushing: `git status` must not list `.env.local` or anything in `dist/`.

`.github/workflows/ci.yml` runs lint, type-check, tests and a build on each push. On a private
repository it uses GitHub Actions minutes from the free allowance (roughly 3–5 minutes per run);
delete the workflow if you prefer not to use Actions at all.

## 7. Cloudflare Pages **[you]**

1. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git**.
   Authorise the Cloudflare GitHub app for **only** the `personal-hub` repository.
2. Build settings:

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | `None` (or `Vite`) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `/` (or `personal-hub` if the repo root is the parent folder) |

3. **Environment variables** (Production):

   | Name | Value |
   | --- | --- |
   | `NODE_VERSION` | `22` |
   | `VITE_FIREBASE_API_KEY` | from step 1 |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `<project-id>.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | `<project-id>` |
   | `VITE_FIREBASE_APP_ID` | from step 1 |
   | `VITE_ALLOW_SIGNUP` | `false` |
   | `VITE_ENABLE_GOOGLE_SIGNIN` | `false` (or `true` if enabled in step 1) |

   Do not set `VITE_USE_EMULATORS`.
4. **Save and Deploy**. The site appears at `https://<pages-project>.pages.dev`. Sign-in will
   fail there until step 9 — that is expected.
5. Recommended: **Settings → Builds → Branch control** → production branch only (disable preview
   branches). Preview URLs are not authorised Firebase domains, and fewer builds keeps you far
   from the free build limit.

There is no `404.html` in the output, so Cloudflare Pages automatically serves `index.html` for
deep links such as `/notes/abc` (single-page-app mode). `public/_headers` is applied to every
response (CSP, HSTS, frame blocking, cache rules).

## 8. Custom subdomain with Route 53 **[you]**

Order matters: **add the domain in Cloudflare first, then create the DNS record.** A CNAME that
points at Pages before the domain is registered there returns errors.

1. Cloudflare: Pages project → **Custom domains → Set up a custom domain** → `app.example.com`
   → continue. Because the zone is not on Cloudflare, it asks you to create a CNAME and shows the
   target, `<pages-project>.pages.dev`.
2. AWS console → **Route 53 → Hosted zones → `example.com` → Create record**:

   | Field | Value |
   | --- | --- |
   | Record name | `app` |
   | Record type | `CNAME` |
   | Value | `<pages-project>.pages.dev` |
   | TTL | `300` |
   | Routing policy | Simple |
   | Alias | **Off** (alias records cannot target Cloudflare) |

3. Leave every other record alone. **Do not** edit the NS or SOA records, the apex (`example.com`),
   MX/TXT mail records, or the domain's nameservers at the registrar.
4. If the zone has **CAA** records, they must allow the certificate authorities Cloudflare uses
   (e.g. `letsencrypt.org`, `pki.goog`, `ssl.com`). If there are no CAA records, nothing to do.
5. Back in Cloudflare, wait until the domain shows **Active** with a certificate (minutes, up to
   ~24 h while DNS propagates). Check with:

   ```sh
   nslookup -type=CNAME app.example.com
   ```

6. Open `https://app.example.com` and confirm the padlock / valid certificate.

## 9. Restrict Firebase and the API key **[you]**

1. **Firebase → Authentication → Settings → Authorized domains**
   - Add `app.example.com`.
   - Keep `<project-id>.firebaseapp.com` (used for the sign-in handler / Google popup).
   - Remove `<project-id>.web.app` (Firebase Hosting is not used).
   - Remove `localhost` once local development is finished (re-add temporarily when needed).
   - Do not add `*.pages.dev`.
2. **Google Cloud console → APIs & Services → Credentials** → the key named "Browser key
   (auto created by Firebase)":
   - **Application restrictions → Websites**: `https://app.example.com/*`
     (plus `http://localhost:5173/*` while developing).
   - **API restrictions → Restrict key**: Identity Toolkit API, Token Service API, Cloud Firestore API.
   - Save, wait a few minutes, then re-run the smoke test. If sign-in breaks, the referrer or API
     list is wrong.
3. Authentication → **Templates**: optionally customise the password-reset email sender name.

## 10. Smoke test after deploying

On `https://app.example.com`:

- [ ] Page loads with a valid certificate; no CSP errors in DevTools Console.
- [ ] Response headers include `content-security-policy`, `strict-transport-security`,
      `x-frame-options: DENY` (DevTools → Network → document).
- [ ] No "Create account" button (sign-up disabled).
- [ ] Wrong password shows "Incorrect email or password"; correct password opens the dashboard.
- [ ] Create a note, task, bookmark, document link and event; reload — all persist.
- [ ] Open the site on a second device, sign in, and see the same data; edit there and watch it
      appear on the first device.
- [ ] DevTools → Network → **Offline**: edit a note → "waiting to sync"; reload while offline →
      app still opens; go online → indicator returns to **Synced**.
- [ ] Settings → **Export everything** downloads a JSON file.
- [ ] Install as an app (address-bar install icon / "Add to Home screen").
- [ ] In a private window, sign in with a different (non-owner) account if you created one:
      it must show "not authorised".

Record what you checked. Until this list passes on the real domain, treat the deployment as
unverified.

## Updating the app later

Push to `main`; Cloudflare rebuilds automatically. Open clients show **"A new version is
available"** and update when you click **Reload**. If you change `firebase/firestore.rules` or
indexes, also run `npm run test:rules` and `npm run deploy:firestore -- --project <id>`.

## Rollback

Cloudflare Pages → **Deployments** → pick an earlier deployment → **Rollback**. Firestore rules:
check out the previous `firestore.rules` and deploy it again.
