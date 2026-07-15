import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #72 — recordDbMonitorSample conta i tick consecutivi di sovraccarico e,
// dopo una finestra sostenuta (3 tick), marca lo stato come "sustained".
// collectOverload() lo legge ed emette segnali "high" DISTINTI per DB e backend.
// Un singolo blip NON deve produrre segnali.
// ---------------------------------------------------------------------------

const getBackendLoadMock = vi.hoisted(() =>
  vi.fn(() => ({
    eventLoopLagMs: 0,
    eventLoopP99Ms: 0,
    cpuPct: 0,
    rssMb: 100,
    overloaded: false,
    at: Date.now(),
  })),
);
const getPoolStatsMock = vi.hoisted(() =>
  vi.fn(() => ({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 })),
);

vi.mock("../lib/backend-load-probe", () => ({
  getBackendLoad: getBackendLoadMock,
  startBackendLoadProbe: vi.fn(),
}));

// Task #83 — le soglie sono ora regolabili (AppSetting). Nei test usiamo i default
// hardcoded (pool 90% / ping 500ms / lag 100ms / p99 500ms / CPU 85% / 3 tick) e
// un refresh no-op, così il comportamento resta identico a Task #72.
const DEFAULTS = vi.hoisted(() => ({
  poolActivePct: 90,
  pingMs: 500,
  eventLoopLagMs: 100,
  eventLoopP99Ms: 500,
  cpuPct: 85,
  consecutiveTicks: 3,
}));
vi.mock("../lib/overload-thresholds", () => ({
  getOverloadThresholds: vi.fn(() => DEFAULTS),
  refreshOverloadThresholds: vi.fn().mockResolvedValue(DEFAULTS),
}));

vi.mock("../db", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })) },
  withDbRetry: vi.fn((fn: () => unknown) => fn()),
  getPoolStats: getPoolStatsMock,
}));

vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));

import { recordDbMonitorSample, getSustainedOverloadState } from "../db-monitor-history";
import { collectOverload } from "../ai/watchdog/collectors/overload-collector";

function overloadedDbSnap() {
  // pool 95% → dbOverload true
  return { problems: [], metrics: { "db.db.ping_ms": 50 } };
}

describe("overload sustained tracking (Task #72)", () => {
  beforeEach(() => {
    getBackendLoadMock.mockReturnValue({
      eventLoopLagMs: 0, eventLoopP99Ms: 0, cpuPct: 0, rssMb: 100, overloaded: false, at: Date.now(),
    });
    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
  });

  it("un singolo tick di sovraccarico DB NON è sostenuto → nessun segnale", async () => {
    // reset counters: due tick sani
    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());

    // un solo tick con pool saturo
    getPoolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 0, max: 10, activePct: 95 });
    await recordDbMonitorSample(overloadedDbSnap());

    expect(getSustainedOverloadState().db.sustained).toBe(false);
    expect(collectOverload()).toHaveLength(0);
  });

  it("3 tick consecutivi di sovraccarico DB → segnale high db.overload_sustained", async () => {
    getPoolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 5, max: 10, activePct: 95 });
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());

    const state = getSustainedOverloadState();
    expect(state.db.sustained).toBe(true);
    expect(state.db.consecutiveTicks).toBeGreaterThanOrEqual(3);

    const signals = collectOverload();
    const dbSig = signals.find((s) => s.metric === "db.overload_sustained");
    expect(dbSig).toBeDefined();
    expect(dbSig?.severity).toBe("high");
    expect(dbSig?.source).toBe("db");
    expect((dbSig?.details as { reasons?: string[] })?.reasons).toContain("pool al 95%");
  });

  it("un tick sano azzera il contatore DB", async () => {
    getPoolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 5, max: 10, activePct: 95 });
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    expect(getSustainedOverloadState().db.sustained).toBe(true);

    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
    await recordDbMonitorSample(overloadedDbSnap());
    expect(getSustainedOverloadState().db.sustained).toBe(false);
    expect(getSustainedOverloadState().db.consecutiveTicks).toBe(0);
  });

  it("NON si auto-latcha: il problema derivato db.db.overload_sustained non è ri-contato come errore DB", async () => {
    // 3 tick con pool saturo → sustained.
    getPoolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 5, max: 10, activePct: 95 });
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    expect(getSustainedOverloadState().db.sustained).toBe(true);

    // Ora il DB torna sano MA lo snapshot dell'aggregator contiene il problema
    // derivato db.db.overload_sustained (source "db", severity "high"), come
    // succede nel flusso reale una volta che il collector lo emette. Non deve
    // essere contato come errore DB, altrimenti dbOverload resterebbe true.
    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
    const snapWithDerived = {
      problems: [{ id: "db.db.overload_sustained", source: "db", severity: "high" }],
      metrics: {},
    };
    await recordDbMonitorSample(snapWithDerived);

    // Il contatore si azzera: overload sostenuto risolto nonostante il problema derivato.
    expect(getSustainedOverloadState().db.sustained).toBe(false);
    expect(getSustainedOverloadState().db.consecutiveTicks).toBe(0);
    expect(collectOverload().find((s) => s.metric === "db.overload_sustained")).toBeUndefined();
  });

  it("un errore DB reale (non derivato) durante la ripresa mantiene l'overload", async () => {
    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
    // reset
    await recordDbMonitorSample({ problems: [], metrics: {} });
    // un problema DB reale conta ancora come errore → dbOverload true
    const realDbError = {
      problems: [{ id: "db.db.circuit_breaker", source: "db", severity: "critical" }],
      metrics: {},
    };
    await recordDbMonitorSample(realDbError);
    expect(getSustainedOverloadState().db.consecutiveTicks).toBe(1);
  });

  it("3 tick di sovraccarico backend → segnale high backend.overload_sustained, indipendente dal DB", async () => {
    // DB sano, backend overloaded
    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
    getBackendLoadMock.mockReturnValue({
      eventLoopLagMs: 150, eventLoopP99Ms: 600, cpuPct: 90, rssMb: 200, overloaded: true, at: Date.now(),
    });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    await recordDbMonitorSample({ problems: [], metrics: {} });

    const state = getSustainedOverloadState();
    expect(state.backend.sustained).toBe(true);
    expect(state.db.sustained).toBe(false);

    const signals = collectOverload();
    const backendSig = signals.find((s) => s.metric === "backend.overload_sustained");
    expect(backendSig).toBeDefined();
    expect(backendSig?.severity).toBe("high");
    expect(backendSig?.source).toBe("app");
    expect(signals.find((s) => s.metric === "db.overload_sustained")).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Task #84 — dopo un overload DB SOSTENUTO, quando il DB torna sano per una
  // finestra piena (3 tick) emettiamo un segnale info db.overload_recovered.
  // Un solo tick di salute NON basta; il rientro si spara UNA volta sola.
  // -------------------------------------------------------------------------
  it("un solo tick di salute dopo un overload DB sostenuto NON è ancora un rientro", async () => {
    // 3 tick di overload → sostenuto (arma il latch di rientro)
    getPoolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 5, max: 10, activePct: 95 });
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    expect(getSustainedOverloadState().db.sustained).toBe(true);

    // 1 solo tick sano: non ancora rientrato
    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    expect(getSustainedOverloadState().db.recovered).toBe(false);
    expect(collectOverload().find((s) => s.metric === "db.overload_recovered")).toBeUndefined();
  });

  it("3 tick sani dopo un overload DB sostenuto → segnale info db.overload_recovered una volta sola", async () => {
    // 3 tick di overload → sostenuto
    getPoolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 5, max: 10, activePct: 95 });
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    await recordDbMonitorSample(overloadedDbSnap());
    expect(getSustainedOverloadState().db.sustained).toBe(true);

    // 3 tick sani → rientro all'ultimo
    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    await recordDbMonitorSample({ problems: [], metrics: {} });

    const state = getSustainedOverloadState();
    expect(state.db.sustained).toBe(false);
    expect(state.db.recovered).toBe(true);
    expect(state.db.healthyTicks).toBeGreaterThanOrEqual(3);

    const recSig = collectOverload().find((s) => s.metric === "db.overload_recovered");
    expect(recSig).toBeDefined();
    expect(recSig?.severity).toBe("info"); // non deve creare un Problem né toccare lo score
    expect(recSig?.source).toBe("db");
    expect(typeof recSig?.value).toBe("number"); // value numerico → finisce nei metrics

    // Il rientro si spara una volta sola: un ulteriore tick sano NON ri-emette.
    await recordDbMonitorSample({ problems: [], metrics: {} });
    expect(getSustainedOverloadState().db.recovered).toBe(false);
    expect(collectOverload().find((s) => s.metric === "db.overload_recovered")).toBeUndefined();
  });

  it("un overload backend sostenuto che rientra emette backend.overload_recovered, non db", async () => {
    // backend overloaded per 3 tick, DB sano
    getPoolStatsMock.mockReturnValue({ total: 2, idle: 2, waiting: 0, max: 10, activePct: 0 });
    getBackendLoadMock.mockReturnValue({
      eventLoopLagMs: 150, eventLoopP99Ms: 600, cpuPct: 90, rssMb: 200, overloaded: true, at: Date.now(),
    });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    expect(getSustainedOverloadState().backend.sustained).toBe(true);

    // backend torna sano per 3 tick → rientro
    getBackendLoadMock.mockReturnValue({
      eventLoopLagMs: 0, eventLoopP99Ms: 0, cpuPct: 0, rssMb: 100, overloaded: false, at: Date.now(),
    });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    await recordDbMonitorSample({ problems: [], metrics: {} });
    await recordDbMonitorSample({ problems: [], metrics: {} });

    expect(getSustainedOverloadState().backend.recovered).toBe(true);
    const signals = collectOverload();
    expect(signals.find((s) => s.metric === "backend.overload_recovered")).toBeDefined();
    expect(signals.find((s) => s.metric === "db.overload_recovered")).toBeUndefined();
  });
});
