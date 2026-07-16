/**
 * Task #333 — Confirm the OTA emergency redirect activates within seconds of
 * the admin toggle, not after a CDN or HTTP cache window.
 *
 * Propagation model
 * -----------------
 *   1. Admin POSTs to /api/admin/ota/emergency/toggle → DB updated in < 100 ms.
 *   2. storage.invalidateAppSettingCache("ota_emergency_active") is called
 *      immediately, clearing any in-process cache (relevant to other callers).
 *   3. /api/ota/manifest reads ota_emergency_active directly from the DB on
 *      EVERY request (no storage.getAppSetting(), no in-process cache).
 *   4. Cache-Control: no-store on the manifest response prevents any CDN or
 *      reverse proxy from serving a stale JSON body.
 *
 * End-to-end propagation time ≈ round-trip to DB after the toggle completes
 * (typically < 100 ms on the same region). There is no CDN window, no HTTP
 * cache window, and no in-process cache window on the manifest path.
 *
 * Tests below verify:
 *   A. Cache-Control: no-store is present on every manifest response.
 *   B. The manifest reflects the current DB value on each individual request
 *      (two consecutive requests with different DB states return different channels).
 *   C. emergency_active=true → channel "emergency" in response.
 *   D. emergency_active=false → channel "production" in response.
 *   E. ota_channel_locked=true → allowed:false regardless of the emergency flag.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted setup ─────────────────────────────────────────────────────────────

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
});

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: { select: mockDbSelect },
  withDbRetry: <T>(fn: () => T): T => fn(),
  pool: {
    query: vi.fn(async () => ({ rows: [] })),
  },
  isPoolHealthy: () => true,
}));

vi.mock("@shared/db", () => ({
  appSettings: { key: "key", value: "value" },
  otaReleases: {
    id: "id",
    channel: "channel",
    status: "status",
    easUpdateId: "easUpdateId",
    easGroupId: "easGroupId",
    runtimeVersion: "runtimeVersion",
    otaVersion: "otaVersion",
    message: "message",
    publishedAt: "publishedAt",
  },
  users: { id: "id", role: "role" },
  otaBootEvents: {},
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a db.select() chain that returns `rows` as the final resolved value.
 *
 * Drizzle query builders are thenables — awaiting .where() directly (without
 * .limit()) must also resolve.  We wrap each step as a Promise that also exposes
 * .limit() / .orderBy() for further chaining so ALL the query shapes used in
 * ota-public.ts resolve correctly:
 *   - .from().where().orderBy().limit()  (release query)
 *   - .from().where()                    (group-records query, awaited directly)
 *   - .from().where().limit()            (appSettings reads)
 */
function makeSelectChain(rows: unknown[]) {
  function thenable(r: unknown[]): Promise<unknown[]> & { limit: () => Promise<unknown[]>; orderBy: () => ReturnType<typeof thenable> } {
    const p = Promise.resolve(r) as Promise<unknown[]> & { limit: () => Promise<unknown[]>; orderBy: () => ReturnType<typeof thenable> };
    p.limit = () => Promise.resolve(r);
    p.orderBy = () => thenable(r);
    return p;
  }
  return {
    from: () => ({
      where: () => thenable(rows),
      orderBy: () => thenable(rows),
      limit: () => Promise.resolve(rows),
    }),
  };
}

/** AppSetting row stub. */
function makeSettingRow(key: string, value: string) {
  return { key, value, id: "s1", description: null, valueJson: null, updatedAt: new Date() };
}

/** OTA release row stub. */
function makeReleaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    easUpdateId: "eas-update-1",
    easGroupId: "eas-group-1",
    runtimeVersion: "10.0.0",
    otaVersion: 42,
    status: "approved",
    message: "test release",
    channel: "production",
    ...overrides,
  };
}

/**
 * Builds the app that serves /api/ota/manifest.
 * Accepts an optional userId in session (undefined = anonymous).
 */
function buildManifestApp(sessionUserId?: string) {
  const app = express();
  app.use(express.json());
  // Inject a fake session (anonymous unless sessionUserId is provided)
  app.use((_req, _res, next) => {
    (_req as express.Request & { session: { userId?: string } }).session = {
      userId: sessionUserId,
    };
    next();
  });
  // Import router lazily after mocks are in place — require works in vi context.
  // We use dynamic import at module level below.
  return app;
}

// Import the router AFTER all mocks are registered.
import otaPublicRouter from "../routes/ota-public";

function buildApp(sessionUserId?: string) {
  const app = buildManifestApp(sessionUserId);
  app.use("/api/ota", otaPublicRouter);
  return app;
}

// ── State shared across tests ─────────────────────────────────────────────────

beforeEach(() => {
  mockDbSelect.mockReset();
});

// ── Test A: Cache-Control header ──────────────────────────────────────────────

describe("GET /api/ota/manifest — Cache-Control header", () => {
  it("always returns Cache-Control: no-store regardless of DB state", async () => {
    // DB: channel_locked=false, emergency_active=false, no release found → allowed:false
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("boot_gate_enabled", "false")])) // boot_gate
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_channel_locked", "false")])) // lock
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_emergency_active", "false")])) // emcy
      .mockReturnValueOnce(makeSelectChain([])) // getUserRole → no user row
      .mockReturnValueOnce(makeSelectChain([])); // no release

    const res = await request(buildApp()).get("/api/ota/manifest");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("returns Cache-Control: no-store even when channel_locked blocks the response early", async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("boot_gate_enabled", "false")])) // boot_gate
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_channel_locked", "true")])); // lock → early return

    const res = await request(buildApp()).get("/api/ota/manifest");
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toBe("channel_locked");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

// ── Tests B–D: Emergency redirect propagation ─────────────────────────────────

describe("GET /api/ota/manifest — emergency redirect propagation", () => {
  // Note: getUserRole() returns null immediately when userId is undefined (anonymous),
  // so it makes NO db.select() call. Mock sequences for anonymous users skip that slot.

  it("returns channel=emergency when ota_emergency_active=true (anonymous user)", async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("boot_gate_enabled", "false")])) // boot_gate
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_channel_locked", "false")])) // lock
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_emergency_active", "true")])) // emcy ON
      // getUserRole: no DB call (userId=undefined → early return)
      .mockReturnValueOnce(makeSelectChain([makeReleaseRow({ channel: "emergency" })])) // release
      .mockReturnValueOnce(makeSelectChain([makeReleaseRow({ channel: "emergency" })])); // group records

    const res = await request(buildApp()).get("/api/ota/manifest");
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.channel).toBe("emergency");
  });

  it("returns channel=production when ota_emergency_active=false (anonymous user)", async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("boot_gate_enabled", "false")])) // boot_gate
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_channel_locked", "false")])) // lock
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_emergency_active", "false")])) // emcy OFF
      // getUserRole: no DB call (userId=undefined → early return)
      .mockReturnValueOnce(makeSelectChain([makeReleaseRow({ channel: "production" })])) // release
      .mockReturnValueOnce(makeSelectChain([makeReleaseRow({ channel: "production" })])); // group records

    const res = await request(buildApp()).get("/api/ota/manifest");
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.channel).toBe("production");
  });

  it("two consecutive requests with different DB values return different channels (no in-process or HTTP cache coalescence)", async () => {
    const app = buildApp();

    // First request: emergency OFF → production
    // getUserRole: no DB call (userId=undefined → early return)
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("boot_gate_enabled", "false")]))
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_channel_locked", "false")]))
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_emergency_active", "false")])) // flag OFF
      .mockReturnValueOnce(makeSelectChain([makeReleaseRow({ channel: "production" })]))
      .mockReturnValueOnce(makeSelectChain([makeReleaseRow({ channel: "production" })]));

    const res1 = await request(app).get("/api/ota/manifest");
    expect(res1.body.channel).toBe("production");
    expect(res1.headers["cache-control"]).toBe("no-store");

    // Second request: emergency ON → emergency (simulates toggle having happened in DB)
    // getUserRole: no DB call (userId=undefined → early return)
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("boot_gate_enabled", "false")]))
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_channel_locked", "false")]))
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_emergency_active", "true")])) // flag ON
      .mockReturnValueOnce(makeSelectChain([makeReleaseRow({ channel: "emergency" })]))
      .mockReturnValueOnce(makeSelectChain([makeReleaseRow({ channel: "emergency" })]));

    const res2 = await request(app).get("/api/ota/manifest");
    expect(res2.body.channel).toBe("emergency");
    expect(res2.headers["cache-control"]).toBe("no-store");

    // The two responses differ — confirming no caching layer coalesced them.
    expect(res1.body.channel).not.toBe(res2.body.channel);
  });
});

// ── Test E: channel_locked overrides emergency flag ───────────────────────────

describe("GET /api/ota/manifest — channel_locked overrides emergency", () => {
  it("returns allowed:false with reason=channel_locked even when emergency is active", async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("boot_gate_enabled", "false")])) // boot_gate
      .mockReturnValueOnce(makeSelectChain([makeSettingRow("ota_channel_locked", "true")])); // lock wins

    // ota_emergency_active is never read because the lock early-returns.
    const res = await request(buildApp()).get("/api/ota/manifest");
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toBe("channel_locked");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
