import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Task #4804 — copertura diretta della logica heartbeat + auto-recupero dello
// scheduler (Task #4798). Verifica:
//  1. recordSchedulerHeartbeat() scrive lastTickAt/lastTickResult su ogni path
//     di skip (pool_saturated / already_running / debounced) con throttle 30s.
//  2. La guardia in-process cycleInFlight viene resettata quando è bloccata da
//     >CYCLE_STALE_MS (10min) e il tick successivo riparte.

// ── Mock di tutte le dipendenze di scheduler.cycle.ts ───────────────────────
const getAppSettingMock = vi.hoisted(() => vi.fn());
const upsertAppSettingMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../storage", () => ({
  storage: { getAppSetting: getAppSettingMock, upsertAppSetting: upsertAppSettingMock },
}));

const isPoolHealthyMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("../db", () => ({
  withDbRetry: (fn: () => unknown) => fn(),
  isPoolHealthy: isPoolHealthyMock,
}));

// withBgDbSlot esegue subito la fn (nessuna coda nei test).
vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: (fn: () => unknown) => fn(),
}));

vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));
vi.mock("../lib/logger", () => ({
  schedulerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/format", () => ({ prettyMs: () => "", memoryRssPretty: () => "" }));

// withMatchingLock pilotabile: di default appende (never-resolve) così il ciclo
// resta "in volo" e possiamo testare already_running / zombie reset.
const withMatchingLockMock = vi.hoisted(() => vi.fn(() => new Promise<{ acquired: boolean }>(() => {})));
const forceUnlockMatchingLockMock = vi.hoisted(() => vi.fn());
vi.mock("../cache/matching-lock", () => ({
  withMatchingLock: withMatchingLockMock,
  forceUnlockMatchingLock: forceUnlockMatchingLockMock,
  getMatchingLockStatus: vi.fn(),
}));

vi.mock("../matching/metrics", () => ({
  recordMatchingCycle: vi.fn(),
  recordMatchesCreated: vi.fn(),
  recordCycleError: vi.fn(),
  setMatchingLockState: vi.fn(),
}));
vi.mock("../sentry", () => ({ captureMatchingError: vi.fn(async () => "eid") }));

const addMatchLogMock = vi.hoisted(() => vi.fn());
vi.mock("../matching/match-log-buffer", () => ({ addMatchLog: addMatchLogMock }));

vi.mock("../matching/scheduler.helpers", () => ({
  runCleanup: vi.fn(async () => 0),
  withCycleTimeout: vi.fn(),
  getMatchingCycleTimeoutMs: vi.fn(async () => 90_000),
  CycleTimeoutError: class extends Error {},
}));
vi.mock("../matching/perf-metrics", () => ({ PhaseRecorder: class {} }));

// run-* matcher: mai invocati nei test (withMatchingLock non chiama la fn), ma
// vanno mockati per evitare side-effect di import (connessioni DB reali).
vi.mock("../matching/run-matching", () => ({}));
vi.mock("../matching/run-biker", () => ({}));
vi.mock("../matching/run-clubs", () => ({}));
vi.mock("../matching/run-extra", () => ({}));
vi.mock("../matching/run-biker-zav-base", () => ({}));
vi.mock("../matching/run-music-affinity", () => ({}));
vi.mock("../matching/jobs/extract-route-cells", () => ({}));
vi.mock("../matching/run-route-similarity", () => ({}));
vi.mock("../matching/run-planned-route-affinity", () => ({}));
vi.mock("../matching/enrich-breakdowns", () => ({}));
vi.mock("../matching/run-distance", () => ({}));
vi.mock("../matching/run-profile", () => ({}));

let nowMs = 0;

async function loadScheduler() {
  vi.resetModules();
  return import("../matching/scheduler.cycle");
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

// L'ultima chiamata a upsertAppSetting con la chiave dello scheduler.
function lastTickWrite(): { lastTickAt?: string; lastTickResult?: string } | null {
  const calls = upsertAppSettingMock.mock.calls.filter((c) => c[0] === "matching_scheduler_state");
  if (calls.length === 0) return null;
  return calls[calls.length - 1][2] as { lastTickAt?: string; lastTickResult?: string };
}

describe("scheduler heartbeat — recordSchedulerHeartbeat()", () => {
  beforeEach(() => {
    nowMs = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getAppSettingMock.mockReset();
    getAppSettingMock.mockResolvedValue({ valueJson: { lastRunAt: "2020-01-01T00:00:00.000Z" } });
    upsertAppSettingMock.mockClear();
    addMatchLogMock.mockClear();
    isPoolHealthyMock.mockReturnValue(true);
    withMatchingLockMock.mockReset();
    withMatchingLockMock.mockReturnValue(new Promise(() => {})); // never resolves
    forceUnlockMatchingLockMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrive lastTickAt + lastTickResult per ogni tickResult e preserva i campi esistenti", async () => {
    const { recordSchedulerHeartbeat } = await loadScheduler();

    recordSchedulerHeartbeat("skip:pool_saturated");
    await flush();
    const write = lastTickWrite();
    expect(write?.lastTickResult).toBe("skip:pool_saturated");
    expect(write?.lastTickAt).toBe(new Date(nowMs).toISOString());
    // I campi pre-esistenti (lastRunAt) non vengono persi.
    expect((write as Record<string, unknown>).lastRunAt).toBe("2020-01-01T00:00:00.000Z");

    // Throttle 30s: una seconda chiamata entro 30s NON deve persistere.
    upsertAppSettingMock.mockClear();
    nowMs += 10_000;
    recordSchedulerHeartbeat("skip:already_running");
    await flush();
    expect(lastTickWrite()).toBeNull();

    // Oltre 30s dal primo persist: torna a scrivere col nuovo tickResult.
    nowMs += 21_000; // totale 31s dal primo persist
    recordSchedulerHeartbeat("skip:already_running");
    await flush();
    expect(lastTickWrite()?.lastTickResult).toBe("skip:already_running");

    // Terzo path di skip, dopo un altro intervallo > throttle.
    upsertAppSettingMock.mockClear();
    nowMs += 31_000;
    recordSchedulerHeartbeat("skip:debounced");
    await flush();
    expect(lastTickWrite()?.lastTickResult).toBe("skip:debounced");
  });
});

describe("scheduler heartbeat — triggerMatchingRun skip paths", () => {
  beforeEach(() => {
    nowMs = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getAppSettingMock.mockReset();
    getAppSettingMock.mockResolvedValue({ valueJson: {} });
    upsertAppSettingMock.mockClear();
    addMatchLogMock.mockClear();
    isPoolHealthyMock.mockReturnValue(true);
    withMatchingLockMock.mockReset();
    withMatchingLockMock.mockReturnValue(new Promise(() => {}));
    forceUnlockMatchingLockMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pool saturo: skip con heartbeat skip:pool_saturated", async () => {
    isPoolHealthyMock.mockReturnValue(false);
    const { triggerMatchingRun } = await loadScheduler();

    const res = triggerMatchingRun();
    expect(res).toEqual({ started: false, reason: "pool_saturated" });
    await flush();
    expect(lastTickWrite()?.lastTickResult).toBe("skip:pool_saturated");
  });

  it("ciclo già in corso: skip con heartbeat skip:already_running", async () => {
    const { triggerMatchingRun } = await loadScheduler();

    // 1° tick: parte (withMatchingLock appende → cycleInFlight resta true).
    expect(triggerMatchingRun()).toEqual({ started: true });
    await flush();

    // Oltre il throttle, così la seconda scrittura non viene soppressa.
    nowMs += 31_000;
    const res = triggerMatchingRun();
    expect(res).toEqual({ started: false, reason: "already_running" });
    await flush();
    expect(lastTickWrite()?.lastTickResult).toBe("skip:already_running");
  });
});

describe("scheduler — zombie cycle recovery (cycleInFlight stale reset)", () => {
  beforeEach(() => {
    nowMs = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getAppSettingMock.mockReset();
    getAppSettingMock.mockResolvedValue({ valueJson: {} });
    upsertAppSettingMock.mockClear();
    addMatchLogMock.mockClear();
    isPoolHealthyMock.mockReturnValue(true);
    withMatchingLockMock.mockReset();
    withMatchingLockMock.mockReturnValue(new Promise(() => {})); // ciclo appeso
    forceUnlockMatchingLockMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dopo >10min con cycleInFlight bloccato, il tick successivo resetta e riparte", async () => {
    const { triggerMatchingRun } = await loadScheduler();

    // Avvia un ciclo che non si risolve mai → cycleInFlight resta true.
    expect(triggerMatchingRun()).toEqual({ started: true });
    await flush();
    expect(withMatchingLockMock).toHaveBeenCalledTimes(1);

    // Entro la finestra di stallo (10min) il tick è ancora bloccato.
    nowMs += 5 * 60 * 1000;
    expect(triggerMatchingRun()).toEqual({ started: false, reason: "already_running" });

    // Oltre CYCLE_STALE_MS (10min): zombie rilevato → reset → riparte.
    nowMs += 6 * 60 * 1000; // totale 11min dall'avvio
    const res = triggerMatchingRun();
    expect(res).toEqual({ started: true });
    expect(forceUnlockMatchingLockMock).toHaveBeenCalled();
    // È stato avviato un nuovo ciclo (seconda chiamata a withMatchingLock).
    expect(withMatchingLockMock).toHaveBeenCalledTimes(2);
    // Log del reset zombie.
    expect(
      addMatchLogMock.mock.calls.some((c) => String(c[2] ?? "").includes("zombie")),
    ).toBe(true);
  });
});
