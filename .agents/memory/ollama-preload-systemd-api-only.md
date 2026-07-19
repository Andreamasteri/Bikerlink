---
name: ollama-preload systemd — API-only pattern
description: ollama CLI (pull/list) panics without $HOME in systemd oneshot services; use HTTP API for all Ollama ops.
---

# ollama-preload systemd — API-only pattern

## The rule
Never call `ollama` CLI (pull, list, ps) inside a systemd service. Use the HTTP API (`curl http://localhost:11434/api/...`) for all model checks and loads.

**Why:** Ollama's CLI panics with `panic: $HOME is not defined` when run from a systemd unit that doesn't set `$HOME`. This includes `ollama pull`, `ollama list`, and any other CLI subcommand. The API (`/api/tags`, `/api/pull`, `/api/generate`, `/api/embed`, `/api/ps`) works fine with `curl` and has no env dependency.

**How to apply:** Replace all CLI-based model operations in systemd units:
- `ollama list | grep model` → `curl /api/tags | python3 -c "... sys.exit(0 if 'model' in names else 1)"`
- `ollama pull model` → `curl -X POST /api/pull -d '{"model":"...", "stream":false}'`
- `ollama ps` → `curl /api/ps`

## ai-hub on TC deployment
TC's ai-hub lives at `/home/andrea/ai-hub/` (separate git repo). Files in `scripts/thinkcentre/ai-hub/` in the BikerLink repo must be deployed manually:
- `server.js` AND `vram-routes.js` must both be deployed together
- Deploying only `server.js` crashes ai-hub with `Cannot find module './vram-routes'`
- Deploy: `base64 -w 0 <file> | ssh tc "base64 -d > /home/andrea/ai-hub/<file> && pm2 restart ai-hub"`

## readOllamaModels sort order
`readOllamaModels()` in `server.js` must sort models by SIZE DESC (parsed from `ollama ps` output) to align with `readComputeApps()` which sorts by VRAM DESC. Without matching sort order, index-based pairing in `buildBreakdown()` assigns the wrong agent label.
