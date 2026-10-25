---
name: personal-hub
description: Work on the Personal Hub private Firebase-backed organizer while preserving its owner-only data model and persistence contracts.
---

Read `PROJECT_CONTEXT.md` and `PROJECT_RULES.md` in the repository root before making changes. They contain the product purpose, architecture, security constraints, data-contract rules, and verification commands.

Keep work within the requested scope. Use the repository and schema layers for persisted data; changes to a stored record may require corresponding updates to types, schemas, repositories, Firestore rules, backup handling, and tests.

