/**
 * Guard: tc_terminal_apk_url persists across server restarts.
 *
 * Two categories of checks:
 *
 * 1. ROUTE LAYER — GET /tc-terminal-apk-url and PUT /tc-terminal-apk-url
 *    use getAppSetting / upsertAppSetting correctly. The GET response after a
 *    PUT reflects the saved value (simulating: save → restart → read back).
 *
 * 2. STATIC BOOT GUARD — confirms that no boot-phase code calls
 *    upsertAppSetting (or any raw SQL) with the key "tc_terminal_apk_url".
 *    A boot-time write would silently wipe an admin-set URL on every restart.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";

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
    execute: vi.fn().mockResolvedValue({ rowCount: 0 }),
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
// Tests
// ---------------------------------------------------------------------------

describe("tc_terminal_apk_url — route persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns empty string when no value has been saved yet", async () => {
    mockGetAppSetting.mockResolvedValueOnce(null);

    const app = buildApp();
    const res = await request(app).get("/api/admin/settings/tc-terminal-apk-url");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "" });
    expect(mockGetAppSetting).toHaveBeenCalledWith("tc_terminal_apk_url");
  });

  it("GET returns empty string when value is an empty string", async () => {
    mockGetAppSetting.mockResolvedValueOnce({ value: "" });

    const app = buildApp();
    const res = await request(app).get("/api/admin/settings/tc-terminal-apk-url");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "" });
  });

  it("PUT calls upsertAppSetting with the correct key and URL", async () => {
    const testUrl = "https://example.com/bowie-terminal.apk";
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "tc_terminal_apk_url", value: testUrl });

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/tc-terminal-apk-url")
      .send({ url: testUrl });

    expect(res.status).toBe(200);
    expect(mockUpsertAppSetting).toHaveBeenCalledWith("tc_terminal_apk_url", testUrl);
  });

  it("GET after PUT returns the saved URL (simulates restart read-back)", async () => {
    const testUrl = "https://cdn.example.com/bowie-1.2.3.apk";

    // Simulate: after a PUT the DB holds the value; on restart GET reads it back
    mockGetAppSetting.mockResolvedValueOnce({ key: "tc_terminal_apk_url", value: testUrl });

    const app = buildApp();
    const res = await request(app).get("/api/admin/settings/tc-terminal-apk-url");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: testUrl });
    expect(mockGetAppSetting).toHaveBeenCalledWith("tc_terminal_apk_url");
  });

  it("PUT with an arbitrary string value saves it (schema accepts any string)", async () => {
    // urlSettingSchema uses z.string().optional() — no URL-format enforcement;
    // the admin UI is responsible for passing valid URLs.
    const rawValue = "not-a-url";
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "tc_terminal_apk_url", value: rawValue });

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/tc-terminal-apk-url")
      .send({ url: rawValue });

    expect(res.status).toBe(200);
    expect(mockUpsertAppSetting).toHaveBeenCalledWith("tc_terminal_apk_url", rawValue);
  });

  it("PUT with missing url field saves undefined (schema field is optional)", async () => {
    mockUpsertAppSetting.mockResolvedValueOnce({ key: "tc_terminal_apk_url", value: undefined });

    const app = buildApp();
    const res = await request(app)
      .put("/api/admin/settings/tc-terminal-apk-url")
      .send({});

    expect(res.status).toBe(200);
    expect(mockUpsertAppSetting).toHaveBeenCalledWith("tc_terminal_apk_url", undefined);
  });

  it("GET returns 500 when storage throws", async () => {
    mockGetAppSetting.mockRejectedValueOnce(new Error("DB error"));

    const app = buildApp();
    const res = await request(app).get("/api/admin/settings/tc-terminal-apk-url");

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Static boot guard — no boot file may write tc_terminal_apk_url
// ---------------------------------------------------------------------------

describe("tc_terminal_apk_url — boot-phase static guard", () => {
  const KEY = "tc_terminal_apk_url";

  const bootFiles = [
    "server/boot-sequence.ts",
    "server/boot-phase3-db-init.ts",
  ];

  for (const relPath of bootFiles) {
    it(`${relPath} does NOT touch '${KEY}'`, () => {
      const absPath = path.resolve(process.cwd(), relPath);
      const content = fs.readFileSync(absPath, "utf8");
      expect(content).not.toContain(KEY);
    });
  }

  it("no boot-phase file in server/ upserts or resets tc_terminal_apk_url", () => {
    // Broader scan: any file matching server/boot*.ts
    const serverDir = path.resolve(process.cwd(), "server");
    const bootPhaseFiles = fs.readdirSync(serverDir).filter((f) => f.startsWith("boot") && f.endsWith(".ts"));

    for (const fname of bootPhaseFiles) {
      const content = fs.readFileSync(path.join(serverDir, fname), "utf8");
      expect(content, `${fname} must not reference ${KEY}`).not.toContain(KEY);
    }
  });
});
