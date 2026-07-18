---
name: Drizzle uniqueIndex vs Replit publish conflict
description: When a Drizzle schema defines a uniqueIndex that requires data deduplication before creation, Replit's publish system bypasses the dedup step and fails.
---

# Drizzle `uniqueIndex` vs Replit Publish Schema Diff

## The Rule
Any index that requires a data pre-processing step (DELETE duplicates, VACUUM, etc.) before it can be created **must NOT be defined in the Drizzle ORM schema**. It must live only in a custom migration SQL file and/or the boot sequence.

**Why:** Replit's publish system reads the Drizzle schema (TypeScript `pgTable` definitions) and generates a schema diff against production. It applies the diff directly — running bare SQL statements like `CREATE UNIQUE INDEX ...` — without running the surrounding migration file that contains the dedup DELETE first. This causes the constraint creation to fail when production has duplicate rows.

**How to apply:**
- If adding a `uniqueIndex()` to a Drizzle table definition for an existing table: first check production for duplicates with `executeSql({ environment: "production" })`.
- If duplicates exist → do NOT add `uniqueIndex()` to the Drizzle schema. Instead, put it only in a custom migration SQL that DELETEs duplicates first, then CREATEs the index.
- Remove `uniqueIndex` from imports in that schema file if it was the only usage.
- The migration runner (server/migrate.ts) runs at boot and handles the index correctly.

## Pattern (HNSW analogy)
Exactly the same as the HNSW index: "indexes requiring pre-processing must not be defined in the Drizzle schema or Replit bypasses the prep step."

Both cases: index defined only in boot sequence / migration SQL, **never** in `pgTable(...)` schema definition.

## Trigger pattern that caused the failure
```
Replit Publish error:
  Failed to run database migration statement
  CREATE UNIQUE INDEX "app_crash_logs_user_session_crash_type_uidx" ...
  could not create unique index "app_crash_logs_user_session_crash_type_uidx"
```
→ Root cause: `uniqueIndex(...)` in `shared/db/system.ts` → Replit diff ran CREATE without DELETE dedup.
→ Fix: remove `uniqueIndex(...)` from schema, keep in migration 0150 only.
