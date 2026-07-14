---
name: drizzle-orm sql mock gap for agent-importing tests
description: Any vitest test importing the AI assistant agent must export `sql` from its drizzle-orm mock.
---

# `sql` must be in the drizzle-orm mock when importing the assistant agent

Importing `server/ai/assistant/agent.ts` transitively pulls in
`horus-analyzer` → `db-integrity/...` → `db-integrity/checks/counters.ts`, which
calls the drizzle **`sql` tagged template at module scope**. If a test does
`vi.mock("drizzle-orm", () => ({ eq, desc }))` without `sql`, the whole suite
fails at import with: *No "sql" export is defined on the "drizzle-orm" mock*.

**Fix:** add a callable `sql` (tagged-template shape) to the mock:
```ts
vi.mock("drizzle-orm", () => {
  const sql = vi.fn((strings, ...values) => ({ __sql: strings, values }));
  (sql as unknown as { raw: unknown }).raw = vi.fn((s) => ({ __rawSql: s }));
  return { eq: vi.fn(...), desc: vi.fn(...), sql };
});
```

**Why:** the module-scope `sql` call runs at import time, before any test body.
This is a pre-existing gap (introduced when horus-analyzer wired in db-integrity)
that affects every agent-importing test; several older assistant tests
(multimodal, intro-poems) still carry the gap and belong to the "restore broken
AI assistant tests" cleanup, not to individual feature work.
