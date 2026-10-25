# Architecture

```
Browser (PWA)                                    Google Firebase (Spark)
┌──────────────────────────────────────┐        ┌─────────────────────────────┐
│ React UI ─ features/*                │        │ Firebase Auth               │
│   │                                  │  HTTPS │  email/password (+ Google)  │
│ hooks/useData ─ lib/firestore/       │◄──────►│                             │
│   liveQuery (shared listeners)       │        │ Cloud Firestore             │
│   │                                  │        │  users/{uid}/...            │
│ repositories/* (only Firestore code) │        │  Security Rules = the       │
│   │                                  │        │  owner allowlist + schema   │
│ Firestore SDK + IndexedDB cache      │        └─────────────────────────────┘
│ Service worker (static assets only)  │
└──────────────────────────────────────┘
          ▲  static files (HTML/JS/CSS/icons) from Cloudflare Pages
```

## Data model

```
users/{uid}/notes/{id}        title, content (Markdown), category, tags, pinned, archived,
                              revId, prevRevId
users/{uid}/tasks/{id}        title, description, priority, status, dueDate, category, tags,
                              subtasks[{id,title,done}], recurrence{freq,interval}, completedAt
users/{uid}/bookmarks/{id}    url, title, description, category, tags, favorite
users/{uid}/documents/{id}    title, description, category, tags, externalUrl, storageProvider,
                              fileType, fileSizeBytes          (metadata + link only, no file)
users/{uid}/events/{id}       title, description, date, time, kind, recurrence{freq,interval},
                              reminderMinutes
users/{uid}/settings/preferences   theme, notificationsEnabled, weekStartsOn, dashboardWidgets
```

Every record also has `id` (equal to the document ID, generated on the client so retries are
idempotent), `schemaVersion`, `createdAt`, `updatedAt` (server time) and `searchTokens`.

The contract for a record is kept in sync across `src/types/models.ts`, `src/schemas/`,
`src/repositories/`, `firebase/firestore.rules`, the backup format, and the tests.

## Reads: live queries

`useLiveCollection` / `useLiveDoc` share one Firestore listener per query key across components
(released 20 s after the last subscriber leaves). Snapshots come first from the local cache and
then from the server; their `hasPendingWrites` flag feeds the sync indicator.

Lists are paged (100 at a time). Dashboard widgets and calendars use narrow indexed queries
(date ranges, status, favourites). Task counts use server-side aggregation (`count()`).

## Writes: fire-and-forget with tracking

The UI never waits for the server: a write is applied to the local cache immediately and the
promise is passed to `trackWrite`, which counts in-flight writes and reports errors as toasts.
Offline, writes are queued in IndexedDB by the Firestore SDK and uploaded on reconnect, even
after a reload.

## Search

On every write, `searchTokens` is set to lowercase word prefixes (2–15 characters, max 400) of
the searchable fields. Global search runs an `array-contains` query on the longest query term in
each collection and filters the remaining terms on the client, so "pass pack" finds
"Packing list … Passport". Long text fields are excluded from single-field indexes.

## Conflict handling

- **Notes** (long text edited over time) use optimistic concurrency. Each save writes a new
  `revId` and sets `prevRevId` to the revision the edit was based on; the rules reject an update
  whose `prevRevId` is not the stored `revId`. A rejected or diverging edit opens a banner:
  **Keep mine** (re-save on top of the latest), **Use other version**, or **Keep both** (your
  text becomes a "(my copy)" note). Nothing is discarded until you choose. If the editor is
  closed when a rejection arrives, a conflict copy note is created automatically.
- **Other records** (short forms) are last-writer-wins at document level; updates use
  `merge` so `createdAt` is preserved.
- **Recurring tasks**: completing one marks it done and creates the next instance in the same
  batch, so they cannot get out of step.

## Offline behaviour

| Situation | Behaviour |
| --- | --- |
| First visit | Needs a connection (sign-in, initial data). |
| Later visits offline | Service worker serves the app shell; data comes from IndexedDB; sign-in state is kept in IndexedDB. |
| Edits offline | Saved locally, shown as "Saved on this device · waiting to sync"; uploaded automatically later. |
| Search offline | Works on locally cached data. |
| Not-yet-cached data | Not available until online (e.g. a page of notes never opened). |
| Clearing site data / "remove data" sign-out | Local cache and queued writes are deleted. |

The service worker precaches only static build output and never caches API responses, so
private data is only in the Firestore IndexedDB cache.

## Reminders

`useReminderEngine` checks every 30 seconds (and whenever events change) for events whose reminder time has passed,
shows an in-app toast, and — if you enabled it — a system notification. Fired reminders are
remembered locally so they show once per device. There is no push server, so reminders do not
fire while the app is completely closed.

## Backup format

`personal-hub-backup` version 1 JSON: `{ format, version, exportedAt, app, data: { notes, tasks,
bookmarks, documents, events }, preferences }`. Import validates the whole file with Zod (size
limit 50 MB, unknown fields dropped, newer versions rejected), shows a plan (new / identical /
conflicts / duplicates), and applies it in batches of 400 with the chosen strategy: skip existing,
replace if newer, replace, or keep both as copies.
