---
name: no-programmatic-secret-delete
description: There is no deleteSecrets callback — agent cannot remove a Replit Secret itself; only the user can via the Secrets pane.
---

Confirmed via `typeof deleteSecrets === "undefined"` in the CodeExecution sandbox (only `deleteEnvVars` exists, and it only touches non-secret env vars). `requestSecrets` can overwrite a secret's value, but nothing lets the agent delete a secret key outright.

**Why:** verified while auditing/cleaning up expired and orphaned secrets — could request fresh values but could not remove the ones the user wanted gone.

**How to apply:** when a cleanup plan calls for removing a secret, don't attempt it or claim it's done — tell the user which secret to delete manually (Tools → Secrets pane) and proceed with whatever else can be automated (new values via `requestSecrets`, code reference removal, etc.).
