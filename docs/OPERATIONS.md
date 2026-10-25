# Operations: backup, restore, maintenance, manual testing

## Backups

Free services and browser storage do not promise permanent retention, and Firestore on Spark
has no automatic backups. **Your exports are your backups.**

**Export**: Settings → Backup & restore → **Export everything**. You get
`personal-hub-backup-YYYY-MM-DD.json` with all notes, tasks, bookmarks, document links, events
and preferences. It contains no passwords, tokens or keys, but it does contain all your
personal content — store it like any private document (e.g. an encrypted folder or your own
cloud drive).

Suggested routine: export monthly and before large changes (bulk import, deleting many items,
app upgrades). Keep the last few files.

Bookmarks can also be exported separately as a standard browser bookmarks HTML file
(Bookmarks → Export), which any browser can import.

## Restore

Settings → Backup & restore → choose what to do with items that already exist → **Choose
backup file…**. The file is fully validated first and you see a summary before anything is
written:

| Option | Effect on an item that already exists |
| --- | --- |
| Skip (safest) | Existing item kept; only missing items are added |
| Replace if newer | Backup version used only if its `updatedAt` is later |
| Replace | Backup version always wins |
| Keep both | Backup item is imported as a copy with a new ID |

Items whose content duplicates an existing item under a different ID (e.g. the same bookmark
URL) are skipped, except with "Keep both". "Also restore settings" additionally applies theme,
widgets and notification preferences. Restoring into a brand-new Firebase project works the same way after
the owner bootstrap.

Export and import need a connection: both read directly from Firestore (never from a local copy).

## Routine maintenance

| When | Task |
| --- | --- |
| Monthly | Export a backup; glance at the [cost self-check](COSTS.md#monthly-self-check-2-minutes) |
| Quarterly | `npm outdated`, update dependencies, `npm run test:all && npm run build`, push |
| Yearly | Re-read the provider free-tier pages; review Authentication → Users |
| After changing rules | `npm run test:rules`, then `npm run deploy:firestore -- --project <id>` |

## Moving to a new device

Open the site, sign in, and (optionally) install it. Data downloads automatically. Use **Sign
out & remove data from this device** on any device you stop using.

## Manual test plan (cross-device and offline)

Automated tests cover rules, repositories, validation and UI pieces. These checks need real
devices and are worth repeating after significant updates.

**Setup**: device A (e.g. laptop) and device B (e.g. phone), both signed in to the deployed site.

1. **Sync**: create a note on A → it appears on B within seconds. Edit on B → A updates while the
   note is open (no unsaved local edits on A).
2. **Offline block**: put B in airplane mode. The offline banner appears, forms and buttons are
   disabled, and the indicator shows **Offline**. Reopen the app while offline → the shell
   opens but says Firestore can't be reached. Turn airplane mode off → it loads and shows
   **Synced**.
3. **Conflict**: open the same note on A and B. On A, start typing, then put A offline mid-edit
   (the editor shows "Offline · not saved yet"). On B (online) change the same note. Bring A
   online → A's draft saves and A shows "This note was changed on another
   device" with Keep mine / Use other version / Keep both. Pick **Keep both** → both versions
   exist as notes on both devices.
4. **Recurring task**: create a weekly task due today, complete it → next week's task appears.
5. **Reminders**: create an event 2 minutes ahead with the reminder "At start time"; keep the
   app open → an in-app reminder appears (and a system notification if enabled and permitted).
   With the app fully closed, expect **no** reminder — this is a documented limitation.
6. **Install/PWA**: install on the phone, open from the home screen in airplane mode → the app shell opens with an offline message.
7. **Update**: deploy a change → open app shows "A new version is available" → Reload.
8. **Backup round-trip**: export, delete one test item, import with "Skip" → the item returns and
   nothing else changes.
9. **Access control**: in a private window, sign in with any other account → "This account is
   not authorised".

Record date, devices, and results. A failure in steps 1–3 or 9 should be investigated before
relying on the app for important data.
