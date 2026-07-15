import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Task #36 — /watchdog/propose-now (Task #25) deve unire le proposte del
// proposer GENERICO e del proposer di ROUTING dedicato a Horus, ritornando
// entrambe nell'array `proposals` con un `meta` popolato. Senza questo test,
// un refactor futuro potrebbe far sparire silenziosamente le proposte di
// routing dal pulsante admin "Proponi fix ora".
// ---------------------------------------------------------------------------

const { isWatchdogEnabledMock } = vi.hoisted(() => ({
  isWatchdogEnabledMock: vi.fn().mockResolvedValue(true),
}));
vi.mock("../ai/watchdog/kill-switch", () => ({
  isWatchdogEnabled: isWatchdogEnabledMock,
  setWatchdogEnabled: vi.fn(),
}));

const { getLatestSnapshotMock } = vi.hoisted(() => ({
  getLatestSnapshotMock: vi.fn(),
}));
vi.mock("../ai/watchdog/aggregator", () => ({
  getLatestSnapshot: getLatestSnapshotMock,
  runAggregatorCycle: vi.fn(),
  getRecentSnapshots: vi.fn(),
}));

const { runProposerMock } = vi.hoisted(() => ({ runProposerMock: vi.fn() }));
vi.mock("../ai/watchdog/proposer", () => ({
  runProposer: runProposerMock,
  getProposerSettings: vi.fn(),
  setProposerModel: vi.fn(),
}));

const { runHorusRoutingProposerMock } = vi.hoisted(() => ({ runHorusRoutingProposerMock: vi.fn() }));
vi.mock("../ai/watchdog/horus-proposer", () => ({
  runHorusRoutingProposer: runHorusRoutingProposerMock,
}));

// Router mounts a broad surface of watchdog features; stub the pieces not
// relevant to /watchdog/propose-now so importing the router has no side effects.
vi.mock("../ai/watchdog/chat", () => ({ streamWatchdogChat: vi.fn() }));
vi.mock("../ai/watchdog/scheduler", () => ({ getWatchdogStats: vi.fn(() => ({})) }));
vi.mock("../ai/watchdog/auto-fix", () => ({ runAutoFix: vi.fn(), AUTO_FIX_RULES: [] }));
vi.mock("../ai/watchdog/log", () => ({
  markProposalAccepted: vi.fn(),
  markProposalRejected: vi.fn(),
}));
vi.mock("../ai/watchdog/weekly-report", () => ({ runWeeklyReport: vi.fn() }));
vi.mock("../ai/watchdog/maps-kill-switch", () => ({
  getAllMapsFlags: vi.fn(),
  setMapsFlag: vi.fn(),
}));
vi.mock("../ai/watchdog/maps-telemetry-store", () => ({
  getMapsTelemetryBuckets: vi.fn(),
  aggregateMapsTelemetry: vi.fn(),
  getMapsSummaryTelemetry: vi.fn(),
  getDistinctAppVersions: vi.fn(),
}));
vi.mock("../ai/watchdog/maps-health-checks", () => ({
  getLastHealthCheckResults: vi.fn(),
  runMapsHealthChecks: vi.fn(),
}));
vi.mock("../routing/routing-metrics", () => ({ getRoutingCounters: vi.fn() }));
vi.mock("../ai/audit", () => ({ getAiTokenAuditStatus: vi.fn(), clearAuditError: vi.fn() }));
vi.mock("../ai/groq-quota", () => ({
  getGroqTpdStatus: vi.fn(),
  resetGroqTpd: vi.fn(),
  setGroqTpdSoftCap: vi.fn(),
}));
vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })),
    execute: vi.fn(async () => ({ rows: [] })),
  },
}));
vi.mock("../storage", () => ({ storage: { getAppSetting: vi.fn(), upsertAppSetting: vi.fn() } }));
vi.mock("@shared/db", () => ({ aiWatchdogLog: {}, weeklySystemReports: {} }));

import aiWatchdogRouter from "../routes/admin/ai-watchdog";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", aiWatchdogRouter);
  return app;
}

function snapshot() {
  return {
    status: "red" as const,
    score: 40,
    problems: [],
    metrics: {},
    generatedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  isWatchdogEnabledMock.mockReset().mockResolvedValue(true);
  getLatestSnapshotMock.mockReset().mockReturnValue(snapshot());
  runProposerMock.mockReset();
  runHorusRoutingProposerMock.mockReset();
});

describe("POST /api/admin/watchdog/propose-now (Task #36)", () => {
  it("unisce proposte generiche e di routing (Horus) in un solo array, con meta popolato", async () => {
    runProposerMock.mockResolvedValue({
      proposals: [{ title: "Riavvia worker matching", logId: "log-generic-1" }],
      meta: { provider: "groq", model: "llama-3.3-70b-versatile", costUsd: 0.001 },
    });
    runHorusRoutingProposerMock.mockResolvedValue({
      proposals: [{ title: "Rebuild tile Valhalla", logId: "log-horus-1", persona: "horus" }],
      meta: { provider: "ollama", model: "qwen3:4b", costUsd: 0 },
    });

    const res = await request(buildApp()).post("/api/admin/watchdog/propose-now");

    expect(res.status).toBe(200);
    expect(res.body.proposals).toHaveLength(2);
    expect(res.body.proposals.map((p: { title: string }) => p.title)).toEqual(
      expect.arrayContaining(["Riavvia worker matching", "Rebuild tile Valhalla"]),
    );
    // La proposta Horus resta identificabile come tale (namespace routing).
    const horusProposal = res.body.proposals.find((p: { persona?: string }) => p.persona === "horus");
    expect(horusProposal).toBeDefined();
    expect(res.body.meta).toEqual({ provider: "groq", model: "llama-3.3-70b-versatile", costUsd: 0.001 });

    expect(runProposerMock).toHaveBeenCalledTimes(1);
    expect(runHorusRoutingProposerMock).toHaveBeenCalledTimes(1);
  });

  it("ritorna un array vuoto senza crash quando nessun proposer produce output", async () => {
    runProposerMock.mockResolvedValue(null);
    runHorusRoutingProposerMock.mockResolvedValue(null);

    const res = await request(buildApp()).post("/api/admin/watchdog/propose-now");

    expect(res.status).toBe(200);
    expect(res.body.proposals).toEqual([]);
    expect(res.body.meta).toBeNull();
  });

  it("include solo le proposte di routing quando il proposer generico non produce output", async () => {
    runProposerMock.mockResolvedValue(null);
    runHorusRoutingProposerMock.mockResolvedValue({
      proposals: [{ title: "Rebuild tile Valhalla", logId: "log-horus-1", persona: "horus" }],
      meta: { provider: "ollama", model: "qwen3:4b", costUsd: 0 },
    });

    const res = await request(buildApp()).post("/api/admin/watchdog/propose-now");

    expect(res.status).toBe(200);
    expect(res.body.proposals).toHaveLength(1);
    expect(res.body.proposals[0].persona).toBe("horus");
    // meta ricade su horusOut?.meta quando out (generico) è null.
    expect(res.body.meta).toEqual({ provider: "ollama", model: "qwen3:4b", costUsd: 0 });
  });

  it("torna 409 se il watchdog è disabilitato, senza invocare i proposer", async () => {
    isWatchdogEnabledMock.mockResolvedValue(false);

    const res = await request(buildApp()).post("/api/admin/watchdog/propose-now");

    expect(res.status).toBe(409);
    expect(runProposerMock).not.toHaveBeenCalled();
    expect(runHorusRoutingProposerMock).not.toHaveBeenCalled();
  });

  it("torna 503 se non c'è ancora uno snapshot, senza invocare i proposer", async () => {
    getLatestSnapshotMock.mockReturnValue(null);

    const res = await request(buildApp()).post("/api/admin/watchdog/propose-now");

    expect(res.status).toBe(503);
    expect(runProposerMock).not.toHaveBeenCalled();
    expect(runHorusRoutingProposerMock).not.toHaveBeenCalled();
  });
});
