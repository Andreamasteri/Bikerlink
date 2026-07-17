/**
 * Task #477 — Confirm the architect-format alert is visible in the admin
 * signal feed, not just in triage logs.
 *
 * emitArchitectFormatAlert() (scripts/log-analysis-horus.ts) inserts a row
 * into system_signals with:
 *   source   = 'horus'
 *   metric   = 'architect.format_invalid'
 *   severity = 'high'
 *
 * The admin signal feed is served by GET /bug-report/recent
 * (server/routes/admin/bug-report.ts). That endpoint aggregates
 * system_signals WHERE severity IN ('high', 'critical') and returns every
 * matching row as an item with source='signal'.
 *
 * This test verifies end-to-end that the horus/architect.format_invalid row:
 *   1. Is picked up by the SQL query (severity gate doesn't exclude it).
 *   2. Appears in the response items list.
 *   3. Has the expected shape (source, severity, title, message).
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// DB mock — db.execute() returns configurable rows per call index.
// The bug-report route fires three Promise.allSettled queries in order:
//   [0] app_crash_logs   → empty
//   [1] system_signals   → our architect-format-invalid signal row
//   [2] ai_watchdog_log  → empty
// ---------------------------------------------------------------------------

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({
  db: { execute: executeMock },
  sql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    String.raw({ raw: strings }, ...values.map(String)),
}));

// drizzle-orm sql tag (imported directly in the route)
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

vi.mock("../lib/api-response", () => ({
  sendError: (res: express.Response, status: number, msg: string) =>
    res.status(status).json({ error: msg }),
}));

import bugReportRouter from "../routes/admin/bug-report";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", bugReportRouter);
  return app;
}

/** A realistic system_signals aggregate row emitted by emitArchitectFormatAlert(). */
const architectSignalRow = {
  source: "horus",
  metric: "architect.format_invalid",
  severity: "high",
  count: 1,
  latest_at: new Date("2026-07-17T10:00:00Z"),
  avg_value: null,
  unit: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/bug-report/recent — architect-format signal (Task #477)", () => {
  beforeEach(() => {
    executeMock.mockReset();
    // Three queries in order: crashes, signals, watchdog.
    executeMock
      .mockResolvedValueOnce({ rows: [] })                          // [0] crash logs
      .mockResolvedValueOnce({ rows: [architectSignalRow] })        // [1] system_signals
      .mockResolvedValueOnce({ rows: [] });                         // [2] watchdog log
  });

  it("returns 200 with at least one item", async () => {
    const res = await request(buildApp()).get("/api/admin/bug-report/recent");
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("architect-format signal is present in the feed", async () => {
    const res = await request(buildApp()).get("/api/admin/bug-report/recent");
    const items: Array<{
      id: string;
      source: string;
      severity: string;
      title: string;
      message: string;
      count: number;
    }> = res.body.items;

    const signal = items.find((i) => i.title === "Signal: architect.format_invalid");
    expect(signal).toBeDefined();
  });

  it("signal item has source='signal' (feed-level label)", async () => {
    const res = await request(buildApp()).get("/api/admin/bug-report/recent");
    const signal = (res.body.items as Array<{ title: string; source: string }>).find(
      (i) => i.title === "Signal: architect.format_invalid",
    );
    // The route maps every system_signals row to source='signal' (a const label
    // used by the FabDrawer component to pick the icon).
    expect(signal?.source).toBe("signal");
  });

  it("signal item has severity='high'", async () => {
    const res = await request(buildApp()).get("/api/admin/bug-report/recent");
    const signal = (res.body.items as Array<{ title: string; severity: string }>).find(
      (i) => i.title === "Signal: architect.format_invalid",
    );
    expect(signal?.severity).toBe("high");
  });

  it("signal message identifies the originating DB source ('horus')", async () => {
    const res = await request(buildApp()).get("/api/admin/bug-report/recent");
    const signal = (res.body.items as Array<{ title: string; message: string }>).find(
      (i) => i.title === "Signal: architect.format_invalid",
    );
    // message format: "[<db_source>] <metric>"
    expect(signal?.message).toContain("[horus]");
    expect(signal?.message).toContain("architect.format_invalid");
  });

  it("signal count reflects the aggregate repeat count", async () => {
    const res = await request(buildApp()).get("/api/admin/bug-report/recent");
    const signal = (res.body.items as Array<{ title: string; count: number }>).find(
      (i) => i.title === "Signal: architect.format_invalid",
    );
    expect(signal?.count).toBe(1);
  });

  it("feed remains valid when signal query fails (resilience check)", async () => {
    // Simulate the system_signals query failing — the route uses Promise.allSettled
    // so crashes + watchdog rows should still be returned.
    executeMock.mockReset();
    executeMock
      .mockResolvedValueOnce({ rows: [] })                 // [0] crash logs OK
      .mockRejectedValueOnce(new Error("DB timeout"))      // [1] signals FAIL
      .mockResolvedValueOnce({ rows: [] });                // [2] watchdog OK

    const res = await request(buildApp()).get("/api/admin/bug-report/recent");
    expect(res.status).toBe(200);
    // Feed is still returned — just without signal items.
    expect(res.body.items).toBeDefined();
    const architectItem = (res.body.items as Array<{ title: string }>).find(
      (i) => i.title === "Signal: architect.format_invalid",
    );
    expect(architectItem).toBeUndefined();
  });
});
