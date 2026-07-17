/**
 * Guard: PUT /apk-url writes to DB key "apk_download_url" (not the
 * hyphenated path segment "apk-url").
 *
 * Before the fix, the route was shadowed by the generic /:key wildcard that
 * sits later in the file — Express would have matched /:key first, persisting
 * the setting under the key "apk-url" instead of "apk_download_url".
 * These tests confirm that the specific handler is reached and calls
 * upsertAppSetting with the correct underscored key.
 *
 * Also covers the GET /apk-url endpoint which reads from "apk_download_url".
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
// Tests — PUT endpoint
// ---------------------------------------------------------------------------

describe("apk_download_url — PUT endpoint writes correct DB key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PUT calls upsertAppSetting with key 'apk_download_url', not 'apk-url'", async () => {
    const testUrl = "https://cdn.example.com/bikerlink-latest.apk";
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "apk_download_url", value: testUrl });

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/apk-url")
      .send({ url: testUrl });

    expect(res.status).toBe(200);
    expect(mockUpsertAppSetting).toHaveBeenCalledWith("apk_download_url", testUrl);
    // Confirm the wrong key was never used
    const calls: [string, ...unknown[]][] = mockUpsertAppSetting.mock.calls;
    for (const [key] of calls) {
      expect(key).not.toBe("apk-url");
    }
  });

  it("generic /:key wildcard is NOT the handler — upsertAppSetting receives underscored key", async () => {
    // If /:key were intercepting, the key would be "apk-url" (hyphenated).
    // This test asserts the underscored form is always what reaches the DB.
    const testUrl = "https://cdn.example.com/bikerlink-2.0.apk";
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "apk_download_url", value: testUrl });

    const app = buildApp();
    await request(app)
      .put("/api/admin/settings/apk-url")
      .send({ url: testUrl });

    const [[calledKey]] = mockUpsertAppSetting.mock.calls as [[string, ...unknown[]]];
    expect(calledKey).toBe("apk_download_url");
    expect(calledKey).not.toContain("-");
  });

  it("PUT passes the url as second arg (value string), not third (valueJson)", async () => {
    // The handler calls upsertAppSetting(key, url) — value path, not valueJson.
    const testUrl = "https://releases.bikerlink.app/stable.apk";
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "apk_download_url", value: testUrl });

    const app = buildApp();
    await request(app)
      .put("/api/admin/settings/apk-url")
      .send({ url: testUrl });

    const [calledKey, calledValue, calledValueJson] = mockUpsertAppSetting.mock.calls[0] as [string, string, unknown];
    expect(calledKey).toBe("apk_download_url");
    expect(calledValue).toBe(testUrl);
    expect(calledValueJson).toBeUndefined();
  });

  it("PUT with missing url field saves undefined (schema field is optional)", async () => {
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "apk_download_url", value: undefined });

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/apk-url")
      .send({});

    expect(res.status).toBe(200);
    expect(mockUpsertAppSetting).toHaveBeenCalledWith("apk_download_url", undefined);
  });

  it("PUT returns 500 when upsertAppSetting throws", async () => {
    mockUpsertAppSetting.mockRejectedValueOnce(new Error("DB error"));

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/apk-url")
      .send({ url: "https://cdn.example.com/bikerlink.apk" });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Tests — GET endpoint
// ---------------------------------------------------------------------------

describe("apk_download_url — GET endpoint reads correct DB key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns empty string when no value has been saved yet", async () => {
    mockGetAppSetting.mockResolvedValueOnce(null);

    const app = buildApp();
    const res = await request(app).get("/api/admin/settings/apk-url");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "" });
    expect(mockGetAppSetting).toHaveBeenCalledWith("apk_download_url");
  });

  it("GET returns the saved URL after a PUT (simulates restart read-back)", async () => {
    const testUrl = "https://cdn.example.com/bikerlink-latest.apk";
    mockGetAppSetting.mockResolvedValueOnce({ key: "apk_download_url", value: testUrl });

    const app = buildApp();
    const res = await request(app).get("/api/admin/settings/apk-url");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: testUrl });
    expect(mockGetAppSetting).toHaveBeenCalledWith("apk_download_url");
  });

  it("GET returns 500 when storage throws", async () => {
    mockGetAppSetting.mockRejectedValueOnce(new Error("DB error"));

    const app = buildApp();
    const res = await request(app).get("/api/admin/settings/apk-url");

    expect(res.status).toBe(500);
  });
});
