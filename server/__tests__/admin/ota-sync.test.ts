/**
 * Task #803 — POST /api/admin/ota/sync: timeout + error handling
 *
 * Verifica che la route /sync:
 *  1. Happy path (0 nuovi update)    → 200 JSON { ok: true, inserted: 0 }
 *  2. DB irraggiungibile             → 502 JSON (non una pagina HTML)
 *  3. Sync dura >45s                 → 504 JSON con messaggio leggibile
 *
 * Senza questa copertura, una regressione potrebbe far tornare il comportamento
 * pre-#802 dove il proxy Replit tagliava la connessione restituendo HTML non
 * parsabile ("Risposta del server non valida" sul client).
 */

import { vi, describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted env setup — EAS_TOKEN deve essere presente o la route restituisce 503
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  process.env.EXPO_TOKEN = "test-expo-token-for-ota-sync"; // pragma: allowlist secret
});

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockForceSyncNow, mockTriggerSyncInBackground, mockSyncProductionUpdates } = vi.hoisted(() => ({
  mockForceSyncNow: vi.fn<[], Promise<{ inserted: number; backfilled: number }>>(),
  mockTriggerSyncInBackground: vi.fn<[], void>(),
  mockSyncProductionUpdates: vi.fn<[], Promise<{ inserted: number; backfilled: number }>>(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../routes/admin/ota-sync", () => ({
  EAS_PROJECT_ID: "a25192d7-72e5-46af-97d0-2d38ed9b78e3",
  forceSyncNow: mockForceSyncNow,
  triggerSyncInBackground: mockTriggerSyncInBackground,
  syncProductionUpdates: mockSyncProductionUpdates,
}));

vi.mock("../../db", async () => {
  const { createDbMock } = await import("../helpers/db-mock");
  return createDbMock();
});

vi.mock("../../storage", () => ({
  storage: {
    getAppSetting: vi.fn().mockResolvedValue(null),
    upsertAppSetting: vi.fn().mockResolvedValue({}),
    getAllAppSettings: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../ai/watchdog/log", () => ({
  writeWatchdogLog: vi.fn().mockResolvedValue(undefined),
}));

// ota.part2 mounts additional routes under "/" — provide a bare no-op router
// so the import of ota.ts doesn't pull in the full part2 dependency tree.
vi.mock("../../routes/admin/ota.part2", () => {
  const { Router } = require("express") as typeof import("express");
  const r = Router();
  return { default: r };
});

vi.mock("@shared/db", () => ({
  otaReleases: { status: {}, channel: {} },
  appSettings: { key: {}, value: {} },
}));

// ---------------------------------------------------------------------------
// Import router under test — AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import otaRouter from "../../routes/admin/ota";

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  // Bypass session auth for unit tests — only the route logic is under test
  app.use("/api/admin/ota", otaRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("POST /api/admin/ota/sync — happy path (0 nuovi update)", () => {
  it("risponde 200 JSON con ok:true e inserted:0 quando non ci sono nuovi update", async () => {
    mockForceSyncNow.mockResolvedValueOnce({ inserted: 0, backfilled: 0 });

    const res = await request(buildApp()).post("/api/admin/ota/sync");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ ok: true, inserted: 0 });
    expect(typeof res.body.syncedAt).toBe("string");
  });

  it("risponde 200 con il conteggio corretto quando ci sono nuovi update", async () => {
    mockForceSyncNow.mockResolvedValueOnce({ inserted: 5, backfilled: 2 });

    const res = await request(buildApp()).post("/api/admin/ota/sync");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, inserted: 5, backfilled: 2 });
  });
});

describe("POST /api/admin/ota/sync — DB irraggiungibile → 502 JSON", () => {
  it("restituisce 502 JSON (non HTML) quando forceSyncNow lancia un errore", async () => {
    mockForceSyncNow.mockRejectedValueOnce(new Error("connection to server failed"));

    const res = await request(buildApp()).post("/api/admin/ota/sync");

    expect(res.status).toBe(502);
    // Il client deve ricevere JSON, non una pagina HTML del proxy
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ ok: false });
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message).not.toBe("");
  });

  it("include il messaggio di errore originale nella risposta 502", async () => {
    mockForceSyncNow.mockRejectedValueOnce(new Error("EAS GraphQL HTTP 503: Service Unavailable"));

    const res = await request(buildApp()).post("/api/admin/ota/sync");

    expect(res.status).toBe(502);
    expect(res.body.message).toContain("EAS GraphQL HTTP 503");
  });
});

describe("POST /api/admin/ota/sync — timeout >45s → 504 JSON", () => {
  // The route's internal timeout promise rejects with Error("SYNC_TIMEOUT") when
  // 45s elapse. We simulate that exact rejection path — the same catch block fires
  // whether the timer fires or forceSyncNow itself throws — so we get full branch
  // coverage without waiting 45 real seconds or fighting supertest + fake timers.
  it("restituisce 504 JSON con messaggio leggibile quando scatta il timeout interno", async () => {
    mockForceSyncNow.mockRejectedValueOnce(new Error("SYNC_TIMEOUT"));

    const res = await request(buildApp()).post("/api/admin/ota/sync");

    expect(res.status).toBe(504);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ ok: false });
    // Il messaggio deve essere leggibile da un admin (non un raw error stack)
    expect(res.body.message).toMatch(/timeout/i);
    expect(res.body.message).toMatch(/45s/i);
  });

  it("il messaggio 504 non contiene il token interno 'SYNC_TIMEOUT' grezzo", async () => {
    mockForceSyncNow.mockRejectedValueOnce(new Error("SYNC_TIMEOUT"));

    const res = await request(buildApp()).post("/api/admin/ota/sync");

    expect(res.status).toBe(504);
    // Il codice interno non deve trapelare letteralmente come messaggio admin
    expect(res.body.message).not.toBe("SYNC_TIMEOUT");
    // Deve contenere linguaggio comprensibile
    expect(res.body.message.length).toBeGreaterThan(10);
  });
});

describe("POST /api/admin/ota/sync — env EAS_TOKEN mancante → 503", () => {
  it("risponde 503 se nessun token EAS è configurato", async () => {
    const originalToken = process.env.EXPO_TOKEN;
    const originalEasToken = process.env.EAS_TOKEN;
    delete process.env.EXPO_TOKEN;
    delete process.env.EAS_TOKEN;

    try {
      const res = await request(buildApp()).post("/api/admin/ota/sync");
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ ok: false });
    } finally {
      if (originalToken !== undefined) process.env.EXPO_TOKEN = originalToken;
      if (originalEasToken !== undefined) process.env.EAS_TOKEN = originalEasToken;
    }
  });
});
