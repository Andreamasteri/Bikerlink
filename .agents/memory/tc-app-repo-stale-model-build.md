---
name: TC app-repo staleness breaks Ollama model builds
description: The ThinkCentre's ~/bikerlink checkout lags origin/main by hundreds of commits; building custom Ollama models from it uses stale Modelfiles.
---

# ThinkCentre app-repo is far behind origin/main — sync before building models

The `~/bikerlink` git checkout on the ThinkCentre can be **hundreds of commits behind `origin/main`** (observed ~992 behind, with unrelated local uncommitted infra edits under `infra/self-host/`). Its working-tree copies of `scripts/ollama-modelfile/*.Modelfile` and `scripts/setup-ollama-server.sh` are therefore **stale** — e.g. the Bowie Modelfile still read `FROM mistral-nemo:latest` long after `origin/main` had `FROM qwen3:1.7b`.

**Why it matters:** running `setup-ollama-server.sh` (or `ollama create ... -f <modelfile>`) directly from that checkout silently builds the custom model on the WRONG base — no error, just a wrong model. `ollama list` looks fine; the drift is invisible.

**How to apply:** before rebuilding any custom Ollama model on the TC, refresh just the needed files from the remote instead of a full (conflict-prone) pull:
`cd ~/bikerlink && git fetch origin && git checkout origin/main -- scripts/ollama-modelfile/BikerLink-Bowie.Modelfile scripts/setup-ollama-server.sh`
Then verify the `^FROM` line before `ollama create`, and confirm base after with `ollama show <model>` (qwen3:1.7b reports architecture=qwen3, parameters≈2.0B, size 1.4GB).

**Related config:** `BOWIE_OLLAMA_MODEL` on Replit is a **shared env var** (value `bikerlink`), NOT a secret; `HORUS_OLLAMA_MODEL` shared env var = `qwen3:4b`. Since they are plain env vars, a workflow restart picks up changes (unlike updating an existing *secret* value, which needs a cold boot). Access the TC via the `thinkcentre-access` skill (`tc.py exec`).
