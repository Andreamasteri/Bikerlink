# App settings batch reads

## Rule

When one request needs multiple `app_settings` keys, use
`storage.getAppSettings(keys)` instead of a `Promise.all` of repeated
`getAppSetting` calls.

The batch API:

- preserves the caller's key order;
- performs one `WHERE key IN (...)` query for cold/missing cache entries;
- caches both found rows and missing keys for the normal per-key TTL;
- reuses warm per-key cache entries;
- preserves `undefined` for absent settings.

## Why

Parallel single-key reads still create N database queries. In particular,
`GET /api/settings/all` previously generated ten queries per cold request and
was reported by Sentry issue `129167181`.

## Verification

Keep tests for:

- one query at cold cache;
- no query at warm cache, including cached misses;
- mixed warm/cold keys;
- unchanged endpoint JSON defaults and fallback behavior.
