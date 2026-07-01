---
name: GCE VM SSH access (direct, no jump host)
description: How the agent reaches the Google Cloud "dragonfly" VM directly, and the private-key paste bug to watch for.
---

The Google Cloud e2 VM ("dragonfly" project) has a public ephemeral IP reachable
directly from the Replit sandbox — unlike Ares/ThinkCentre, no ProxyJump is
needed. Helper: `scripts/gce/gce.py` (same paramiko pattern as `ares.py`).

Secrets: `GCE_SSH_KEY` (private ed25519), `GCE_SSH_HOST` (external IP, changes
if the VM is stopped/restarted — no static IP reserved by design, update the
secret manually if it changes). Non-sensitive: `GCE_SSH_USER=bikerlink`,
`GCE_SSH_PORT=22` (plain env vars, not secrets).

**Paste bug:** when a user pastes a multi-line PEM private key into the
Replit secret dialog, the newlines can get collapsed into spaces, producing a
single-line value that no SSH library can parse. `gce.py` has a
`_normalize_pem()` step that detects a no-newline PEM (regex on
`-----BEGIN...-----`/`-----END...-----`), strips embedded whitespace from the
base64 body, and rewraps it into 70-char lines before handing it to paramiko —
avoids a second round-trip asking the user to redo the paste.

**Why:** hit this on first setup of this VM; diagnosed by counting lines/length
of the secret value (never print secret content, only length/shape).

**How to apply:** any future helper that ingests a user-pasted private-key
secret should include the same normalization defensively, since this paste
path seems to lose newlines in this environment.
