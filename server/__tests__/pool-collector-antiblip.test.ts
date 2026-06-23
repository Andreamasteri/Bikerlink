import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Signal } from "../ai/watchdog/types";

// getPoolStats / getBgDbLimiterStats pilotabili per simulare pressione su pool e
// limiter senza un DB reale.
const poolStatsMock = vi.hoisted(() => vi.fn());
const limiterStatsMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({
  getPoolStats: poolStatsMock,
}));

vi.mock("../lib/bg-db-limiter", () => ({
  getBgDbLimiterStats: limiterStatsMock,
}));

const waiting = (s: Signal[]) => s.find((x) => x.metric === "db.pool.waiting");
const queued = (s: Signal[]) => s.find((x) => x.metric === "db.bg_limiter.queued");
const dropped = (s: Signal[]) => s.find((x) => x.metric === "db.bg_limiter.dropped");
const droppedOverflow = (s: Signal[]) => s.find((x) => x.metric === "db.bg_limiter.dropped_overflow");
const droppedTimeout = (s: Signal[]) => s.find((x) => x.metric === "db.bg_limiter.dropped_timeout");

async function loadCollector() {
  const mod = await import("../ai/watchdog/collectors/pool-collector");
  return mod.collectPool;
}

describe("pool-collector anti-blip gating", () => {
  beforeEach(() => {
    vi.resetModules(); // azzera lo stato modulo (consecutiveWaiting / consecutiveLimiterQueued)
    poolStatsMock.mockReset();
    limiterStatsMock.mockReset();
    // default sani: nessuna pressione
    poolStatsMock.mockReturnValue({ total: 1, idle: 1, waiting: 0, max: 10, activePct: 0 });
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 0, droppedTimeoutTotal: 0,
    });
  });

  it("un singolo tick con waiting>0 resta 'info', poi 'warn', escala a 'high' al 3°", async () => {
    poolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 2, max: 10, activePct: 100 });
    const collectPool = await loadCollector();

    expect(waiting(collectPool())?.severity).toBe("info"); // 1 → primo tick
    expect(waiting(collectPool())?.severity).toBe("warn"); // 2 → early pressure
    expect(waiting(collectPool())?.severity).toBe("high"); // 3 → persistente
  });

  it("waiting>=max è 'critical' immediatamente (pool esaurito)", async () => {
    poolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 10, max: 10, activePct: 100 });
    const collectPool = await loadCollector();

    expect(waiting(collectPool())?.severity).toBe("critical");
  });

  it("waiting=0 resetta il contatore dei tick consecutivi", async () => {
    const collectPool = await loadCollector();

    poolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 1, max: 10, activePct: 100 });
    collectPool(); // 1
    collectPool(); // 2

    poolStatsMock.mockReturnValue({ total: 5, idle: 5, waiting: 0, max: 10, activePct: 0 });
    expect(waiting(collectPool())?.severity).toBe("info"); // reset

    poolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 1, max: 10, activePct: 100 });
    expect(waiting(collectPool())?.severity).toBe("info"); // riparte da 1 (NON warn)
  });

  it("coda limiter non vuota: 'info' → 'warn' → 'high' al 3° campione consecutivo", async () => {
    limiterStatsMock.mockReturnValue({ active: 3, queued: 2, max: 3 });
    const collectPool = await loadCollector();

    expect(queued(collectPool())?.severity).toBe("info"); // 1
    expect(queued(collectPool())?.severity).toBe("warn"); // 2
    expect(queued(collectPool())?.severity).toBe("high"); // 3 → congestione persistente
  });

  it("coda limiter vuota resetta il contatore consecutivo", async () => {
    const collectPool = await loadCollector();

    limiterStatsMock.mockReturnValue({ active: 3, queued: 1, max: 3 });
    collectPool(); // 1
    collectPool(); // 2

    limiterStatsMock.mockReturnValue({ active: 0, queued: 0, max: 3 });
    expect(queued(collectPool())?.severity).toBe("info"); // reset

    limiterStatsMock.mockReturnValue({ active: 3, queued: 1, max: 3 });
    expect(queued(collectPool())?.severity).toBe("info"); // riparte da 1
  });

  it("emette sempre i totali cumulativi degli scarti come metriche info", async () => {
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 7, droppedTimeoutTotal: 3,
    });
    const collectPool = await loadCollector();

    const s = collectPool();
    expect(droppedOverflow(s)?.value).toBe(7);
    expect(droppedOverflow(s)?.severity).toBe("info");
    expect(droppedTimeout(s)?.value).toBe(3);
    expect(droppedTimeout(s)?.severity).toBe("info");
  });

  it("nessuno scarto nuovo → dropped resta 'info' con delta 0", async () => {
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 5, droppedTimeoutTotal: 0,
    });
    const collectPool = await loadCollector();

    // Primo tick: prev parte da 0, quindi delta = 5 (scarti accumulati pre-tick).
    expect(dropped(collectPool())?.value).toBe(5);
    // Secondo tick senza nuovi scarti: delta 0 → info.
    const s = collectPool();
    expect(dropped(s)?.value).toBe(0);
    expect(dropped(s)?.severity).toBe("info");
  });

  it("un burst di scarti in un singolo tick (>=soglia) escala subito a 'warn'", async () => {
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 0, droppedTimeoutTotal: 0,
    });
    const collectPool = await loadCollector();
    collectPool(); // baseline: prev=0

    // 12 scarti in una sola finestra (>= DROP_BURST_FOR_WARN = 10) → warn immediato.
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 8, droppedTimeoutTotal: 4,
    });
    const s = collectPool();
    expect(dropped(s)?.value).toBe(12);
    expect(dropped(s)?.severity).toBe("warn");
  });

  it("scarti piccoli ma persistenti: info → warn (2 tick) → high (3 tick)", async () => {
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 0, droppedTimeoutTotal: 0,
    });
    const collectPool = await loadCollector();
    collectPool(); // baseline: prev=0, delta=0

    // +1 scarto per tick, sotto la soglia di burst.
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 1, droppedTimeoutTotal: 0,
    });
    expect(dropped(collectPool())?.severity).toBe("info"); // 1° tick con scarto

    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 2, droppedTimeoutTotal: 0,
    });
    expect(dropped(collectPool())?.severity).toBe("warn"); // 2° tick consecutivo

    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 3, droppedTimeoutTotal: 0,
    });
    expect(dropped(collectPool())?.severity).toBe("high"); // 3° tick consecutivo
  });

  it("un tick senza nuovi scarti resetta il contatore di persistenza", async () => {
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 0, droppedTimeoutTotal: 0,
    });
    const collectPool = await loadCollector();
    collectPool(); // baseline

    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 1, droppedTimeoutTotal: 0,
    });
    collectPool(); // 1° scarto
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 2, droppedTimeoutTotal: 0,
    });
    expect(dropped(collectPool())?.severity).toBe("warn"); // 2 consecutivi

    // Nessun nuovo scarto: reset.
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 2, droppedTimeoutTotal: 0,
    });
    expect(dropped(collectPool())?.severity).toBe("info");

    // Riparte da 1: un solo scarto non basta più a tornare warn.
    limiterStatsMock.mockReturnValue({
      active: 0, queued: 0, max: 3, droppedOverflowTotal: 3, droppedTimeoutTotal: 0,
    });
    expect(dropped(collectPool())?.severity).toBe("info");
  });
});
