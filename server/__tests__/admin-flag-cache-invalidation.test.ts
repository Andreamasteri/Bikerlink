/**
 * Task #328 — Confirm admin flag toggles take effect immediately,
 * not after a 60-second cache delay.
 *
 * Strategy
 * --------
 * Each test:
 *   1. Calls `storage.getAppSetting(key)` to warm the in-memory cache.
 *   2. Invokes the admin POST route via supertest (maintenance, powered-off,
 *      ignore-for-tests, OTA emergency toggle).
 *   3. Asserts the next `storage.getAppSetting(key)` call bypasses the cache
 *      (db.select is called again) and returns the new value — not the stale one.
 *
 * The test shares the same `storage` singleton that the route uses, so cache
 * state is authentic. `db.select` is mocked with per-call return values to
 * simulate the DB returning the old value on the warm-up and the new value
 * after the route's upsert.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted setup ─────────────────────────────────────────────────────────────

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
});

const { mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

// ── Mock: database ─────────────────────────────────────────────────────────────
// withDbRetry is kept as a passthrough to avoid masking real route logic.

vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  },
  withDbRetry: <T>(fn: () => T): T => fn(),
  isPoolHealthy: () => true,
}));

// ── Mock: storage inheritance base ────────────────────────────────────────────
// Breaks the AdsStorage → ... chain so SystemStorage can be instantiated alone.

vi.mock("../storage/ads", () => ({ AdsStorage: class {} }));

// ── Mock: @shared/db schema objects ───────────────────────────────────────────

vi.mock("@shared/db", () => ({
  appSettings: { key: "key" },
  otaReleases: { id: "id", channel: "channel", status: "status" },
  thinkcentreHealthEvents: {},
  users: {},
  notifications: {},
  invitationCodes: {},
  feedbackTickets: {},
  phoneSharingTracker: {},
  workshopContacts: {},
}));

// ── Mock: drizzle-orm operators ───────────────────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

// ── Mock: ThinkCentre flag lib modules ────────────────────────────────────────
// These must be hoisted so vi.mock factories can reference them.

const {
  resetMaintenanceCacheMock,
  resetPoweredOffCacheMock,
  resetOfflineCacheMock,
  resetIgnoreTestsCacheMock,
} = vi.hoisted(() => ({
  resetMaintenanceCacheMock: vi.fn(),
  resetPoweredOffCacheMock: vi.fn(),
  resetOfflineCacheMock: vi.fn(),
  resetIgnoreTestsCacheMock: vi.fn(),
}));

vi.mock("../lib/thinkcentre-maintenance", () => ({
  isThinkCentreInMaintenance: vi.fn(async () => false),
  resetThinkCentreMaintenanceCache: resetMaintenanceCacheMock,
}));

vi.mock("../lib/thinkcentre-powered-off", () => ({
  isThinkCentrePoweredOff: vi.fn(async () => false),
  resetThinkCentrePoweredOffCache: resetPoweredOffCacheMock,
}));

vi.mock("../lib/thinkcentre-offline", () => ({
  resetThinkCentreOfflineCache: resetOfflineCacheMock,
  isThinkCentreOffline: vi.fn(async () => false),
}));

vi.mock("../lib/thinkcentre-ignore-tests", () => ({
  isThinkCentreIgnoredForTests: vi.fn(async () => false),
  resetThinkCentreIgnoreForTestsCache: resetIgnoreTestsCacheMock,
}));

// ── Mock: thinkcentre-health probe sub-modules ────────────────────────────────

vi.mock("../routes/admin/thinkcentre-health-utils", () => ({
  isStartingUp: vi.fn(() => false),
  tokenFingerprint: vi.fn(() => null),
  httpProbe: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
  sanitizeError: (e: unknown) => String(e),
}));

vi.mock("../routes/admin/thinkcentre-health-vn-probes", () => ({
  probeValhallaDetailed: vi.fn(async () => ({ configured: false, ok: false })),
  probePhotonDetailed: vi.fn(async () => ({ configured: false, ok: false })),
  probeUfwDetailed: vi.fn(async () => ({ configured: false, ok: false })),
}));

vi.mock("../routes/admin/thinkcentre-health-infra-probes", () => ({
  probeDragonflyInfra: vi.fn(async () => ({ configured: false, ok: false })),
  probeNginxInfra: vi.fn(async () => ({ configured: false, ok: false })),
  probeNginxSymlinksInfra: vi.fn(async () => ({ configured: false, ok: true })),
  probeUptimeKuma: vi.fn(async () => ({ configured: false, ok: false })),
  probeAiHub: vi.fn(async () => ({ configured: false, ok: false })),
}));

vi.mock("../routes/admin/thinkcentre-health-gh-probes", () => ({
  probeGraphHopperAreas: vi.fn(async () => ({ configured: false, ok: false, areas: [], url: null, tokenMissing: false })),
  probeOllama: vi.fn(async () => ({ configured: false, ok: false })),
  probeWhisper: vi.fn(async () => ({ configured: false, ok: false })),
}));

vi.mock("../routes/admin/thinkcentre-health-ares-probe", () => ({
  probeAres: vi.fn(async () => ({ configured: false, online: false })),
}));

vi.mock("../routes/admin/thinkcentre-health-repodrift-probe", () => ({
  probeRepoDrift: vi.fn(async () => ({ ok: true })),
  fixRepoDrift: vi.fn(async () => ({ ok: true, fixedFiles: [], errors: [] })),
}));

vi.mock("../routes/admin/thinkcentre-health.part2", () => ({
  updateThinkCentreSystemStatus: vi.fn(async () => {}),
  probeThinkCentreStatusSnapshot: vi.fn(async () => ({})),
}));

vi.mock("../lib/ollama-client", () => ({
  getOllamaModelId: vi.fn(() => "qwen3:4b"),
}));

// ── Mock: OTA route sub-modules ───────────────────────────────────────────────

vi.mock("../routes/admin/ota-sync", () => ({
  EAS_PROJECT_ID: "test-project-id",
  triggerSyncInBackground: vi.fn(),
  forceSyncNow: vi.fn(async () => ({ inserted: 0, backfilled: 0 })),
  syncProductionUpdates: vi.fn(async () => ({ inserted: 0 })),
}));

vi.mock("../routes/admin/ota.part2", () => {
  const { Router } = require("express");
  return { default: Router() };
});

// ── Mock: api-response ────────────────────────────────────────────────────────

vi.mock("../lib/api-response", () => ({
  sendError: (res: express.Response, status: number, msg: string) =>
    res.status(status).json({ error: msg }),
}));

// ── Mock: system-status-cache (used transitively) ─────────────────────────────

vi.mock("../lib/system-status-cache", () => ({
  updateSystemStatus: vi.fn(async () => {}),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { SystemStorage } from "../storage/system";
import thinkcentreRouter from "../routes/admin/thinkcentre-health";
import otaRouter from "../routes/admin/ota";

// Shared instance used to manipulate/inspect the module-level cache.
const sharedStorage = new SystemStorage();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a db.select() chain stub that resolves to `rows`.
 * Matches the pattern used in getAppSetting:
 *   db.select().from(...).where(...).limit(1)
 */
function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
        orderBy: () => ({ limit: () => Promise.resolve(rows) }),
      }),
      orderBy: () => ({ limit: () => Promise.resolve(rows) }),
      limit: () => Promise.resolve(rows),
    }),
  };
}

/**
 * Creates a db.insert() chain stub that matches upsertAppSetting:
 *   db.insert().values().onConflictDoUpdate().returning()
 */
function makeInsertChain() {
  return {
    values: () => ({
      onConflictDoUpdate: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
  };
}

function buildThinkCentreApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", thinkcentreRouter);
  return app;
}

function buildOtaApp() {
  const app = express();
  app.use(express.json());
  // Inject a fake session with userId so OTA toggle doesn't crash on req.session.userId!
  app.use((_req, _res, next) => {
    (_req as express.Request & { session: { userId: number } }).session = { userId: 1 };
    next();
  });
  app.use("/api/admin/ota", otaRouter);
  return app;
}

// AppSetting row factory
function makeSetting(key: string, value: string) {
  return { key, value, id: "1", description: null, valueJson: null, updatedAt: new Date() };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDbSelect.mockReset();
  mockDbInsert.mockReset();
  mockDbUpdate.mockReset();
  resetMaintenanceCacheMock.mockReset();
  resetPoweredOffCacheMock.mockReset();
  resetOfflineCacheMock.mockReset();
  resetIgnoreTestsCacheMock.mockReset();
  // Clear the module-level _appSettingsCache so tests start with a cold cache.
  sharedStorage.invalidateAppSettingCache();
});

describe("POST /thinkcentre/maintenance — cache invalidation", () => {
  it("returns the updated value on the next getAppSetting call, not the cached stale value", async () => {
    const storage = new SystemStorage();

    // ① Warm the cache: DB returns value="false"
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("thinkcentre_maintenance_mode", "false")]),
    );
    const before = await storage.getAppSetting("thinkcentre_maintenance_mode");
    expect(before?.value).toBe("false");

    // ② POST route: upserts value="true" in DB, then calls invalidateAppSettingCache
    mockDbInsert.mockReturnValueOnce(makeInsertChain());
    const res = await request(buildThinkCentreApp())
      .post("/api/admin/thinkcentre/maintenance")
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // ③ After invalidation: DB now returns value="true" — cache must be bypassed
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("thinkcentre_maintenance_mode", "true")]),
    );
    const after = await storage.getAppSetting("thinkcentre_maintenance_mode");
    expect(after?.value).toBe("true");

    // The select was called twice (warm-up + post-invalidation miss), proving
    // the cache was indeed cleared by the route.
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it("calls the ThinkCentre-specific reset helpers alongside the generic cache invalidation", async () => {
    mockDbInsert.mockReturnValueOnce(makeInsertChain());
    await request(buildThinkCentreApp())
      .post("/api/admin/thinkcentre/maintenance")
      .send({ enabled: false });
    expect(resetOfflineCacheMock).toHaveBeenCalled();
    expect(resetMaintenanceCacheMock).toHaveBeenCalled();
  });
});

describe("POST /thinkcentre/powered-off — cache invalidation", () => {
  it("returns the updated value on the next getAppSetting call, not the cached stale value", async () => {
    const storage = new SystemStorage();

    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("thinkcentre_powered_off", "false")]),
    );
    const before = await storage.getAppSetting("thinkcentre_powered_off");
    expect(before?.value).toBe("false");

    mockDbInsert.mockReturnValueOnce(makeInsertChain());
    const res = await request(buildThinkCentreApp())
      .post("/api/admin/thinkcentre/powered-off")
      .send({ enabled: true });
    expect(res.status).toBe(200);

    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("thinkcentre_powered_off", "true")]),
    );
    const after = await storage.getAppSetting("thinkcentre_powered_off");
    expect(after?.value).toBe("true");

    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it("calls the powered-off and offline reset helpers", async () => {
    mockDbInsert.mockReturnValueOnce(makeInsertChain());
    await request(buildThinkCentreApp())
      .post("/api/admin/thinkcentre/powered-off")
      .send({ enabled: false });
    expect(resetOfflineCacheMock).toHaveBeenCalled();
    expect(resetPoweredOffCacheMock).toHaveBeenCalled();
  });
});

describe("POST /thinkcentre/ignore-for-tests — cache invalidation", () => {
  it("returns the updated value on the next getAppSetting call, not the cached stale value", async () => {
    const storage = new SystemStorage();

    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("thinkcentre_ignore_for_tests", "false")]),
    );
    const before = await storage.getAppSetting("thinkcentre_ignore_for_tests");
    expect(before?.value).toBe("false");

    mockDbInsert.mockReturnValueOnce(makeInsertChain());
    const res = await request(buildThinkCentreApp())
      .post("/api/admin/thinkcentre/ignore-for-tests")
      .send({ enabled: true });
    expect(res.status).toBe(200);

    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("thinkcentre_ignore_for_tests", "true")]),
    );
    const after = await storage.getAppSetting("thinkcentre_ignore_for_tests");
    expect(after?.value).toBe("true");

    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it("calls the ignore-for-tests reset helper", async () => {
    mockDbInsert.mockReturnValueOnce(makeInsertChain());
    await request(buildThinkCentreApp())
      .post("/api/admin/thinkcentre/ignore-for-tests")
      .send({ enabled: false });
    expect(resetIgnoreTestsCacheMock).toHaveBeenCalled();
  });
});

describe("POST /ota/emergency/toggle — cache invalidation", () => {
  it("deactivation: returns the updated value on the next getAppSetting call", async () => {
    const storage = new SystemStorage();

    // ① Warm cache: active="true"
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("ota_emergency_active", "true")]),
    );
    const before = await storage.getAppSetting("ota_emergency_active");
    expect(before?.value).toBe("true");

    // ② Route: active=false skips the approved-release guard entirely.
    //    Route calls storage.upsertAppSetting → db.insert().values().onConflictDoUpdate().returning().
    mockDbInsert.mockReturnValueOnce(makeInsertChain());

    const res = await request(buildOtaApp())
      .post("/api/admin/ota/emergency/toggle")
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.active).toBe(false);

    // ③ Cache must have been invalidated: DB now returns "false"
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("ota_emergency_active", "false")]),
    );
    const after = await storage.getAppSetting("ota_emergency_active");
    expect(after?.value).toBe("false");

    // 2 total selects: warmup + post-invalidation miss (no extra selects in the route)
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it("activation: cache is cleared after upsert succeeds", async () => {
    const storage = new SystemStorage();

    // ① Warm cache: setting absent → undefined
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
    const before = await storage.getAppSetting("ota_emergency_active");
    expect(before).toBeUndefined();

    // ② Route: active=true → checks approved emergency release (1 select),
    //    then calls storage.upsertAppSetting (1 insert, no further selects).
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "approved-release" }]), // approved guard
    );
    // storage.upsertAppSetting → db.insert().values().onConflictDoUpdate().returning()
    mockDbInsert.mockReturnValueOnce(makeInsertChain());

    const res = await request(buildOtaApp())
      .post("/api/admin/ota/emergency/toggle")
      .send({ active: true });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);

    // ③ Cache must be cleared: DB returns the new row
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("ota_emergency_active", "true")]),
    );
    const after = await storage.getAppSetting("ota_emergency_active");
    expect(after?.value).toBe("true");

    // 3 selects: warmup + approved-guard + post-invalidation miss
    expect(mockDbSelect).toHaveBeenCalledTimes(3);
  });

  it("rejects activation when no approved emergency release exists", async () => {
    // approved guard returns empty → 400
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
    const res = await request(buildOtaApp())
      .post("/api/admin/ota/emergency/toggle")
      .send({ active: true });
    expect(res.status).toBe(400);
  });
});
