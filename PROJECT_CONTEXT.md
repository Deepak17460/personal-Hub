# Personal Hub — project context

## Purpose

Personal Hub is a private, single-owner personal organizer. It lets its owner manage notes, tasks, bookmarks, document links, calendar events, preferences, search, and JSON backup/import. It is a browser-based PWA; it stores metadata and content in Firebase Firestore, not in a server-owned API or local-only database.

## Stack and layout

- React 19, TypeScript (strict), Vite 7, React Router 7, Tailwind CSS 4, React Hook Form, Zod, and TanStack Query.
- Firebase Authentication and Cloud Firestore. Firebase emulators cover rules and repository integration tests.
- `src/features/<area>/`: page-level feature UI and feature-specific logic.
- `src/components/ui/`: shared primitives; `src/components/layout/`: shell and navigation.
- `src/repositories/`: the only layer that should construct Firestore reads/writes.
- `src/schemas/`: Zod validation shared by forms, repositories, and import handling.
- `src/types/models.ts`: canonical client-side domain model.
- `firebase/firestore.rules`: server-enforced access and document-shape contract.
- `tests/unit/`, `tests/components/`, and `tests/emulator/`: unit, component, and Firebase rules/repository tests.

Imports use the `@/` alias for `src/`.

## Data and security model

All personal data is scoped to `users/{uid}/...`; the collections are `notes`, `tasks`, `bookmarks`, `documents`, and `events`. Preferences live at `users/{uid}/settings/preferences`.

Firestore access is owner-only. The allowlist in `firebase/firestore.rules` is deliberately a placeholder until configured with `npm run owner:set -- <FIREBASE_AUTH_UID>`. Do not weaken those rules, expose a general user-data route, or assume Firebase client configuration is secret—the rules are the protection.

Treat a Firestore document shape as a contract across `src/types/models.ts`, `src/schemas/`, repository builders/mappers, backup import/export, Firestore rules, and relevant tests. When adding or changing persisted fields, update every affected layer and deploy/test the rules.

Notes have optimistic-concurrency revision fields (`revId`, `prevRevId`). Preserve this flow and its conflict-copy behavior; do not replace note writes with unchecked direct updates. Repository writes also maintain IDs, timestamps, schema versions, and search tokens. Use repository helpers rather than writing Firestore from components.

## Product behavior worth preserving

- This is a personal organizer, not a collaborative or multi-tenant app.
- Recurring task completion creates the next task instance atomically.
- Search uses precomputed `searchTokens`; entity changes must keep them current.
- Backups are a versioned JSON interchange format. Imports are validated and batched.
- Environment variables are Vite `VITE_*` values. Never commit `.env.local` or real credentials.

## Working conventions

- Prefer small, accessible UI changes that use existing UI components and patterns.
- Validate user input with the existing Zod schemas; avoid duplicating looser validation in a component.
- Keep TypeScript strict and avoid `any`; preserve existing public type contracts unless a deliberate migration is requested.
- Keep feature pages lazily loaded through `src/app/router.tsx`.
- Make the smallest change that fulfils the request. Do not modify Firebase rules, owner configuration, deployment settings, or backup compatibility unless the task needs it.

## Commands

Run commands from this directory:

```sh
npm run dev
npm run dev:emulators
npm run typecheck
npm run lint
npm run test
npm run test:rules
npm run test:all
npm run build
```

Use `npm run test:rules` after changes to Firestore rules or repository persistence behavior. For normal UI or utility work, run the most relevant test plus `npm run typecheck` and `npm run lint` when practical.

