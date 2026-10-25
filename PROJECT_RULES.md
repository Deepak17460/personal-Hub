# Personal Hub project rules

These rules apply to all changes unless a task explicitly calls for a migration or an intentional behavior change.

## Scope and architecture

1. Keep Personal Hub a private, single-owner organizer. Do not add collaboration, shared data, public profiles, or multi-tenant access by default.
2. Put page and domain UI in `src/features/`, reusable UI in `src/components/`, and Firestore access in `src/repositories/`. Components must not construct Firestore paths or write directly to Firestore.
3. Use `@/` imports for code under `src/` and preserve lazy loading for feature pages in `src/app/router.tsx`.
4. Prefer existing primitives and patterns over adding a dependency or a parallel UI/data abstraction.

## Data, validation, and search

5. Treat `src/types/models.ts`, `src/schemas/`, `src/repositories/`, `firebase/firestore.rules`, backup handling, and persistence tests as one data contract. A persisted-field change must be reflected everywhere it applies.
6. Validate entity data with the existing Zod schemas. Do not bypass repository validation or create a looser client-side representation of stored data.
7. Use repository helpers for creates and updates so IDs, timestamps, schema versions, and `searchTokens` remain correct.
8. When a searchable field changes, ensure its generated `searchTokens` remain current. Do not manually maintain a second search index in UI code.
9. Preserve backup format/version compatibility unless the task explicitly includes a versioned migration.

## Firebase security and synchronization

10. All personal data remains beneath `users/{uid}/...`, and all Firestore rules remain owner-only. Never loosen the allowlist or add broad authenticated-user access as a convenience.
11. Never commit credentials or `.env.local`. `VITE_FIREBASE_*` browser configuration is not a security control; Firestore rules are.
12. Preserve note optimistic concurrency: updates must use the current `prevRevId`/new `revId` protocol, and rejected edits must retain the conflict-copy path.
13. Preserve recurring-task completion as the atomic update that marks the current task done and creates the next instance.
14. Do not change `firebase/firestore.rules`, owner UID configuration, imports, or deployment configuration unless the requested work requires it.

## Quality bar

15. Keep TypeScript strict; avoid `any`, unsafe casts, and silent error swallowing.
16. Keep UI accessible: use semantic controls, visible labels where needed, keyboard-operable interactions, and existing focus/dialog patterns.
17. Add or update focused tests when changing behavior, validation, persistence, import/export, recurrence, or security rules.
18. Run the narrowest relevant checks. Also run `npm run typecheck` and `npm run lint` for code changes when practical; run `npm run test:rules` for Firestore rule or repository-persistence changes.

