// Task #877 — Verifica che l'endpoint /watchdog/proposals/:id/accept esegua
// automaticamente le regole auto-fix mappate (rebuild_index, restart_worker,
// scale_concurrency) leggendo correttamente details.action.kind dal log della
// proposta (oggetto Proposal, non stringa legacy).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks richiesti dall'import del router ────────────────────────────────────

vi.mock("../ai/watchdog/kill-switch", () => ({
  isWatchdogEnabled: vi.fn().mockResolvedValue(true),
  setWatchdogEnabled: vi.fn(),
}));

const { getLatestSnapshotMock } = vi.hoisted(() => ({
  getLatestSnapshotMock: vi.fn(),
}));
vi.mock("../ai/watchdog/aggregator", () => ({
  getLatestSnapshot: getLatestSnapshotMock,
  runAggregatorCycle: vi.fn(),
  getRecentSnapshots: vi.fn(),
  isAggregatorCycleInFlight: vi.fn(() => false),
  getSnoozedUntil: vi.fn(() => null),
  setSnoozedUntil: vi.fn(),
}));

vi.mock("../ai/watchdog/proposer", () => ({
  runProposer: vi.fn(),
  getProposerSettings: vi.fn(),
  setProposerModel: vi.fn(),
}));
vi.mock("../ai/watchdog/horus-proposer", () => ({ runHorusRoutingProposer: vi.fn() }));
vi.mock("../ai/watchdog/chat", () => ({ streamWatchdogChat: vi.fn() }));
vi.mock("../ai/watchdog/scheduler", () => ({ getWatchdogStats: vi.fn(() => ({})) }));
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
vi.mock("../ai/watchdog/collectors/db-collector", () => ({ resetState: vi.fn() }));
vi.mock("../ai/watchdog/collectors/pool-collector", () => ({ resetState: vi.fn() }));
vi.mock("../ai/watchdog/collectors/overload-collector", () => ({ resetState: vi.fn() }));
vi.mock("../ai/watchdog/collectors/error-collector", () => ({ resetState: vi.fn() }));
vi.mock("../ai/watchdog/collectors/crash-signals-collector", () => ({ resetState: vi.fn() }));
vi.mock("../lib/ai-hub-client", () => ({
  isHubConfigured: vi.fn(() => false),
  isHubAvailable: vi.fn(() => false),
  hasHubBeenProbed: vi.fn(() => false),
}));
vi.mock("../storage", () => ({ storage: { getAppSetting: vi.fn(), upsertAppSetting: vi.fn() } }));
vi.mock("@shared/db", () => ({
  aiWatchdogLog: {},
  weeklySystemReports: {},
  systemSignals: {},
}));

// ── Mock dei moduli usati direttamente dal dispatcher ─────────────────────────

// Mock del DB: simula la lettura del log proposta dal DB.
const dbSelectMock = vi.fn();
vi.mock("../db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: dbSelectMock }) }) }),
    execute: vi.fn(async () => ({ rows: [] })),
    insert: vi.fn(() => ({ values: () => ({ catch: () => {} }) })),
  },
  pool: {
    connect: vi.fn(async () => ({ release: vi.fn(), query: vi.fn() })),
    idleCount: 0,
    totalCount: 0,
    waitingCount: 0,
  },
}));

const { markProposalAcceptedMock } = vi.hoisted(() => ({
  markProposalAcceptedMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../ai/watchdog/log", () => ({
  markProposalAccepted: markProposalAcceptedMock,
  markProposalRejected: vi.fn(),
  writeWatchdogLog: vi.fn().mockResolvedValue("log-id-test"),
}));

// ── Mock auto-fix rules ───────────────────────────────────────────────────────
// Sostituiamo le implementazioni reali (che richiedono DB live) con stub
// controllabili, mantenendo gli id delle regole reali.
// vi.hoisted è necessario perché vi.mock() è hoistato e deve accedere
// alle variabili prima che vengano dichiarate nel corpo del file.

const { rebuildIndexRunMock, restartWorkerRunMock, scaleConcurrencyRunMock } = vi.hoisted(() => ({
  rebuildIndexRunMock: vi.fn(),
  restartWorkerRunMock: vi.fn(),
  scaleConcurrencyRunMock: vi.fn(),
}));

vi.mock("../ai/watchdog/auto-fix", () => ({
  runAutoFix: vi.fn(),
  // AUTO_FIX_RULES: scheduler-driven only, must NOT contain the 3 new rules.
  AUTO_FIX_RULES: [],
  // PROPOSAL_DISPATCH_RULES: accept-time only, contains the 3 new rules.
  PROPOSAL_DISPATCH_RULES: {
    rebuild_index:     { id: "rebuild_index",     run: rebuildIndexRunMock },
    restart_worker:    { id: "restart_worker",    run: restartWorkerRunMock },
    scale_concurrency: { id: "scale_concurrency", run: scaleConcurrencyRunMock },
  },
  // Task #891 — motivi specifici per azioni note ma non automatizzabili.
  NON_DISPATCHABLE_REASONS: {
    rotate_secret: "rotate_secret richiede accesso manuale al vault dei secret", // pragma: allowlist secret
    manual_only: "la proposta è dichiarata esplicitamente come azione manuale",
  },
}));

import aiWatchdogRouter from "../routes/admin/ai-watchdog";

function buildApp() {
  const app = express();
  app.use(express.json());
  // Simula la sessione admin senza middleware reale.
  app.use((req, _res, next) => {
    (req as express.Request & { session: { userId: string } }).session = { userId: "admin-test-user" };
    next();
  });
  app.use("/api/admin", aiWatchdogRouter);
  return app;
}

function makeSnapshot() {
  return {
    status: "red" as const,
    score: 40,
    problems: [],
    metrics: { "latency.latency.p99_ms": 5000, "db.db.ping_ms": 4000 },
    generatedAt: new Date().toISOString(),
  };
}

/** Costruisce il record del log proposta così come lo scrive il proposer:
 *  details.action è un oggetto { kind, target, params }, NON una stringa. */
function makeProposalLog(actionKind: string, riskLevel = "medium") {
  return {
    id: "proposal-id-123",
    details: {
      title: "Test proposal",
      reasoning: "test reasoning",
      riskLevel,
      action: { kind: actionKind, target: "test-target", params: null },
      affectedComponents: [],
      rollbackHint: null,
    },
    status: "pending",
  };
}

beforeEach(() => {
  getLatestSnapshotMock.mockReturnValue(makeSnapshot());
  markProposalAcceptedMock.mockResolvedValue(undefined);
  rebuildIndexRunMock.mockReset();
  restartWorkerRunMock.mockReset();
  scaleConcurrencyRunMock.mockReset();
  dbSelectMock.mockReset();
});

describe("POST /api/admin/watchdog/proposals/:id/accept — dispatcher auto-fix (Task #877)", () => {
  it("esegue la regola rebuild_index e ritorna autoApplied=true quando il rebuild riesce", async () => {
    dbSelectMock.mockResolvedValue([makeProposalLog("rebuild_index")]);
    rebuildIndexRunMock.mockResolvedValue({
      applied: true,
      summary: "Indice HNSW ricostruito con successo (valid=true)",
      details: { action: "rebuilt", indexStatus: { exists: true, valid: true } },
    });

    const res = await request(buildApp())
      .post("/api/admin/watchdog/proposals/proposal-id-123/accept");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("accepted");
    expect(res.body.dispatch).toBeDefined();
    expect(res.body.dispatch.action).toBe("rebuild_index");
    expect(res.body.dispatch.autoApplied).toBe(true);
    expect(res.body.dispatch.message).toContain("Fix applicato automaticamente");
    expect(rebuildIndexRunMock).toHaveBeenCalledTimes(1);
  });

  it("esegue la regola restart_worker e ritorna autoApplied=true quando riesce", async () => {
    dbSelectMock.mockResolvedValue([makeProposalLog("restart_worker")]);
    restartWorkerRunMock.mockResolvedValue({
      applied: true,
      summary: "Reset collector DB/pool; connessioni idle: 2→0 (2 distrutte)",
      details: { p99BeforeMs: 5000, idleConnsBefore: 2, idleConnsAfter: 0 },
    });

    const res = await request(buildApp())
      .post("/api/admin/watchdog/proposals/proposal-id-123/accept");

    expect(res.status).toBe(200);
    expect(res.body.dispatch.action).toBe("restart_worker");
    expect(res.body.dispatch.autoApplied).toBe(true);
    expect(restartWorkerRunMock).toHaveBeenCalledTimes(1);
  });

  it("esegue la regola scale_concurrency e ritorna autoApplied=true quando riesce", async () => {
    dbSelectMock.mockResolvedValue([makeProposalLog("scale_concurrency")]);
    scaleConcurrencyRunMock.mockResolvedValue({
      applied: true,
      summary: "Concorrenza bg-db ridotta da 3 a 1 (rollback automatico tra 10 min)",
      details: { previousMax: 3, newMax: 1 },
    });

    const res = await request(buildApp())
      .post("/api/admin/watchdog/proposals/proposal-id-123/accept");

    expect(res.status).toBe(200);
    expect(res.body.dispatch.action).toBe("scale_concurrency");
    expect(res.body.dispatch.autoApplied).toBe(true);
    expect(scaleConcurrencyRunMock).toHaveBeenCalledTimes(1);
  });

  it("ritorna autoApplied=false con motivo specifico quando la regola non si applica (applied=false)", async () => {
    dbSelectMock.mockResolvedValue([makeProposalLog("rebuild_index")]);
    rebuildIndexRunMock.mockResolvedValue({
      applied: false,
      reason: "indice già valido — nessun rebuild necessario",
    });

    const res = await request(buildApp())
      .post("/api/admin/watchdog/proposals/proposal-id-123/accept");

    expect(res.status).toBe(200);
    expect(res.body.dispatch.action).toBe("rebuild_index");
    expect(res.body.dispatch.autoApplied).toBe(false);
    expect(res.body.dispatch.message).toBe(
      "Azione registrata — non eseguibile in automatico: indice già valido — nessun rebuild necessario",
    );
  });

  // Task #891 — il gate riskLevel=high è stato rimosso: l'autorizzazione è
  // nella confirmation dialog lato client. Il server esegue anche le high.
  it("esegue la regola anche per proposte riskLevel=high (gate rimosso, Task #891)", async () => {
    dbSelectMock.mockResolvedValue([makeProposalLog("rebuild_index", "high")]);
    rebuildIndexRunMock.mockResolvedValue({ applied: true, summary: "Indice ricostruito" });

    const res = await request(buildApp())
      .post("/api/admin/watchdog/proposals/proposal-id-123/accept");

    expect(res.status).toBe(200);
    expect(res.body.dispatch.autoApplied).toBe(true);
    expect(rebuildIndexRunMock).toHaveBeenCalledTimes(1);
  });

  it("ritorna motivo specifico per azioni non automatizzabili (manual_only)", async () => {
    dbSelectMock.mockResolvedValue([makeProposalLog("manual_only")]);

    const res = await request(buildApp())
      .post("/api/admin/watchdog/proposals/proposal-id-123/accept");

    expect(res.status).toBe(200);
    expect(res.body.dispatch.autoApplied).toBe(false);
    expect(res.body.dispatch.message).toContain("Azione registrata — non eseguibile in automatico");
    expect(res.body.dispatch.summary).toContain("azione manuale");
  });

  it("ritorna motivo specifico per rotate_secret (non automatizzabile)", async () => {
    dbSelectMock.mockResolvedValue([makeProposalLog("rotate_secret")]);

    const res = await request(buildApp())
      .post("/api/admin/watchdog/proposals/proposal-id-123/accept");

    expect(res.status).toBe(200);
    expect(res.body.dispatch.autoApplied).toBe(false);
    expect(res.body.dispatch.summary).toContain("vault");
  });

  it("ritorna motivo 'snapshot assente' se nessuno snapshot è disponibile", async () => {
    dbSelectMock.mockResolvedValue([makeProposalLog("rebuild_index")]);
    getLatestSnapshotMock.mockReturnValue(null);

    const res = await request(buildApp())
      .post("/api/admin/watchdog/proposals/proposal-id-123/accept");

    expect(res.status).toBe(200);
    expect(res.body.dispatch.autoApplied).toBe(false);
    expect(res.body.dispatch.summary).toContain("snapshot");
    expect(rebuildIndexRunMock).not.toHaveBeenCalled();
  });
});
