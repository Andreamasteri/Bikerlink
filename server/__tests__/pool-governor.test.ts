import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Test del pool-governor: verifica le classi di errore e i metadati delle stats.
// La concorrenza vera è coperta da bg-db-limiter-backlog.test.ts che esercita
// l'interfaccia pubblica (via bg-db-limiter.ts, thin re-export del governor).
// Usiamo vi.resetModules() + import() in ogni test per azzerare lo stato interno.

async function loadGovernor() {
  return import("../lib/pool-governor");
}

describe("pool-governor — classi di errore", () => {
  beforeEach(() => { vi.resetModules(); });

  it("BgDbQueueOverflowError ha name e messaggio corretti", async () => {
    const { BgDbQueueOverflowError } = await loadGovernor();
    const err = new BgDbQueueOverflowError(5, 5);
    expect(err.name).toBe("BgDbQueueOverflowError");
    expect(err.message).toContain("overflow");
    expect(err).toBeInstanceOf(Error);
  });

  it("BgDbQueueTimeoutError ha name corretto", async () => {
    const { BgDbQueueTimeoutError } = await loadGovernor();
    const err = new BgDbQueueTimeoutError(2000, 2000);
    expect(err.name).toBe("BgDbQueueTimeoutError");
    expect(err).toBeInstanceOf(Error);
  });

  it("BgDbSlowKillSwitchError ha name corretto", async () => {
    const { BgDbSlowKillSwitchError } = await loadGovernor();
    const err = new BgDbSlowKillSwitchError(4, 3);
    expect(err.name).toBe("BgDbSlowKillSwitchError");
  });

  it("isBgDbLimiterDropError è true per tutti e 3 i tipi di drop", async () => {
    const {
      isBgDbLimiterDropError,
      BgDbQueueOverflowError,
      BgDbQueueTimeoutError,
      BgDbSlowKillSwitchError,
    } = await loadGovernor();
    expect(isBgDbLimiterDropError(new BgDbQueueOverflowError(5, 5))).toBe(true);
    expect(isBgDbLimiterDropError(new BgDbQueueTimeoutError(2000, 2000))).toBe(true);
    expect(isBgDbLimiterDropError(new BgDbSlowKillSwitchError(4, 3))).toBe(true);
  });

  it("isBgDbLimiterDropError è false per errori normali e valori primitivi", async () => {
    const { isBgDbLimiterDropError } = await loadGovernor();
    expect(isBgDbLimiterDropError(new Error("generic"))).toBe(false);
    expect(isBgDbLimiterDropError(null)).toBe(false);
    expect(isBgDbLimiterDropError("stringa")).toBe(false);
    expect(isBgDbLimiterDropError(undefined)).toBe(false);
  });
});

describe("pool-governor — getBgDbLimiterStats iniziali", () => {
  beforeEach(() => { vi.resetModules(); });

  it("active, queued e drop totals partono da zero", async () => {
    const { getBgDbLimiterStats } = await loadGovernor();
    const stats = getBgDbLimiterStats();
    expect(stats.active).toBe(0);
    expect(stats.queued).toBe(0);
    expect(stats.droppedOverflowTotal).toBe(0);
    expect(stats.droppedTimeoutTotal).toBe(0);
    expect(typeof stats.max).toBe("number");
    expect(stats.max).toBeGreaterThan(0);
  });
});

describe("pool-governor — overflow con pool mockato", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); });
  afterEach(() => { vi.useRealTimers(); });

  it("BgDbQueueOverflowError scatta quando la coda supera il tetto", async () => {
    // Usa le env vars per sovrascrivere la concorrenza/coda senza mockare pool-config.
    process.env.BG_DB_MAX_QUEUE = "2";
    process.env.BG_DB_QUEUE_TIMEOUT_MS = "5000";
    vi.resetModules();
    const { withBgDbSlot, BgDbQueueOverflowError, getBgDbLimiterStats } = await loadGovernor();

    // Blocca 3 slot (max concurrency) con job che non si risolvono.
    let releaseHeld!: () => void;
    const heldGate = new Promise<void>((r) => { releaseHeld = r; });
    const held = Array.from({ length: 3 }, () => withBgDbSlot(() => heldGate));
    await Promise.resolve();

    // Riempi la coda al tetto (2 job).
    const queued = Array.from({ length: 2 }, () =>
      withBgDbSlot(() => Promise.resolve("ok")).catch((e) => e),
    );
    await Promise.resolve();
    expect(getBgDbLimiterStats().queued).toBe(2);

    // Il 3° job in coda supera il tetto → overflow immediato.
    const overflow = await withBgDbSlot(() => Promise.resolve("ok")).catch((e) => e);
    expect(overflow).toBeInstanceOf(BgDbQueueOverflowError);

    releaseHeld();
    await Promise.allSettled([...held, ...queued]);
    delete process.env.BG_DB_MAX_QUEUE;
    delete process.env.BG_DB_QUEUE_TIMEOUT_MS;
  });
});
