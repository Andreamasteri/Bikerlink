import { describe, it, expect, beforeEach } from "vitest";
import { SustainedTracker } from "../ai/watchdog/state/sustained-tracker";
import type { SustainedTickInput } from "../ai/watchdog/state/sustained-tracker";

// ── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS = {
  poolActivePct: 90,
  pingMs: 500,
  consecutiveTicks: 3,
  eventLoopLagMs: 100,
  eventLoopP99Ms: 200,
  cpuPct: 80,
};

function healthyBackend() {
  return { overloaded: false, cpuPct: 10, eventLoopLagMs: 5, eventLoopP99Ms: 10, rssMb: 200 };
}

function overloadedBackend() {
  return { overloaded: true, cpuPct: 95, eventLoopLagMs: 500, eventLoopP99Ms: 800, rssMb: 1000 };
}

function dbTick(tracker: SustainedTracker, dbOverload: boolean, overrides: Partial<SustainedTickInput> = {}): void {
  tracker.tick({
    dbOverload,
    poolActivePct: dbOverload ? 95 : 20,
    poolWaiting: dbOverload ? 3 : 0,
    pingMs: dbOverload ? 600 : 10,
    dbErrorCount: 0,
    backend: healthyBackend(),
    thresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  });
}

// ── DB overload state machine ──────────────────────────────────────────────

describe("SustainedTracker — DB overload", () => {
  let tracker: SustainedTracker;

  beforeEach(() => { tracker = new SustainedTracker(); });

  it("non è sustained dopo 1 tick di overload", () => {
    dbTick(tracker, true);
    expect(tracker.getState().db.sustained).toBe(false);
    expect(tracker.getState().db.consecutiveTicks).toBe(1);
  });

  it("non è sustained dopo 2 tick di overload (sotto la finestra)", () => {
    dbTick(tracker, true);
    dbTick(tracker, true);
    expect(tracker.getState().db.sustained).toBe(false);
  });

  it("diventa sustained esattamente al tick N (consecutiveTicks=3)", () => {
    dbTick(tracker, true);
    dbTick(tracker, true);
    dbTick(tracker, true);
    const state = tracker.getState().db;
    expect(state.sustained).toBe(true);
    expect(state.consecutiveTicks).toBe(3);
  });

  it("resta sustained ai tick successivi", () => {
    for (let i = 0; i < 5; i++) dbTick(tracker, true);
    expect(tracker.getState().db.sustained).toBe(true);
    expect(tracker.getState().db.consecutiveTicks).toBe(5);
  });

  it("un tick sano azzera il contatore e rimuove sustained", () => {
    dbTick(tracker, true);
    dbTick(tracker, true);
    dbTick(tracker, false); // tick sano
    const state = tracker.getState().db;
    expect(state.sustained).toBe(false);
    expect(state.consecutiveTicks).toBe(0);
  });

  it("reset() azzera tutto lo stato", () => {
    for (let i = 0; i < 3; i++) dbTick(tracker, true);
    tracker.reset();
    const state = tracker.getState().db;
    expect(state.sustained).toBe(false);
    expect(state.consecutiveTicks).toBe(0);
    expect(state.healthyTicks).toBe(0);
  });
});

// ── Recovery edge flag ─────────────────────────────────────────────────────

describe("SustainedTracker — recovered edge", () => {
  let tracker: SustainedTracker;

  beforeEach(() => { tracker = new SustainedTracker(); });

  it("recovered è false se non c'è mai stato overload sostenuto", () => {
    dbTick(tracker, false);
    dbTick(tracker, false);
    dbTick(tracker, false);
    expect(tracker.getState().db.recovered).toBe(false);
  });

  it("recovered rimane false mentre il lato è ancora sovraccarico", () => {
    for (let i = 0; i < 3; i++) dbTick(tracker, true);
    expect(tracker.getState().db.recovered).toBe(false);
  });

  it("recovered è true per UN solo tick dopo la finestra di rientro", () => {
    // Entra in sustained
    for (let i = 0; i < 3; i++) dbTick(tracker, true);
    expect(tracker.getState().db.sustained).toBe(true);

    // 2 tick sani: non ancora recovered (sotto la finestra)
    dbTick(tracker, false);
    dbTick(tracker, false);
    expect(tracker.getState().db.recovered).toBe(false);

    // 3° tick sano: recovered diventa true
    dbTick(tracker, false);
    expect(tracker.getState().db.recovered).toBe(true);
    expect(tracker.getState().db.sustained).toBe(false);
  });

  it("recovered è true SOLO per un tick, poi torna false", () => {
    for (let i = 0; i < 3; i++) dbTick(tracker, true);
    for (let i = 0; i < 3; i++) dbTick(tracker, false);
    expect(tracker.getState().db.recovered).toBe(true);

    // Tick successivo: il latch è bruciato
    dbTick(tracker, false);
    expect(tracker.getState().db.recovered).toBe(false);
  });

  it("dopo il rientro, un nuovo overload sostenuto genera un secondo recovered", () => {
    // Primo ciclo
    for (let i = 0; i < 3; i++) dbTick(tracker, true);
    for (let i = 0; i < 3; i++) dbTick(tracker, false);
    expect(tracker.getState().db.recovered).toBe(true);
    dbTick(tracker, false); // consuma il recovered

    // Secondo ciclo
    for (let i = 0; i < 3; i++) dbTick(tracker, true);
    for (let i = 0; i < 3; i++) dbTick(tracker, false);
    expect(tracker.getState().db.recovered).toBe(true);
  });
});

// ── Backend overload (indipendente da DB) ──────────────────────────────────

describe("SustainedTracker — backend overload", () => {
  let tracker: SustainedTracker;

  beforeEach(() => { tracker = new SustainedTracker(); });

  it("backend è sustained dopo N tick indipendentemente dal DB", () => {
    for (let i = 0; i < 3; i++) {
      dbTick(tracker, false, { backend: overloadedBackend() });
    }
    expect(tracker.getState().backend.sustained).toBe(true);
    expect(tracker.getState().db.sustained).toBe(false);
  });

  it("entrambi i lati possono essere sustained contemporaneamente", () => {
    for (let i = 0; i < 3; i++) {
      dbTick(tracker, true, { backend: overloadedBackend() });
    }
    expect(tracker.getState().db.sustained).toBe(true);
    expect(tracker.getState().backend.sustained).toBe(true);
  });
});

// ── Thresholds configurabili ───────────────────────────────────────────────

describe("SustainedTracker — soglie configurabili", () => {
  it("consecutiveTicks=1 rende sustained al primo tick", () => {
    const tracker = new SustainedTracker();
    tracker.tick({
      dbOverload: true,
      poolActivePct: 95,
      poolWaiting: 2,
      pingMs: null,
      dbErrorCount: 0,
      backend: healthyBackend(),
      thresholds: { ...DEFAULT_THRESHOLDS, consecutiveTicks: 1 },
    });
    expect(tracker.getState().db.sustained).toBe(true);
  });

  it("reasons include pool quando poolActivePct >= soglia", () => {
    const tracker = new SustainedTracker();
    tracker.tick({
      dbOverload: true,
      poolActivePct: 95,
      poolWaiting: 2,
      pingMs: null,
      dbErrorCount: 0,
      backend: healthyBackend(),
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(tracker.getState().db.reasons).toContain("pool al 95%");
  });

  it("reasons include ping quando pingMs >= soglia", () => {
    const tracker = new SustainedTracker();
    tracker.tick({
      dbOverload: true,
      poolActivePct: 20,
      poolWaiting: 0,
      pingMs: 600,
      dbErrorCount: 0,
      backend: healthyBackend(),
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(tracker.getState().db.reasons.some((r) => r.startsWith("ping"))).toBe(true);
  });
});

// ── Feedback-loop guard ────────────────────────────────────────────────────

describe("SustainedTracker — nessun feedback loop", () => {
  it("lo stato torna sano quando pool/ping rientrano (dbErrorCount non drivedbOverload)", () => {
    // Simula il vecchio bug: passando dbOverload=true solo per dbErrorCount,
    // ma pool e ping sani. Il tracker NON deve auto-latchare se dbOverload=false.
    const tracker = new SustainedTracker();

    // 3 tick sovraccarico
    for (let i = 0; i < 3; i++) {
      tracker.tick({
        dbOverload: true,
        poolActivePct: 95,
        poolWaiting: 3,
        pingMs: null,
        dbErrorCount: 1, // conta errori
        backend: healthyBackend(),
        thresholds: DEFAULT_THRESHOLDS,
      });
    }
    expect(tracker.getState().db.sustained).toBe(true);

    // Pool e ping rientrano → dbOverload=false, anche se dbErrorCount=1
    // (nel nuovo codice dbErrorCount NON influenza dbOverload)
    for (let i = 0; i < 3; i++) {
      tracker.tick({
        dbOverload: false, // pool/ping sani → dbOverload false
        poolActivePct: 20,
        poolWaiting: 0,
        pingMs: 10,
        dbErrorCount: 1, // presente ma irrilevante per dbOverload
        backend: healthyBackend(),
        thresholds: DEFAULT_THRESHOLDS,
      });
    }
    // Deve rientrare: recovered=true, sustained=false
    expect(tracker.getState().db.sustained).toBe(false);
    expect(tracker.getState().db.recovered).toBe(true);
  });
});
