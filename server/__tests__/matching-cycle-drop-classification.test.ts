import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Task #5316 — verifica che i drop "attesi" del bg-db-limiter (kill-switch,
// coda piena, coda scaduta) siano classificati e contati separatamente dagli
// errori applicativi reali del ciclo matching, così il watchdog non genera
// falsi allarmi high/critical durante episodi di instabilità del DB managed.

describe("bg-db-limiter drop classification", () => {
  it("isBgDbLimiterDropError riconosce le tre classi di drop del limiter", async () => {
    const {
      isBgDbLimiterDropError,
      BgDbSlowKillSwitchError,
      BgDbQueueOverflowError,
      BgDbQueueTimeoutError,
    } = await import("../lib/bg-db-limiter");

    expect(isBgDbLimiterDropError(new BgDbSlowKillSwitchError(5, 3))).toBe(true);
    expect(isBgDbLimiterDropError(new BgDbQueueOverflowError(10, 5))).toBe(true);
    expect(isBgDbLimiterDropError(new BgDbQueueTimeoutError(1000, 500))).toBe(true);
  });

  it("isBgDbLimiterDropError NON classifica errori applicativi reali come drop", async () => {
    const { isBgDbLimiterDropError } = await import("../lib/bg-db-limiter");

    expect(isBgDbLimiterDropError(new Error("connessione al DB rifiutata (errore reale)"))).toBe(false);
    expect(isBgDbLimiterDropError(new TypeError("qualcosa è undefined"))).toBe(false);
    expect(isBgDbLimiterDropError(null)).toBe(false);
    expect(isBgDbLimiterDropError(undefined)).toBe(false);
  });
});

describe("matching metrics — drop counter isolato dall'error counter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("recordCycleDrop incrementa cycleDropsTotal senza toccare cycleErrorsTotal", async () => {
    const metrics = await import("../matching/metrics");

    await metrics.recordCycleDrop("cleanup_delete_expired");
    await metrics.recordCycleDrop("route_affinity");
    await metrics.recordCycleError("some_other_real_error");

    const snapshot = await metrics.getMatchingMetrics();
    expect(snapshot).not.toBeNull();

    const dropsText = await snapshot!.register.metrics();
    expect(dropsText).toContain("bikerlink_matching_cycle_drops_total");
    expect(dropsText).toContain('phase="cleanup_delete_expired"');
    expect(dropsText).toContain('phase="route_affinity"');
    expect(dropsText).toContain("bikerlink_matching_cycle_errors_total");
    expect(dropsText).toContain('matcher="some_other_real_error"');
  });

  it("recordMatchingCycle accetta lo status 'skipped' per i cicli posticipati dal kill-switch", async () => {
    const metrics = await import("../matching/metrics");

    await expect(metrics.recordMatchingCycle("skipped", 123)).resolves.not.toThrow();

    const snapshot = await metrics.getMatchingMetrics();
    const text = await snapshot!.register.metrics();
    expect(text).toContain('status="skipped"');
  });
});
