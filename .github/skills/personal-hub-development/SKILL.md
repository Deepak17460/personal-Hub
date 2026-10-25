---
name: personal-hub-development
description: Work on Personal Hub features, bugs, and data changes while preserving its private owner-only Firebase model and persistence contracts.
---

# Personal Hub development

Use this skill for feature work, bug fixes, refactoring, or data-model changes in Personal Hub.

Read `PROJECT_CONTEXT.md` and `PROJECT_RULES.md` before planning. Follow `.github/instructions/personal-hub.instructions.md` as the local rules entry point.

## Workflow

1. Identify the feature area under `src/features/` and trace any persistence work through `src/repositories/` and `src/schemas/`.
2. Make the smallest change that fulfils the request, using existing components and patterns.
3. For stored-data changes, update the full contract: types, schemas, repository builders/mappers, Firestore rules, backup handling, and relevant tests.
4. Preserve the owner-only Firestore model, note revision/concurrency flow, generated search tokens, recurring-task atomic behavior, and backup compatibility.
5. Run focused tests and appropriate verification commands from `PROJECT_CONTEXT.md`; include `npm run test:rules` when changing Firestore rules or persistence behavior.

