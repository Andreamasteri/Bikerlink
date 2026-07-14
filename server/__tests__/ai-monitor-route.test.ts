/**
 * Task #10 (Quebracho c) — monitor unificato Bowie/Horus/Ares/Quebracho.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { probeOllamaMock } = vi.hoisted(() => ({ probeOllamaMock: vi.fn(async () => ({ configured: true, ok: true, latencyMs: 42, error: undefined })) }));
vi.mock("../routes/admin/thinkcentre-health-gh-probes", () => ({ probeOllama: probeOllamaMock }));

const { httpProbeMock } = vi.hoisted(() => ({ httpProbeMock: vi.fn(async () => ({ ok: true, latencyMs: 10, error: undefined })) }));
vi.mock("../routes/admin/thinkcentre-health-utils", () => ({ httpProbe: httpProbeMock, sanitizeError: (e: unknown) => String(e) }));

const { probeAresMock } = vi.hoisted(() => ({ probeAresMock: vi.fn(async () => ({ configured: true, online: true, latencyMs: 30, error: undefined })) }));
vi.mock("../routes/admin/thinkcentre-health-ares-probe", () => ({ probeAres: probeAresMock }));

const { isQuebrachoConfiguredMock, isQuebrachoReachableMock } = vi.hoisted(() => ({
  isQuebrachoConfiguredMock: { value: true },
  isQuebrachoReachableMock: vi.fn(async () => true),
}));
vi.mock("../lib/quebracho-client", () => ({
  get isQuebrachoConfigured() { return isQuebrachoConfiguredMock.value; },
  isQuebrachoReachable: isQuebrachoReachableMock,
}));

const { getCoordinatorJobsSnapshotMock } = vi.hoisted(() => ({ getCoordinatorJobsSnapshotMock: vi.fn(() => [{ state: "running" }, { state: "idle" }]) }));
vi.mock("../ai/coordinator/job-gate", () => ({ getCoordinatorJobsSnapshot: getCoordinatorJobsSnapshotMock }));

vi.mock("../lib/cf-access", () => ({ cfAccessHeaders: () => ({}) }));

const { withBgDbSlotMock, isBgDbLimiterDropErrorMock } = vi.hoisted(() => ({
  withBgDbSlotMock: vi.fn(async (fn: () => unknown) => fn()),
  isBgDbLimiterDropErrorMock: vi.fn(() => false),
}));
vi.mock("../lib/bg-db-limiter", () => ({ withBgDbSlot: withBgDbSlotMock, isBgDbLimiterDropError: isBgDbLimiterDropErrorMock }));
vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));

const insertValuesMock = vi.hoisted(() => vi.fn(async () => ({})));
const dbMock = vi.hoisted(() => ({
  insert: vi.fn(() => ({ values: insertValuesMock })),
  select: vi.fn(() => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })),
}));
vi.mock("../db", () => ({ db: dbMock }));
vi.mock("@shared/db", () => ({ thinkcentreHealthEvents: {} }));

import aiMonitorRouter, { __resetAiMonitorCacheForTests } from "../routes/admin/ai-monitor";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", aiMonitorRouter);
  return app;
}

beforeEach(() => {
  __resetAiMonitorCacheForTests();
  probeOllamaMock.mockReset().mockResolvedValue({ configured: true, ok: true, latencyMs: 42, error: undefined });
  httpProbeMock.mockReset().mockResolvedValue({ ok: true, latencyMs: 10, error: undefined });
  probeAresMock.mockReset().mockResolvedValue({ configured: true, online: true, latencyMs: 30, error: undefined });
  isQuebrachoConfiguredMock.value = true;
  isQuebrachoReachableMock.mockReset().mockResolvedValue(true);
  getCoordinatorJobsSnapshotMock.mockReset().mockReturnValue([{ state: "running" }, { state: "idle" }]);
  insertValuesMock.mockReset().mockResolvedValue({});
  dbMock.insert.mockReset().mockReturnValue({ values: insertValuesMock });
});

describe("GET /api/admin/ai-monitor", () => {
  it("aggrega lo stato delle 4 AI", async () => {
    const res = await request(buildApp()).get("/api/admin/ai-monitor");
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(4);
    const quebracho = res.body.agents.find((a: { persona: string }) => a.persona === "quebracho");
    expect(quebracho.activeJobs).toBe(1); // solo lo stato "running"
  });

  it("non persiste transizioni al primo probe (no rumore da boot)", async () => {
    await request(buildApp()).get("/api/admin/ai-monitor");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("persiste una transizione quando lo stato online cambia tra due probe", async () => {
    await request(buildApp()).get("/api/admin/ai-monitor"); // baseline online
    probeAresMock.mockResolvedValue({ configured: true, online: false, latencyMs: null, error: "timeout" });
    await request(buildApp()).get("/api/admin/ai-monitor"); // ares passa offline
    expect(dbMock.insert).toHaveBeenCalled();
  });
});

describe("GET /api/admin/ai-monitor/history", () => {
  it("risponde con la lista entries (vuota se nessuna transizione)", async () => {
    const res = await request(buildApp()).get("/api/admin/ai-monitor/history?persona=ares&limit=10");
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });
});
