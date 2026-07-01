-- Task #5285 — Deep rename Redis → DragonflyDB: backfill persisted data.
--
-- Phase C of the rename. Phases A/B already renamed the runtime contract
-- (watchdog signal source "redis"→"dragonfly", metric prefix "redis.*"→
-- "dragonfly.*", ThinkCentre service_key "redis"→"dragonfly", system status
-- snapshot field). This migration rewrites the HISTORICAL rows that still carry
-- the old identifiers so monitors/queries stay consistent after the cutover.
--
-- OUT OF SCOPE (intentionally left untouched): the `redis://`/`rediss://` URL
-- schemes, the ioredis driver, and the server/cache/redis.ts wrapper symbols —
-- those describe the Redis wire protocol that DragonflyDB implements, not the
-- product name. All WHERE clauses use exact/anchored patterns on the STRUCTURED
-- monitoring identifiers (source, metric, composite "<source>.<metric>" ids,
-- service_key, scope) only.
--
-- Deliberately NOT rewritten (free-form audit content, not identifiers):
--   * captured EXTERNAL error strings in system_signals.details (e.g. Upstash
--     "ERR max requests limit exceeded ... upstash.com/docs/redis/..." messages)
--     — rewriting them would falsify the historical error and mangle the docs URL.
--   * historical AI-generated auto-fix proposals in ai_watchdog_log.details
--     (free-text title/reasoning + ad-hoc action.target values like
--     "redis_service"/"redis_client") — audit records of what the AI said at the
--     time, not a queried contract identifier.
-- The anchored patterns below skip all of these by construction.
--
-- Every statement is WHERE-guarded and idempotent: re-running is a no-op once
-- the old identifiers are gone. Pure DML, safe inside the default transaction.

-- 1) system_signals — structured source + metric prefix + details jsonb.
UPDATE "system_signals" SET "source" = 'dragonfly' WHERE "source" = 'redis';
--> statement-breakpoint
UPDATE "system_signals"
SET "metric" = 'dragonfly.' || substring("metric" from 7)
WHERE "metric" LIKE 'redis.%';
--> statement-breakpoint
-- details may echo the composite id / source / metric. Postgres serializes jsonb
-- canonically as `"key": "value"` (space after colon), so anchored replaces are
-- safe and never touch a `redis://` URL value.
UPDATE "system_signals"
SET "details" = replace(
      replace(
        replace("details"::text, 'redis.redis.', 'dragonfly.dragonfly.'),
        '"source": "redis"', '"source": "dragonfly"'),
      '"metric": "redis.', '"metric": "dragonfly.'
    )::jsonb
WHERE "details" IS NOT NULL AND (
      "details"::text LIKE '%redis.redis.%'
   OR "details"::text LIKE '%"source": "redis"%'
   OR "details"::text LIKE '%"metric": "redis.%'
);
--> statement-breakpoint

-- 2) system_health_snapshot — jsonb problems[].id / problems[].source and
--    metrics{} keys use the composite "<source>.<metric>" identifier, i.e.
--    "redis.redis.*". Text-replace on the canonical jsonb serialization.
UPDATE "system_health_snapshot"
SET "problems" = replace(
      replace("problems"::text, 'redis.redis.', 'dragonfly.dragonfly.'),
      '"source": "redis"', '"source": "dragonfly"'
    )::jsonb
WHERE "problems"::text LIKE '%redis.redis.%'
   OR "problems"::text LIKE '%"source": "redis"%';
--> statement-breakpoint
UPDATE "system_health_snapshot"
SET "metrics" = replace("metrics"::text, 'redis.redis.', 'dragonfly.dragonfly.')::jsonb
WHERE "metrics"::text LIKE '%redis.redis.%';
--> statement-breakpoint

-- 3) ai_watchdog_log — scope + details jsonb identifiers.
--    scope holds either the bare source ("redis") or the composite
--    "<source>.<metric>" (e.g. "redis.redis.unreachable"). Use exact/anchored
--    maps so "redis.redis.*" becomes "dragonfly.dragonfly.*" (not the buggy
--    "dragonfly.redis.*") and a bare "redis" becomes "dragonfly".
UPDATE "ai_watchdog_log" SET "scope" = 'dragonfly' WHERE "scope" = 'redis';
--> statement-breakpoint
UPDATE "ai_watchdog_log"
SET "scope" = 'dragonfly.dragonfly.' || substring("scope" from 13)
WHERE "scope" LIKE 'redis.redis.%';
--> statement-breakpoint
UPDATE "ai_watchdog_log"
SET "scope" = 'dragonfly.' || substring("scope" from 7)
WHERE "scope" LIKE 'redis.%' AND "scope" NOT LIKE 'redis.redis.%';
--> statement-breakpoint
-- details may carry the composite id, "source", and/or "metric" fields even when
-- the row does not contain the "redis.redis." composite (e.g. a bare
-- `"source": "redis"`), so the WHERE catches all three legacy shapes.
UPDATE "ai_watchdog_log"
SET "details" = replace(
      replace(
        replace("details"::text, 'redis.redis.', 'dragonfly.dragonfly.'),
        '"source": "redis"', '"source": "dragonfly"'),
      '"metric": "redis.', '"metric": "dragonfly.'
    )::jsonb
WHERE "details" IS NOT NULL AND (
      "details"::text LIKE '%redis.redis.%'
   OR "details"::text LIKE '%"source": "redis"%'
   OR "details"::text LIKE '%"metric": "redis.%'
);
--> statement-breakpoint

-- 4) thinkcentre_health_events — per-service key.
UPDATE "thinkcentre_health_events" SET "service_key" = 'dragonfly' WHERE "service_key" = 'redis';
--> statement-breakpoint

-- 5) app_settings — probe_log_snapshot / error_history_snapshot are jsonb
--    objects keyed by service name; rename the top-level "redis" key to
--    "dragonfly", preserving its value.
UPDATE "app_settings"
SET "value_json" = ("value_json" - 'redis')
  || jsonb_build_object('dragonfly', "value_json" -> 'redis')
WHERE "key" IN ('probe_log_snapshot', 'error_history_snapshot')
  AND "value_json" ? 'redis';
