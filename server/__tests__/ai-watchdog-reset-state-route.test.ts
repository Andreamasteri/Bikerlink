import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Task #154 — POST /watchdog/reset-state deve azzerare i contatori interni di
// OGNI collector con stato in-process e poi rigenerare uno snapshot pulito.
// La guardia anti-race attende un ciclo aggregator in corso prima di resettare.
// Senza questo test un refactor futuro potrebbe far sparire silenziosamente uno
// dei reset o la rigenerazione dello snapshot.
// ---------------------------------------------------------------------------

const {
  isAggregatorCycleInFlightMock,
  runAggregatorCycleMock,
  getSnoozedUntilMock,
  setSnoozedUntilMock,
} = vi.hoisted(() => ({
  isAggregatorCycleInFlightMock: vi.fn(() => false),
  runAggregatorCycleMock: vi.fn(async () => ({})),
  getSnoozedUntilMock: vi.fn(() => new Date(Date.now() + 10 * 60 * 1000)),
  setSnoozedUntilMock: vi.fn(),
}));
vi.mock("../ai/watchdog/aggregator", () => ({
  getLatestSnapshot: vi.fn(),
  runAggregatorCycle: runAggregatorCycleMock,
  getRecentSnapshots: vi.fn(),
  isAggregatorCycleInFlight: isAggregatorCycleInFlightMock,
  getSnoozedUntil: getSnoozedUntilMock,
  setSnoozedUntil: setSnoozedUntilMock,
}));

const {
  resetDbMock, resetPoolMock, resetOverloadMock, resetErrorMock, resetCrashMock,
} = vi.hoisted(() => ({
  resetDbMock: vi.fn(),
  resetPoolMock: vi.fn(),
  resetOverloadMock: vi.fn(),
  resetErrorMock: vi.fn(),
  resetCrashMock: vi.fn(),
}));
vi.mock("../ai/watchdog/collectors/db-collector", () => ({ resetState: resetDbMock }));
vi.mock("../ai/watchdog/collectors/pool-collector", () => ({ resetState: resetPoolMock }));
vi.mock("../ai/watchdog/collectors/overload-collector", () => ({ resetState: resetOverloadMock }));
vi.mock("../ai/watchdog/collectors/error-collector", () => ({ resetState: resetErrorMock }));
vi.mock("../ai/watchdog/collectors/crash-signals-collector", () => ({ resetState: resetCrashMock }));

// Router mounts a broad surface of watchdog features; stub the pieces not
// relevant to /watchdog/reset-state so importing the router has no side effects.
vi.mock("../ai/watchdog/kill-switch", () => ({ isWatchdogEnabled: vi.fn().mockResolvedValue(true), setWatchdogEnabled: vi.fn() }));
vi.mock("../ai/watchdog/chat", () => ({ streamWatchdogChat: vi.fn() }));
vi.mock("../ai/watchdog/scheduler", () => ({ getWatchdogStats: vi.fn(() => ({})) }));
vi.mock("../ai/watchdog/auto-fix", () => ({ runAutoFix: vi.fn(), AUTO_FIX_RULES: [] }));
vi.mock("../ai/watchdog/proposer", () => ({ runProposer: vi.fn(), getProposerSettings: vi.fn(), setProposerModel: vi.fn() }));
vi.mock("../ai/watchdog/horus-proposer", () => ({ runHorusRoutingProposer: vi.fn() }));
vi.mock("../ai/watchdog/log", () => ({ markProposalAccepted: vi.fn(), markProposalRejected: vi.fn() }));
vi.mock("../ai/watchdog/weekly-report", () => ({ runWeeklyReport: vi.fn() }));
vi.mock("../ai/watchdog/maps-kill-switch", () => ({ getAllMapsFlags: vi.fn(), setMapsFlag: vi.fn() }));
vi.mock("../ai/watchdog/maps-telemetry-store", () => ({
  getMapsTelemetryBuckets: vi.fn(), aggregateMapsTelemetry: vi.fn(),
  getMapsSummaryTelemetry: vi.fn(), getDistinctAppVersions: vi.fn(),
}));
vi.mock("../ai/watchdog/maps-health-checks", () => ({ getLastHealthCheckResults: vi.fn(), runMapsHealthChecks: vi.fn() }));
vi.mock("../routing/routing-metrics", () => ({ getRoutingCounters: vi.fn() }));
vi.mock("../ai/audit", () => ({ getAiTokenAuditStatus: vi.fn(), clearAuditError: vi.fn() }));
vi.mock("../ai/groq-quota", () => ({ getGroqTpdStatus: vi.fn(), resetGroqTpd: vi.fn(), setGroqTpdSoftCap: vi.fn() }));
vi.mock("../lib/ai-hub-client", () => ({ isHubConfigured: vi.fn(), isHubAvailable: vi.fn(), hasHubBeenProbed: vi.fn() }));
vi.mock("../db", () => ({
  db: { select: vi.fn(() => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })), execute: vi.fn(async () => ({ rows: [] })) },
}));
vi.mock("../storage", () => ({ storage: { getAppSetting: vi.fn(), upsertAppSetting: vi.fn() } }));
vi.mock("@shared/db", () => ({ aiWatchdogLog: {}, weeklySystemReports: {}, systemSignals: {} }));

import aiWatchdogRouter from "../routes/admin/ai-watchdog";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", aiWatchdogRouter);
  return app;
}

beforeEach(() => {
  isAggregatorCycleInFlightMock.mockReset().mockReturnValue(false);
  runAggregatorCycleMock.mockReset().mockResolvedValue({});
  getSnoozedUntilMock.mockReset().mockReturnValue(new Date(Date.now() + 10 * 60 * 1000));
  setSnoozedUntilMock.mockReset();
  resetDbMock.mockReset();
  resetPoolMock.mockReset();
  resetOverloadMock.mockReset();
  resetErrorMock.mockReset();
  resetCrashMock.mockReset();
});

describe("POST /api/admin/watchdog/reset-state (Task #154)", () => {
  it("azzera tutti i collector, rigenera lo snapshot e ritorna cycleWasRunning=false", async () => {
    const res = await request(buildApp()).post("/api/admin/watchdog/reset-state");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cycleWasRunning).toBe(false);
    expect(typeof res.body.resetAt).toBe("string");

    // Ogni collector con stato in-process viene resettato esattamente una volta.
    expect(resetDbMock).toHaveBeenCalledTimes(1);
    expect(resetPoolMock).toHaveBeenCalledTimes(1);
    expect(resetOverloadMock).toHaveBeenCalledTimes(1);
    expect(resetErrorMock).toHaveBeenCalledTimes(1);
    expect(resetCrashMock).toHaveBeenCalledTimes(1);

    // Snapshot pulito rigenerato dopo il reset.
    expect(runAggregatorCycleMock).toHaveBeenCalledTimes(1);
  });

  it("segnala cycleWasRunning=true quando un ciclo era in corso al momento del reset", async () => {
    // Ciclo in corso alla prima lettura, poi rientra: la guardia esce dal poll.
    isAggregatorCycleInFlightMock.mockReturnValueOnce(true).mockReturnValue(false);

    const res = await request(buildApp()).post("/api/admin/watchdog/reset-state");

    expect(res.status).toBe(200);
    expect(res.body.cycleWasRunning).toBe(true);
    expect(resetDbMock).toHaveBeenCalledTimes(1);
    expect(runAggregatorCycleMock).toHaveBeenCalledTimes(1);
  });

  it("resta 200 anche se la rigenerazione snapshot fallisce (non-fatale)", async () => {
    runAggregatorCycleMock.mockRejectedValue(new Error("boom"));

    const res = await request(buildApp()).post("/api/admin/watchdog/reset-state");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // I reset vengono comunque applicati prima della rigenerazione.
    expect(resetDbMock).toHaveBeenCalledTimes(1);
    expect(resetErrorMock).toHaveBeenCalledTimes(1);
  });
});
