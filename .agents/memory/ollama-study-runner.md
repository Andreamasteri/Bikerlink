---
name: Ollama study-repo runner — CF Access gate + execution constraints
description: Why the full GitHub-codebase + DB-dump Ollama study can't be run to completion inside the agent loop, and the Cloudflare Access dependency that blocks it.
---

# Ollama study-repo runner

`scripts/ollama-study-repo.ts` (+ modules in `scripts/ollama-study/`) downloads the
whole GitHub repo, dumps the dev+prod DB schema/data, chunks it, and feeds it to the
self-hosted Ollama (`DIAG_OLLAMA_URL`, model `DIAG_OLLAMA_MODEL`) to produce
`logs/repo-study-<ts>.md` and inject a `## Architettura` block into
`.agents/skills/ollama-diagnostics/bikerlink-context.md`.

## Cloudflare Access can hard-block the run (403)
The diagnostic Ollama host (ollama.biker-link.net) sits behind Cloudflare Access.
Requests carry a CF **Service Token** via `cfAccessHeaders()` (`CF-Access-Client-Id` /
`CF-Access-Client-Secret`, from `server/lib/cf-access.ts`). When the Access policy does
**not** authorize that token, the CF edge returns **HTTP 403 on EVERY path** — including
`GET /api/version`, not just `POST /api/chat` — with a `Error ・ Cloudflare Access` HTML
body. Symptom seen live: endpoint returned 200 (chat replied "OK"), then minutes later
flipped to 403 on all paths = the Access policy was being toggled mid-session.
**Why:** enforcement is controlled outside the repo (CF dashboard). A 403 here is an
infra/policy state, not a code bug — do not "fix" it in code.
**How to apply:** before running the study, probe `GET $DIAG_OLLAMA_URL/api/version`
with the CF headers; if 403, the run is blocked until the Service Token is added to the
Access policy for that hostname (or enforcement is lifted). This is the same surface as
the recurring "verify Ollama works once CF Access is enforced" work.

## The full run can't complete inside the agent tool loop
**Why:** all three durable-execution paths are unavailable here:
- Detached/`setsid`/`nohup` background processes are **reaped when the bash tool call
  tears down** (observed: a run died at 1139/2164 downloads, no report).
- Replit **workflows are capped** and this repl already sits at 12/10, so you cannot add
  (or even reconfigure, it counts as an add) a one-shot study workflow without
  permanently deleting 3 of the user's CI workflows.
- Foreground `bash` is capped at **120s**, and a single Ollama call on the 35b model is
  already too slow: ~49s cold just to load; a ~166k-char chunk call alone blew past 67s;
  a DB-inclusive run adds a large DB-dump call + a final-report call. Even a 4-file
  `--no-db` run needs two calls.
**How to apply:** don't try to babysit the full study from the agent. Run it from a
real persistent terminal/CI: `npx tsx scripts/ollama-study-repo.ts` (flags:
`--no-db`, `--max-files N`, `--branch`, `--chunk-chars`, `--dry-run`). For a quick
end-to-end smoke test that fits a short budget, use a tiny `--no-db --max-files 4`.
