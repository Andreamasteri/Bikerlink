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
    limiterStatsMock.mockReturnValue({ active: 0, queued: 0, max: 3 });
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
});
