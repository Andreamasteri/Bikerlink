/**
 * Guard: PUT /native-version writes to DB key "native_version" (not the
 * hyphenated path segment "native-version").
 *
 * Before the fix, the route was shadowed by the generic /:key wildcard that
 * sits later in the file — Express would have matched /:key first, persisting
 * the setting under the key "native-version" instead of "native_version".
 * These tests confirm that the specific handler is reached and calls
 * upsertAppSetting with the correct underscored key.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock state — before vi.mock() calls
// ---------------------------------------------------------------------------

const { mockGetAppSetting, mockUpsertAppSetting } = vi.hoisted(() => ({
  mockGetAppSetting: vi.fn(),
  mockUpsertAppSetting: vi.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: mockGetAppSetting,
    upsertAppSetting: mockUpsertAppSetting,
    getAllAppSettings: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../db", async () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    transaction: vi.fn(),
  },
  pool: {
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
  },
  withDbRetry: vi.fn().mockImplementation((fn: () => unknown) => fn()),
  isTransientDbError: vi.fn().mockReturnValue(false),
}));

vi.mock("../ai/watchdog/collectors/pool-collector", () => ({
  invalidateIdleKillCache: vi.fn(),
}));

vi.mock("../fake-activity", () => ({
  isGlobalVisibilityOn: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Import the router under test — AFTER mocks
// ---------------------------------------------------------------------------

import settingsRouter from "../routes/admin/settings";

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  // Bypass auth — settings.ts router handles the route logic, we test that only
  app.use("/api/admin/settings", settingsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Valid body fixture
// ---------------------------------------------------------------------------

const VALID_BODY = {
  android: { latestVersion: "2.1.0", minVersion: "1.8.0", storeUrl: "https://play.google.com/store/apps/details?id=com.bikerlink" },
  ios: { latestVersion: "2.1.0", minVersion: "1.8.0", storeUrl: "https://apps.apple.com/app/bikerlink/id123456789" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("native_version — PUT endpoint writes correct DB key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PUT calls upsertAppSetting with key 'native_version', not 'native-version'", async () => {
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "native_version", valueJson: VALID_BODY });

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/native-version")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    // The second arg is undefined (valueJson path, not value string)
    expect(mockUpsertAppSetting).toHaveBeenCalledWith("native_version", undefined, VALID_BODY);
    // Confirm the wrong key was never used
    const calls: [string, ...unknown[]][] = mockUpsertAppSetting.mock.calls;
    for (const [key] of calls) {
      expect(key).not.toBe("native-version");
    }
  });

  it("PUT stores the full android+ios structure as third argument (valueJson path)", async () => {
    const customBody = {
      android: { latestVersion: "3.0.0", minVersion: "2.0.0", storeUrl: "https://play.google.com/bikerlink" },
      ios: { latestVersion: "3.0.0", minVersion: "2.0.0", storeUrl: "https://apps.apple.com/bikerlink" },
    };
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "native_version", valueJson: customBody });

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/native-version")
      .send(customBody);

    expect(res.status).toBe(200);
    expect(mockUpsertAppSetting).toHaveBeenCalledWith("native_version", undefined, customBody);
  });

  it("PUT with missing android field returns 400 (schema validation)", async () => {
    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/native-version")
      .send({ android: { latestVersion: "1.0.0", minVersion: "1.0.0", storeUrl: "https://x.com" } });
    // ios is missing
    expect(res.status).toBe(400);
    expect(mockUpsertAppSetting).not.toHaveBeenCalled();
  });

  it("PUT with missing required field inside android returns 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/native-version")
      .send({
        android: { latestVersion: "1.0.0", minVersion: "1.0.0" /* storeUrl missing */ },
        ios: { latestVersion: "1.0.0", minVersion: "1.0.0", storeUrl: "https://x.com" },
      });
    expect(res.status).toBe(400);
    expect(mockUpsertAppSetting).not.toHaveBeenCalled();
  });

  it("PUT returns 500 when upsertAppSetting throws", async () => {
    mockUpsertAppSetting.mockRejectedValueOnce(new Error("DB error"));

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/native-version")
      .send(VALID_BODY);

    expect(res.status).toBe(500);
  });

  it("generic /:key wildcard is NOT the handler — upsertAppSetting receives underscored key", async () => {
    // If /:key were intercepting, the key would be "native-version" (hyphenated).
    // This test asserts the underscored form is always what reaches the DB.
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "native_version", valueJson: VALID_BODY });

    const app = buildApp();
    await request(app)
      .put("/api/admin/settings/native-version")
      .send(VALID_BODY);

    const [[calledKey]] = mockUpsertAppSetting.mock.calls as [[string, ...unknown[]]];
    expect(calledKey).toBe("native_version");
    expect(calledKey).not.toContain("-");
  });
});
