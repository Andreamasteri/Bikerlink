# AI-Hub outbox design (not applied)

This is a design artifact only. It is not a Drizzle migration and does not
change Neon.

When an application transaction creates an intent that may become an AI-Hub
job, the same transaction should insert an outbox record. A dispatcher later
claims records with a lease and submits them with the stable idempotency key.

Proposed columns:

- id UUID primary key
- source_app text (bikerlink)
- intent_type text
- correlation_id, conversation_id, turn_id
- requested_agent, capability
- payload_json JSONB (allowlisted, no secrets)
- idempotency_key text unique
- state text (pending, leased, submitted, failed)
- attempts, next_attempt_at, lease_expires_at
- hub_job_id, last_error, created_at, updated_at

The future projection may be named ai_hub_jobs, but it must remain
separate from ai_coordinator_jobs and ai_vps_jobs. The dispatcher must not run
from a prompt and must reject unknown capabilities or mismatched agents.

A future Drizzle migration should be additive, branch-tested and reviewed
before activation. No SQL has been applied by this change.
