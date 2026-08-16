/**
 * Task #908 — Verifica che GET /api/admin/server-metrics produca sempre un
 * payload con tutti i campi cpu (loadAvg1/5/15, cores, loadPerCore,
 * processCpuPercent) come numeri finiti, anche quando os.loadavg() o
 * os.cpus() restituiscono valori inattesi.
 * Il test gira senza SO reale mockando os e ../uptime.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mock os (importato dinamicamente nell'handler)
// ---------------------------------------------------------------------------
const osMocks = vi.hoisted(() => ({
  loadavg: vi.fn(() => [0.5, 0.8, 1.2] as [number, number, number]),
  cpus: vi.fn(() => [{}, {}, {}, {}] as ReturnType<typeof import("os")["cpus"]>),
  totalmem: vi.fn(() => 8 * 1024 * 1024 * 1024),
  freemem: vi.fn(() => 2 * 1024 * 1024 * 1024),
}));
vi.mock("os", () => ({
  default: osMocks,
  ...osMocks,
}));

// ---------------------------------------------------------------------------
// Mock ../uptime (importato dinamicamente nell'handler)
// ---------------------------------------------------------------------------
vi.mock("../uptime", () => ({
  SERVER_START_TIME: Date.now() - 60_000,
  uptimeState: {
    metroOnline: false,
    metroStartTime: 0,
    metroLastSeenAt: 0,
    frontendStartTime: 0,
  },
}));

// ---------------------------------------------------------------------------
// Mock dipendenze statiche di more-routes.ts
// ---------------------------------------------------------------------------
const storageMocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ id: "1", role: "admin", status: "active" })),
  cleanupOldCoordinateHistory: vi.fn(async () => 0),
}));

vi.mock("../storage", () => ({
  storage: storageMocks,
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ orderBy: () => ({ limit: async () => [] }) }) })),
  },
  withDbRetry: vi.fn(async (fn: () => unknown) => fn()),
}));

vi.mock("@shared/db", () => ({ serverRestarts: {} }));

vi.mock("../matching-engine", () => ({
  triggerMatchingRun: vi.fn(() => ({ triggered: true })),
  triggerMatchingForUser: vi.fn(),
}));

vi.mock("../lib/api-response", () => ({
  sendSuccess: (res: Response, data?: unknown) => res.json({ ok: true, ...(data as object) }),
  sendError: (res: Response, status: number, msg: string) =>
    res.status(status).json({ ok: false, error: msg }),
}));

vi.mock("../init-state", () => ({
  initState: { initializing: false },
}));

vi.mock("../db-circuit-breaker", () => ({
  getCircuitStatus: vi.fn(() => ({ state: "CLOSED" })),
}));

vi.mock("../lib/health-arbiter", () => ({
  getHealthState: vi.fn(() => ({ state: "READY", reasons: [], slices: {} })),
}));

vi.mock("../ai/coordinator/job-gate", () => ({
  getCoordinatorHealthSummary: vi.fn(() => ({})),
}));

vi.mock("../ai/coordinator/horus-coordinator-loop", () => ({
  isHorusCoordinatorLoopRunning: vi.fn(() => false),
  getHorusCoordinatorLoopStats: vi.fn(() => ({ persona: "horus" })),
}));

vi.mock("../cache/redis", () => ({
  getRedisStatus: vi.fn(() => ({
    enabled: false, running: false, restarts: 0,
    lastExitCode: null, lastExitReason: null, lastError: null,
    lastExitAt: null,
    configured: false,
    available: false,
    source: "none",
    probeOk: null,
    lastError: null,
    lastErrorAt: null,
  })),
}));

vi.mock("../lib/admin-auth-cache", () => ({
  getOrFetchAdminCached: vi.fn(async (_key: string, fn: () => unknown) => fn()),
  deleteAdminCached: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
import {
  registerMoreRoutes,
  __resetServerMetricsCacheForTests,
  __resetCoordinateHistoryCleanupForTests,
} from "../routes/more-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  // Inietta la sessione admin senza dipendere da express-session in test
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { session: { userId: string } }).session = { userId: "test-admin" };
    next();
  });
  registerMoreRoutes(app);
  return app;
}

beforeEach(() => {
  __resetServerMetricsCacheForTests();
  __resetCoordinateHistoryCleanupForTests();
  storageMocks.cleanupOldCoordinateHistory.mockReset();
  storageMocks.cleanupOldCoordinateHistory.mockResolvedValue(0);
  osMocks.loadavg.mockReturnValue([0.5, 0.8, 1.2]);
  osMocks.cpus.mockReturnValue([{}, {}, {}, {}] as ReturnType<typeof import("os")["cpus"]>);
  osMocks.totalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
  osMocks.freemem.mockReturnValue(2 * 1024 * 1024 * 1024);
});

afterEach(() => {
  __resetCoordinateHistoryCleanupForTests();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Cleanup scheduler e route univoca
// ---------------------------------------------------------------------------
describe("more-routes safety", () => {
  it("non registra una seconda route /api/admin/client-error", async () => {
    const res = await request(buildApp())
      .post("/api/admin/client-error")
      .send({ message: "test" });

    expect(res.status).toBe(404);
  });

  it("non sovrappone due cleanup se il primo è ancora pendente", async () => {
    vi.useFakeTimers();

    let resolveFirstCleanup: ((value: number) => void) | undefined;
    storageMocks.cleanupOldCoordinateHistory
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveFirstCleanup = resolve;
          }),
      )
      .mockResolvedValue(0);

    buildApp();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(storageMocks.cleanupOldCoordinateHistory).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(storageMocks.cleanupOldCoordinateHistory).toHaveBeenCalledTimes(1);

    resolveFirstCleanup?.(2);
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(storageMocks.cleanupOldCoordinateHistory).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/admin/server-metrics — forma payload CPU", () => {
  it("tutti i campi cpu sono numeri finiti con valori OS normali", async () => {
    const res = await request(buildApp()).get("/api/admin/server-metrics");
    expect(res.status).toBe(200);

    const { cpu } = res.body;
    expect(cpu).toBeDefined();
    expect(Number.isFinite(cpu.loadAvg1)).toBe(true);
    expect(Number.isFinite(cpu.loadAvg5)).toBe(true);
    expect(Number.isFinite(cpu.loadAvg15)).toBe(true);
    expect(Number.isFinite(cpu.cores)).toBe(true);
    expect(Number.isFinite(cpu.loadPerCore)).toBe(true);
    expect(Number.isFinite(cpu.processCpuPercent)).toBe(true);
  });

  it("cores è almeno 1 anche quando os.cpus() restituisce un array vuoto", async () => {
    osMocks.cpus.mockReturnValue([]);
    const res = await request(buildApp()).get("/api/admin/server-metrics");
    expect(res.status).toBe(200);

    const { cpu } = res.body;
    expect(cpu.cores).toBe(1);
    expect(Number.isFinite(cpu.loadPerCore)).toBe(true);
  });

  it("processCpuPercent è 0 e finito al primo campionamento (nessun delta precedente)", async () => {
    // __resetServerMetricsCacheForTests azzerà lastServerSample → processCpuPercent=0
    const res = await request(buildApp()).get("/api/admin/server-metrics");
    expect(res.status).toBe(200);

    const { cpu } = res.body;
    expect(cpu.processCpuPercent).toBe(0);
    expect(Number.isFinite(cpu.processCpuPercent)).toBe(true);
  });

  it("loadPerCore è un numero finito ≥ 0 anche con carico alto", async () => {
    osMocks.loadavg.mockReturnValue([12.0, 11.5, 10.0]);
    osMocks.cpus.mockReturnValue([{}, {}] as ReturnType<typeof import("os")["cpus"]>);

    const res = await request(buildApp()).get("/api/admin/server-metrics");
    expect(res.status).toBe(200);

    const { cpu } = res.body;
    expect(Number.isFinite(cpu.loadPerCore)).toBe(true);
    expect(cpu.loadPerCore).toBeGreaterThanOrEqual(0);
    // 12.0 / 2 = 6.0
    expect(cpu.loadPerCore).toBeCloseTo(6.0);
  });

  it("il payload contiene anche memory, network e uptimeSec come numeri finiti", async () => {
    const res = await request(buildApp()).get("/api/admin/server-metrics");
    expect(res.status).toBe(200);

    const { memory, network, uptimeSec, serverNow } = res.body;

    expect(Number.isFinite(memory.total)).toBe(true);
    expect(Number.isFinite(memory.free)).toBe(true);
    expect(Number.isFinite(memory.used)).toBe(true);
    expect(Number.isFinite(memory.usedPercent)).toBe(true);
    expect(Number.isFinite(network.rxBytes)).toBe(true);
    expect(Number.isFinite(network.txBytes)).toBe(true);
    expect(Number.isFinite(uptimeSec)).toBe(true);
    expect(Number.isFinite(serverNow)).toBe(true);
  });
});
