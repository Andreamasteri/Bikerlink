---
name: TC app-repo staleness breaks Ollama model builds
description: The ThinkCentre's ~/bikerlink checkout lags origin/main by hundreds of commits; building custom Ollama models from it uses stale Modelfiles.
---

# ThinkCentre app-repo is far behind origin/main — sync before building models

The `~/bikerlink` git checkout on the ThinkCentre can be **hundreds of commits behind `origin/main`** (observed ~992 behind, with unrelated local uncommitted infra edits under `infra/self-host/`). Its working-tree copies of `scripts/ollama-modelfile/*.Modelfile` and `scripts/setup-ollama-server.sh` are therefore **stale** — e.g. the Bowie Modelfile still read `FROM mistral-nemo:latest` long after `origin/main` had `FROM qwen3:1.7b`.

**Why it matters:** running `setup-ollama-server.sh` (or `ollama create ... -f <modelfile>`) directly from that checkout silently builds the custom model on the WRONG base — no error, just a wrong model. `ollama list` looks fine; the drift is invisible.

**How to apply:** this is now automated — `setup-ollama-server.sh` has an anti-drift preflight (STEP 0) that fetches origin/main, diffs the tracked build files (the two Modelfiles + itself), auto-refreshes any drifted one via targeted `git checkout origin/main -- <file>` (re-execs itself if the script was stale), and prints the resolved `FROM` base + `ollama show` after create. Overrides: `SKIP_GIT_SYNC=1` (force, risky), `VERIFY_ONLY=1` (fail on drift, no writes). A standalone quick check (`scripts/check-tc-repo-drift.sh`, runnable via `tc.py exec`) surfaces commits-behind + per-file drift with local-vs-origin FROM and exits 1 on drift. The manual fallback still works: `git fetch origin && git checkout origin/main -- scripts/ollama-modelfile/*.Modelfile scripts/setup-ollama-server.sh`.

**Confirmed on the real TC (Jul 2026):** remote is `origin`, branch `main`, repo at `/home/andrea/bikerlink`; observed 122 commits behind yet the build files matched origin/main (prior cherry-checkout) — being commits-behind does NOT imply the build files drifted, and vice-versa; the guard checks the files, not the commit count. qwen3:1.7b reports architecture=qwen3, parameters≈2.0B, size 1.4GB via `ollama show`.

**Related config:** `BOWIE_OLLAMA_MODEL` on Replit is a **shared env var** (value `bikerlink`), NOT a secret; `HORUS_OLLAMA_MODEL` shared env var = `qwen3:4b`. Since they are plain env vars, a workflow restart picks up changes (unlike updating an existing *secret* value, which needs a cold boot). Access the TC via the `thinkcentre-access` skill (`tc.py exec`).
