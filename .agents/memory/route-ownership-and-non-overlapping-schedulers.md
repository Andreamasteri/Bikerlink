# Route ownership and non-overlapping schedulers

Date: 2026-07-26  
Change class: B — backend, no database schema change, no native build, no deploy or OTA performed.

## Symptom

Two independent defects were present in `server/routes/more-routes.ts`:

1. `POST /api/admin/client-error` was registered again after the protected admin router. The later route did not share the limiter, body-size limit, schema and BootGuard behavior of the canonical handler in `server/routes/admin.ts`.
2. Coordinate-history cleanup used `setInterval(async ...)`. An interval does not wait for the returned promise, so a slow cleanup could overlap the next run and increase database pressure during an incident.

## Root causes

- Route ownership was not unique: a compatibility route was added without delegating to the canonical handler.
- A wall-clock interval was used for work whose duration is unknown.

## Correction

- A public endpoint must have one canonical owner. Aliases may delegate to that owner, but must not reimplement its validation or security policy.
- Asynchronous maintenance work uses completion-based scheduling: run once, await completion, then schedule the next cycle.
- The scheduler is module-singleton, guards duplicate registration, calls `unref()` when available and exposes a test-only reset.
- Tests verify that `registerMoreRoutes` no longer owns `/api/admin/client-error` and that a pending cleanup prevents another invocation.

## Review checklist for future changes

- Search the complete route table before adding an endpoint.
- Compare middleware, schema, rate limits and error behavior when an apparent duplicate exists.
- Never use `setInterval(async ...)` for database or network maintenance.
- Test time-based code with fake timers and a deliberately unresolved promise.
- A timeout or caught error must not create a second concurrent worker.

## Rollback

Revert the code and test commit on the feature branch. No database data or external release state is changed by this correction.
