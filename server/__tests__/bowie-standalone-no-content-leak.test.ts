/**
 * Task #5278 — Guard: the Bowie Standalone admin monitor must never leak
 * message content.
 *
 * server/routes/admin/bowie-standalone.ts is contractually metadata-only:
 * GET /stats must return connection/activity/security-block/persona/device
 * data WITHOUT ever including the text of a user message or an AI reply.
 * Today that invariant is enforced only by hand-written SELECT column lists.
 * This test locks the contract in two ways:
 *
 *  1. It inspects every column-set passed to db.select(...) by the route and
 *     asserts none of the selected keys look content-bearing (message,
 *     content, prompt, reply, text, ...). This fails immediately if a future
 *     edit adds e.g. `message: aiCallLogs.message` to a SELECT.
 *  2. It hits the actual HTTP handler (GET /stats) with realistic (clean)
 *     fake DB rows and asserts the response arrays (recentActivity,
 *     securityBlocks, devices) contain only allowlisted metadata keys — plus
 *     a standalone self-test proving that same allowlist check would in fact
 *     catch a poisoned row if one were ever returned. The route spreads raw
 *     query rows straight into the JSON response (no serialization-layer
 *     stripping), so the real enforcement point is what gets SELECTed —
 *     which is exactly what guard #1 and the exact-key-set checks pin down.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Forbidden key patterns — anything matching this must never appear in a
// SELECT projection or in the JSON response of the Bowie Standalone monitor.
// ---------------------------------------------------------------------------
const CONTENT_KEY_PATTERN = /message|content|prompt|reply|answer|question|body|payload|text\b/i;

// ---------------------------------------------------------------------------
// Mock db — captures every column-set passed to db.select() and serves a
// scripted queue of result rows (one per query, in call order) so the real
// route handler runs end-to-end without a database.
// ---------------------------------------------------------------------------

const capturedSelectColumns: Record<string, unknown>[] = [];
let resultsQueue: unknown[][] = [];

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const fn of ["from", "where", "orderBy", "limit", "groupBy", "leftJoin"]) {
    chain[fn] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

vi.mock("../db", () => ({
  db: {
    select: vi.fn((cols: Record<string, unknown>) => {
      capturedSelectColumns.push(cols);
      const result = resultsQueue.shift() ?? [];
      return makeChain(result);
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import under test — after mocks.
// ---------------------------------------------------------------------------
import express from "express";
import supertest from "supertest";
import bowieStandaloneRouter from "../routes/admin/bowie-standalone";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin/bowie-standalone", bowieStandaloneRouter);
  return app;
}

// Metadata-only allowlists per query, mirroring the route's intent.
const ALLOWED_RECENT_ACTIVITY_KEYS = new Set([
  "id",
  "createdAt",
  "persona",
  "provider",
  "modelId",
  "tokensIn",
  "tokensOut",
  "degraded",
  "securityBlocked",
  "userId",
]);
const ALLOWED_SECURITY_BLOCK_KEYS = new Set(["createdAt", "userId"]);
const ALLOWED_PERSONA_ROW_KEYS = new Set(["persona"]);
const ALLOWED_DEVICE_KEYS = new Set([
  "id",
  "deviceId",
  "userId",
  "nickname",
  "createdAt",
  "lastActiveAt",
  "active",
]);

beforeEach(() => {
  capturedSelectColumns.length = 0;
  resultsQueue = [
    // 1. tokenCounts
    [{ registered: 3, active: 2 }],
    // 2. recentActivity — exactly what the current route SELECTs (metadata only).
    [
      {
        id: "call-1",
        createdAt: new Date("2026-06-30T10:00:00.000Z"),
        persona: "bowie",
        provider: "groq",
        modelId: "llama-3",
        tokensIn: 12,
        tokensOut: 34,
        degraded: false,
        securityBlocked: false,
        userId: "user-1",
      },
    ],
    // 3. notifRows
    [{ status: "delivered", n: 5 }],
    // 4. securityRows — only timestamp + userId, as the route SELECTs today.
    [
      {
        createdAt: new Date("2026-06-30T09:00:00.000Z"),
        userId: "user-2",
      },
    ],
    // 5. personaRows
    [{ persona: "bowie" }, { persona: "horus" }],
    // 6. devices
    [
      {
        id: "tok-1",
        deviceId: "dev-1",
        userId: "user-1",
        nickname: "Mario",
        createdAt: new Date("2026-06-29T00:00:00.000Z"),
        lastActiveAt: new Date("2026-06-30T08:00:00.000Z"),
      },
    ],
  ];
});

describe("Bowie Standalone monitor — never leaks message content", () => {
  it("no SELECT column-set passed to db.select() looks content-bearing", async () => {
    const app = buildApp();
    await supertest(app).get("/api/admin/bowie-standalone/stats").expect(200);

    expect(capturedSelectColumns.length).toBeGreaterThan(0);
    for (const cols of capturedSelectColumns) {
      for (const key of Object.keys(cols)) {
        expect(
          CONTENT_KEY_PATTERN.test(key),
          `SELECT column "${key}" looks content-bearing — Bowie Standalone monitor must stay metadata-only`,
        ).toBe(false);
      }
    }
  });

  it("the two highest-risk queries (recentActivity, securityRows) SELECT an exact metadata key set", async () => {
    // Exact-set assertions (not just the regex heuristic above) so a column
    // renamed to a neutral alias (e.g. `m`, `raw`) can't silently slip past
    // the pattern check — any addition or removal fails this test.
    const app = buildApp();
    await supertest(app).get("/api/admin/bowie-standalone/stats").expect(200);

    // Call order matches the Promise.all array in the route: 0=tokenCounts,
    // 1=recentActivity, 2=notifRows, 3=securityRows, 4=personaRows, 5=devices.
    const recentActivityCols = Object.keys(capturedSelectColumns[1]).sort();
    const securityRowsCols = Object.keys(capturedSelectColumns[3]).sort();
    const personaRowsCols = Object.keys(capturedSelectColumns[4]).sort();
    // devices adds a derived "active" flag after the query (not selected),
    // so the SELECT-level key set omits it — checked against the response
    // shape (which does include it) in the response test below.
    const deviceCols = Object.keys(capturedSelectColumns[5]).sort();
    const expectedDeviceSelectCols = [...ALLOWED_DEVICE_KEYS].filter((k) => k !== "active").sort();

    expect(recentActivityCols).toEqual([...ALLOWED_RECENT_ACTIVITY_KEYS].sort());
    expect(securityRowsCols).toEqual([...ALLOWED_SECURITY_BLOCK_KEYS].sort());
    expect(personaRowsCols).toEqual([...ALLOWED_PERSONA_ROW_KEYS].sort());
    expect(deviceCols).toEqual(expectedDeviceSelectCols);
  });

  it("GET /stats response contains only metadata keys — no leaked content survives serialization", async () => {
    const app = buildApp();
    const res = await supertest(app).get("/api/admin/bowie-standalone/stats").expect(200);

    expect(res.body.success).toBe(true);

    // recentActivity rows: only known metadata keys survive.
    expect(Array.isArray(res.body.recentActivity)).toBe(true);
    expect(res.body.recentActivity.length).toBeGreaterThan(0);
    for (const row of res.body.recentActivity) {
      for (const key of Object.keys(row)) {
        expect(ALLOWED_RECENT_ACTIVITY_KEYS.has(key), `unexpected key "${key}" in recentActivity`).toBe(
          true,
        );
      }
    }

    // securityBlocks rows: only timestamp + userId.
    expect(Array.isArray(res.body.securityBlocks)).toBe(true);
    expect(res.body.securityBlocks.length).toBeGreaterThan(0);
    for (const row of res.body.securityBlocks) {
      for (const key of Object.keys(row)) {
        expect(ALLOWED_SECURITY_BLOCK_KEYS.has(key), `unexpected key "${key}" in securityBlocks`).toBe(
          true,
        );
      }
    }

    // personaBreakdown is derived, but confirm the underlying rows used only
    // the "persona" column (covered above via capturedSelectColumns too).
    expect(Array.isArray(res.body.personaBreakdown)).toBe(true);

    // devices: only known metadata keys survive.
    expect(Array.isArray(res.body.devices)).toBe(true);
    expect(res.body.devices.length).toBeGreaterThan(0);
    for (const row of res.body.devices) {
      for (const key of Object.keys(row)) {
        expect(ALLOWED_DEVICE_KEYS.has(key), `unexpected key "${key}" in devices`).toBe(true);
      }
    }

    // Sanity: no top-level key anywhere in the payload looks content-bearing.
    const allTopLevelKeys = Object.keys(res.body);
    for (const key of allTopLevelKeys) {
      expect(CONTENT_KEY_PATTERN.test(key), `top-level response key "${key}" looks content-bearing`).toBe(
        false,
      );
    }
  });

  it("fails the intent-check if a content-bearing column were ever added to a SELECT", () => {
    // Meta-test: prove CONTENT_KEY_PATTERN actually catches realistic leak
    // column names, so the guard above is not vacuously true.
    for (const leaked of ["message", "content", "prompt", "reply", "aiReply", "userMessage", "responseText"]) {
      expect(CONTENT_KEY_PATTERN.test(leaked)).toBe(true);
    }
    // And it doesn't false-positive on legitimate metadata columns used here.
    for (const legit of [...ALLOWED_RECENT_ACTIVITY_KEYS, ...ALLOWED_DEVICE_KEYS]) {
      expect(CONTENT_KEY_PATTERN.test(legit)).toBe(false);
    }
  });

  it("self-test: a poisoned row with a content-like key would be caught by the allowlist check", async () => {
    // Proves the allowlist assertions used above are not vacuous: if a query
    // ever returned an extra content-bearing property (e.g. because a future
    // edit widened the SELECT), the same check that passed above would fail.
    // Simulated here directly on a poisoned row shape, without needing to
    // change the mocked DB (the route spreads raw query rows into the JSON
    // response with no serialization-layer stripping, so the SELECT-level
    // checks above are the actual enforcement point).
    const poisonedRecentActivityRow = {
      id: "call-1",
      createdAt: new Date().toISOString(),
      persona: "bowie",
      provider: "groq",
      modelId: "llama-3",
      tokensIn: 1,
      tokensOut: 1,
      degraded: false,
      securityBlocked: false,
      userId: "user-1",
      message: "SECRET USER MESSAGE CONTENT",
    };
    const unexpectedKeys = Object.keys(poisonedRecentActivityRow).filter(
      (k) => !ALLOWED_RECENT_ACTIVITY_KEYS.has(k),
    );
    expect(unexpectedKeys).toEqual(["message"]);
    expect(unexpectedKeys.some((k) => CONTENT_KEY_PATTERN.test(k))).toBe(true);
  });
});
