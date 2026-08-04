# Telemetry pipeline audit

## Current risks found

- A retried mobile batch could insert the same logical samples more than once.
- Concurrent batches for one session could calculate the same previous GPS anchor.
- Map-matching retry rows could remain in the backlog after the historical attempt cap changed.

## Protections added in PR #43

- `ride_telemetry.ingest_key` is a deterministic SHA-256 key over the authenticated user, session, sample timestamp, and normalized sensor/GPS values.
- New ingestion uses `ON CONFLICT DO NOTHING` and updates session totals only for rows actually inserted.
- A transaction-scoped PostgreSQL advisory lock serializes updates for one user/session.
- The explicit admin drain classifies stale legacy retries as `exhausted`; raw samples are retained and can be requeued later when map matching is healthy.

## Verification when the app is live

1. Send one batch and record the returned `inserted` count.
2. Replay the identical batch; the second response must report `duplicates` and must not increase `ride_telemetry` or `telemetry_session_stats`.
3. Send two overlapping batches concurrently for one session; the final sample count and distance must match a serial reference calculation.
4. Verify samples with missing GPS but valid sensor timestamps are retained as sensor-only.
5. Verify invalid timestamps are rejected without a partial transaction.
6. Verify a failed HTTP response does not create duplicates when the mobile queue retries.
7. Verify map matching moves only eligible `pending`/`retry` rows and never deletes raw data.

Production promotion remains gated on these checks.