# Architecture

```
Browser (PWA)                                    Google Firebase (Spark)
┌──────────────────────────────────────┐        ┌─────────────────────────────┐
│ React UI ─ features/*                │        │ Firebase Auth               │
│   │                                  │  HTTPS │  Google sign-in only        │
│ hooks/useData ─ lib/firestore/       │◄──────►│                             │
│   liveQuery (shared listeners)       │        │ Cloud Firestore             │
│   │                                  │        │  users/{uid}/...            │
│ repositories/* (only Firestore code) │        │  Security Rules = the       │
│   │                                  │        │  owner allowlist + schema   │
│ Firestore SDK (memory-only cache)    │        └─────────────────────────────┘
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
(released 20 s after the last subscriber leaves). Firestore is the only persistent store for
records: the SDK uses `memoryLocalCache()`, so documents are held in memory only while the tab is
open and nothing is written to IndexedDB. Snapshot `fromCache` / `hasPendingWrites` metadata feeds
the connection status ("Connecting…", "Synced", pending writes). If a query's composite index is
still building, the listener retries automatically.

Exports, imports and search read with `getDocsFromServer`, so they never return stale or partial
data from memory, and they refuse to run offline.

Lists are paged (100 at a time). Dashboard widgets and calendars use narrow indexed queries
(date ranges, status, favourites). Task counts use server-side aggregation (`count()`).

## Writes: fire-and-forget with tracking

Every write goes through `trackWrite(() => write())`. Online, the write is applied to the
in-memory cache immediately, and `trackWrite` counts it until Firestore acknowledges it and
reports errors as toasts. While a write is unacknowledged, closing the tab triggers the browser's
"leave site?" warning. Offline, `trackWrite` refuses to start the write (`OfflineWriteError`), so
nothing is queued in a place that would be lost on reload.

### Legacy offline cache (one-time handover)

Older versions used `persistentLocalCache` (IndexedDB `firestore/[DEFAULT]/<projectId>/main`). At
start-up, `chooseFirestoreCacheMode()` checks `indexedDB.databases()`. If that database exists,
the app opens it once more so that any writes queued there can upload. It then waits for
`waitForPendingWrites()` (Firestore's acknowledgement), and only after that runs `terminate` and
`clearIndexedDbPersistence`, removes Firestore's `firestore_*` multi-tab keys from
`localStorage`, and reloads in memory-only mode. If another tab still holds the database, the
deletion is retried on the next start. On browsers without `indexedDB.databases()` (Firefox
before 126), the old database is not detected and is left untouched rather than deleted blindly;
"Sign out & remove data" or clearing site data removes it.

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
| Opening the app offline | Service worker serves the app shell; the sign-in session is kept (IndexedDB), but the workspace shows "can't reach Firestore" and retries when the connection returns. |
| Going offline while open | An "offline" banner appears; data already loaded in this tab stays visible; all forms and edit buttons are disabled and any write is refused with a clear message. |
| Note being typed when the connection drops | The draft stays in the editor, labelled "Offline · not saved yet"; it saves automatically on reconnect (leaving the page shows a warning). |
| Search / export / import offline | Refused with a message; they need Firestore. |
| Settings offline | Data settings are disabled; sign-out and install remain available. |
| "Sign out & remove data" | Shuts Firestore down and deletes any legacy on-device cache. |

The service worker precaches only static build output (the app shell, JS, CSS, icons and
manifest) and has no runtime caching, so it never stores Firestore or Auth responses or any
private data.

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
