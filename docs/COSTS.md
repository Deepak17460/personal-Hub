# Cost checklist — keeping it at ₹0 extra per month

The design uses only free tiers and has **no servers** (no EC2, ALB, NAT gateway, Lambda,
Cloud Functions or containers). Free tiers are set by the providers and **can change or be
withdrawn**; the figures below are what the providers published at the time of writing. Check
the linked pricing pages before relying on them, and re-check once a year.

## What you will (still) pay for

| Item | Cost | Notes |
| --- | --- | --- |
| Route 53 hosted zone for your existing domain | ~US$0.50/month per zone + DNS queries (~US$0.40 per million) | You already pay this; one extra CNAME record adds only negligible query charges. CNAME queries are billed (only alias queries to AWS resources are free). |
| Domain registration/renewal | yearly registrar fee | Unchanged by this project. |

Everything else below should be ₹0 if the checklist is followed.

## Firebase — Spark (no-cost) plan

Pricing: <https://firebase.google.com/pricing>

| Resource | Spark allowance (at time of writing) | Typical single-user usage |
| --- | --- | --- |
| Firestore stored data | 1 GiB | Text notes/tasks: a few MB even after years |
| Firestore document reads | 50,000 / day | Hundreds to a few thousand per day |
| Firestore writes / deletes | 20,000 / day each | Tens to hundreds per day (autosave is debounced) |
| Firestore network egress | 10 GiB / month | Small |
| Auth (Google sign-in) | No charge on Spark | Phone/SMS auth is **not** used (it costs money) |
| Firebase Hosting storage | 10 GB | A few MB per release (old releases can be pruned in the console) |
| Firebase Hosting transfer | 360 MB / day | Small: the service worker serves the app shell after the first load |

What happens at a limit: on Spark, Firestore **stops serving** requests over the daily quota until
the quota resets — it does not bill you, because there is no billing account. The app shows
that Firestore cannot be reached and pauses editing until the quota resets; no data is lost.
Without offline persistence, every app start reads its lists from Firestore again; for one person
this is still far below the 50 K reads/day limit.

Things that would require billing (avoid them):

- Clicking **Upgrade** to Blaze (pay-as-you-go). Blaze has the same free quota but bills overages.
- Cloud Storage for Firebase (new projects need Blaze for Storage). Documents here are links.
- Cloud Functions, Extensions, Data Connect, App Hosting.
- Upgrading Authentication to **Identity Platform**, phone/SMS auth, or multi-factor via SMS.
- App Check with reCAPTCHA Enterprise beyond its free assessments.
- Creating additional Firestore databases beyond the free one, or scheduled backups/PITR.

Tips:

- Keep the dashboard tab count reasonable; each open tab shares one connection (multi-tab
  persistence) so reads are not multiplied per tab.
- Lists load 100 items at a time; search uses an index (no full-collection scans).
- If you ever see quota warnings: Firebase console → **Usage and billing** shows daily usage.

## Cloudflare Pages — Free plan

Limits: <https://developers.cloudflare.com/pages/platform/limits/>

| Resource | Free allowance (at time of writing) | This app |
| --- | --- | --- |
| Static requests and bandwidth | Unlimited | Static files only |
| Builds | 500 / month, 1 concurrent | One build per push to `main` |
| Files per deployment | 20,000 | ~50 |
| Max file size | 25 MiB | Largest is ~0.65 MB |
| Custom domains | Up to 100 per project | 1 |

Avoid: Pages Functions / Workers (not used; they have separate quotas), paid add-ons (Workers
Paid, Cloudflare Images, Argo, Load Balancing), and moving your domain's nameservers to
Cloudflare unless you deliberately decide to.

## GitHub

- Private repositories are free. GitHub Actions on private repos includes a monthly free
  minutes allowance on the Free plan (2,000 minutes at time of writing); this project's CI uses
  roughly 3–5 minutes per push. Public repositories use Actions for free. If the minutes ever
  run out, Actions stops — it does not bill unless you have set a spending limit above $0.
- Leave **Settings → Billing → Spending limit** at **$0**.

## AWS

- Only the existing Route 53 hosted zone is used. Do not create Route 53 health checks, traffic
  policies, resolver endpoints, or alias records to load balancers — all cost money.
- Consider an **AWS Budgets** alert (free for the first budgets) on your account so you notice
  any unexpected change.

## Monthly self-check (2 minutes)

- [ ] Firebase console shows **Spark** plan; **Usage** is far below limits.
- [ ] No "billing account linked" banner in Firebase/Google Cloud.
- [ ] Cloudflare: Pages project only; plan **Free**; no Workers Paid subscription.
- [ ] GitHub: spending limit $0.
- [ ] AWS bill: only the Route 53 hosted zone and queries (plus whatever you already run).
