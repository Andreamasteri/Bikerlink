/**
 * Task #332 — Confirm POST /debug/boot-gate/enable clears the appSettings cache
 * immediately, so the next getAppSetting("boot_gate_enabled") call reads from DB
 * and returns the new value — not the cached stale one.
 *
 * Strategy (same as admin-flag-cache-invalidation.test.ts):
 *   1. getAppSetting("boot_gate_enabled") to warm the cache.
 *   2. POST /api/debug/boot-gate/enable via supertest.
 *   3. Assert the next getAppSetting call bypasses the cache (db.select called again).
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted setup ─────────────────────────────────────────────────────────────

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
});

const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

// ── Mock: database ─────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([]) }) })),
    delete: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  },
  withDbRetry: <T>(fn: () => T): T => fn(),
  isPoolHealthy: () => true,
}));

// ── Mock: storage inheritance base ────────────────────────────────────────────

vi.mock("../storage/ads", () => ({ AdsStorage: class {} }));

// ── Mock: @shared/db schema objects ───────────────────────────────────────────

vi.mock("@shared/db", () => ({
  appSettings: { key: "key" },
  users: { id: "id", role: "role", email: "email" },
  otaReleases: {},
  thinkcentreHealthEvents: {},
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

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { SystemStorage } from "../storage/system";
import bootGateRouter from "../routes/debug/boot-gate";

const sharedStorage = new SystemStorage();

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function makeInsertChain() {
  return {
    values: () => ({
      onConflictDoUpdate: () => ({
        returning: () => Promise.resolve([makeSetting("boot_gate_enabled", "true")]),
      }),
    }),
  };
}

function makeSetting(key: string, value: string) {
  return { key, value, id: "1", description: null, valueJson: null, updatedAt: new Date() };
}

/**
 * Builds an Express app with a fake admin session injected so isAdminRequest()
 * can resolve the user role without a real DB session.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject a fake admin session
  app.use((_req, _res, next) => {
    (_req as express.Request & { session: { userId: number } }).session = { userId: 1 };
    next();
  });
  app.use("/api/debug/boot-gate", bootGateRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDbSelect.mockReset();
  mockDbInsert.mockReset();
  // Clear the module-level _appSettingsCache so tests start with a cold cache.
  sharedStorage.invalidateAppSettingCache();
});

describe("POST /debug/boot-gate/enable — cache invalidation", () => {
  it("returns the updated value on the next getAppSetting call, not the cached stale value", async () => {
    const storage = new SystemStorage();

    // ① Warm the cache — getAppSetting runs BEFORE the HTTP request, so its mock
    //   must be queued first (before the isAdminRequest user-lookup mock).
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("boot_gate_enabled", "false")]),
    );
    const before = await storage.getAppSetting("boot_gate_enabled");
    expect(before?.value).toBe("false");

    // ② POST /enable — isAdminRequest calls db.select for the user, then the
    //   handler inserts/upserts and calls invalidateAppSettingCache.
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: 1, role: "admin" }]));
    mockDbInsert.mockReturnValueOnce(makeInsertChain());

    const res = await request(buildApp())
      .post("/api/debug/boot-gate/enable")
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.bootGateEnabled).toBe(true);

    // ③ Cache must have been invalidated: the next read goes to DB and returns
    //   the new value, not the stale cached "false".
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("boot_gate_enabled", "true")]),
    );
    const after = await storage.getAppSetting("boot_gate_enabled");
    expect(after?.value).toBe("true");

    // db.select was called for: warm-up + isAdminRequest + post-invalidation miss = 3
    expect(mockDbSelect).toHaveBeenCalledTimes(3);
  });

  it("disable path: cache is also cleared when disabling the boot gate", async () => {
    const storage = new SystemStorage();

    // ① Warm cache with enabled=true
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("boot_gate_enabled", "true")]),
    );
    const before = await storage.getAppSetting("boot_gate_enabled");
    expect(before?.value).toBe("true");

    // ② POST /enable with enabled=false
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: 1, role: "admin" }]));
    mockDbInsert.mockReturnValueOnce(makeInsertChain());

    const res = await request(buildApp())
      .post("/api/debug/boot-gate/enable")
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.bootGateEnabled).toBe(false);

    // ③ Next read must bypass the cache
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeSetting("boot_gate_enabled", "false")]),
    );
    const after = await storage.getAppSetting("boot_gate_enabled");
    expect(after?.value).toBe("false");
    expect(mockDbSelect).toHaveBeenCalledTimes(3);
  });
});
