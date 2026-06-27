---
name: Production data removal is publish-gated
description: Why agent tasks that must delete/modify LIVE production rows cannot be completed in-environment, and what to do instead.
---

# Production data removal is publish-gated

An agent task whose "done" condition is the deletion/mutation of **live production
data rows** (e.g. "remove leftover secrets from the production `app_settings`
table") CANNOT be completed from the isolated task environment.

**Why:**
- The database skill's production access is strictly READ-ONLY — only SELECT is
  allowed against the prod replica (`environment: "production"`). DELETE/UPDATE
  are rejected.
- Replit's Publish flow diffs **schema only**, never data rows. So publishing does
  not delete data rows by itself.
- The only mechanism that mutates prod data is application code running at runtime
  — typically an idempotent boot cleanup (e.g.
  `server/boot-phase3-db-init.ts` runs `DELETE FROM app_settings WHERE key IN (...)`).
  That runs on the **next production publish/restart**, which is a user action.

**How to apply:**
- Do the code-side work you CAN do: ensure an idempotent boot cleanup exists to
  purge the rows, and make the codebase stop reading/writing the offending data so
  it cannot be reintroduced (env-only, etc.). Verify with typecheck + lint.
- Then STOP and tell the user the live deletion happens on their next publish (or
  have them run the DELETE in their own prod SQL console). The agent literally
  cannot perform the prod write.
- Expect the managed code-review gate to REJECT "complete" while the live rows
  still exist — it checks actual prod state, which the agent cannot change. This is
  a genuine user-action blocker, not a fixable validation failure. Don't loop
  mark_task_complete; report the handoff instead.
