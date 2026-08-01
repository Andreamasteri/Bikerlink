# BikerLink migration status — Railway + Cloudflare R2

This document records the safe boundary between the repository migration work and the final operations that require production credentials. Replit is no longer an operational target; Railway and Cloudflare R2 are the only supported production path.

## Repository state

- Cloudflare R2 adapter and resumable migration command are on `main` through PR #36.
- PR #26 was an older draft of the same migration and was closed as superseded.
- The migration command is manual only. It does not run at deploy time and never deletes the Replit source.
- Replit is retired from the supported architecture. Historical references and the one-way source migration utility remain only for audit/recovery; no new runtime path depends on Replit.

## Safe offline preparation

These checks can run without the bridge or production secrets:

- TypeScript, lint and unit tests using mocks;
- Drizzle migration review and dry-run generation;
- R2 path, bucket-routing, pagination and checkpoint tests;
- Railway build/start configuration review;
- cutover and rollback procedure review.

## Final operations requiring credentials

The following must be executed only after the R2 and source credentials are available:

1. Run the migration inventory in dry-run mode.
2. Take the independent database backup and complete the Neon restore drill.
3. Run the resumable object copy with `--execute`.
4. Verify object counts, sizes and SHA-256 hashes.
5. Run authenticated production upload/download smoke tests.
6. Keep the Replit source intact during the observation window.
7. Replit storage is not part of the new runtime; retain or discard the old source according to the final data-retention decision.

No production secret belongs in this repository or in `.env.example`.
