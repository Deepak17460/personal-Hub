---
applyTo: "**"
---

# Personal Hub rules

Read `PROJECT_CONTEXT.md` and `PROJECT_RULES.md` before editing. `PROJECT_RULES.md` is authoritative.

- Keep the app a private, single-owner organizer and preserve owner-only Firestore access.
- Use `src/repositories/` and `src/schemas/` for persisted data; never write Firestore directly from a component.
- Preserve note revision conflict handling, generated search tokens, atomic recurring-task completion, and backup compatibility.
- Update the complete persistence contract when stored data changes: model types, schemas, repositories, rules, backup handling, and applicable tests.
- Do not commit credentials or relax Firestore rules.
- Run focused tests plus typecheck and lint when practical; run rules tests for Firestore/persistence work.

