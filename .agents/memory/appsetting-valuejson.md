---
name: AppSetting valueJson vs value
description: upsertAppSetting stores JSON in two separate columns; watchdog collectors read valueJson (JSONB), not value (text).
---

## Rule

`storage.upsertAppSetting(key, value?, valueJson?)` writes to two separate DB columns:
- `value` — plain text (2nd arg)
- `valueJson` — JSONB (3rd arg)

The watchdog `scheduler-collector.ts` (and any collector) reads `row.valueJson`, **not** `row.value`.

**Why:** Passing a JSON-stringified object as the 2nd arg (`value`) leaves `valueJson = NULL`, so the collector always sees `null` and emits `never_run_or_setting_missing` even if the setting exists.

**How to apply:**
- To store structured data for collector use → `upsertAppSetting(key, undefined, { field: value })`
- To store a simple scalar → `upsertAppSetting(key, "string-value")`
- NEVER pass `JSON.stringify(...)` as the 2nd arg when the consumer reads `valueJson`

## Known affected sites (already fixed)

- `server/ai/watchdog/auto-fix/release-lock-zombie.ts` — was passing `JSON.stringify(...)` as 2nd arg
- `server/matching/scheduler.ts` — now correctly uses 3rd arg for `matching_scheduler_state`
