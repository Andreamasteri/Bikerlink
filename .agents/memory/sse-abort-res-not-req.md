---
name: SSE abort must use res.on("close"), not req.on("close")
description: On Node 20 + express.json(), req "close" fires early/one-shot; only res "close" reliably signals client disconnect for aborting a streaming AI turn.
---

# SSE abort must listen on `res.on("close")`, never `req.on("close")`

**Rule:** for any SSE/streaming route that aborts in-flight work when the client
disconnects, wire the `AbortController` to `res.on("close")` — never
`req.on("close")`.

**Why:** on Node 20 + `express.json()`, the request `IncomingMessage` emits
`"close"` as soon as the POST body is consumed by the body-parser middleware —
i.e. *before* the streaming handler reaches its close-wiring (which comes after
several `await`s: config/persona/context). `"close"` is a **one-shot** event, so
a listener attached after it already fired is **never called**. Net effect of the
buggy `req.on("close", abort)`:
- abort-on-disconnect is **dead** → the server keeps generating and writing to an
  already-closed socket, wasting Ollama/cloud compute and quota; and
- in an unlucky timing it could abort the turn before the first token.

`res` (ServerResponse) emits `"close"` only when the response connection actually
closes (real client disconnect, or stream end), so it never fires prematurely and
is not missed. This is BikerBlog parity-contract point **E1**.

**How to apply:** fixed in `server/routes/ai-assistant.ts`,
`server/routes/admin/ai-console.ts`, and (Task #43 audit) `chat/stream.ts`,
`auth/login.ts` (`/session-events`), `radio/playback.ts`, `planned-routes/waypoints.ts`
(`/ai-parse` + `/ai-stream`), `admin/diagnostics-stream.ts`, `admin/translations.ts`
(`/ai-complete`) — all now use `res.on("close")`. Regression + Node-semantics proof in
`server/__tests__/ai-assistant-abort-on-disconnect.test.ts` and
`server/__tests__/streaming-routes-abort-on-disconnect.test.ts`.

**Important correction:** the bug is NOT limited to POST/JSON-body requests. The
global `express.json()` middleware in `server/middleware.ts` runs on every
request (GET included, minus a small POST-body-limit bypass list), and even a
bodyless GET's `req` (IncomingMessage) still emits the one-shot "close" early
during request processing — proven empirically with a GET SSE route in the
regression test. Treat every `req.on("close"/"aborted")` used for
abort/cleanup as suspect regardless of HTTP method; grep for the pattern
project-wide, not just on POST streaming routes.

**Verification tip:** don't reason from "the app works" — a dead abort listener is
silent. Reproduce with a tiny express+http server: attach both `req`/`res` close
listeners after `setImmediate` and assert which fires on a mid-stream client
`destroy()` — test both a POST and a bodyless GET route.
