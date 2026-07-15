import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #72 — sovraccarico sostenuto (DB e backend) emette segnali "high"
// (db.db.overload_sustained / app.backend.overload_sustained). Verifichiamo che
// dispatchAlerts() invii una push agli admin per ciascun lato, distinguendoli, e
// che rispetti throttle e gate severity — stesso schema del test HNSW.
// ---------------------------------------------------------------------------

const sendPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(2));

vi.mock("../push-notifications", () => ({
  sendSystemAlertPushToAdmins: sendPushMock,
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: vi.fn().mockResolvedValue("log-id"),
}));

vi.mock("../ai/coordinator/integrations/watchdog", () => ({
  emitWatchdogAlert: vi.fn().mockResolvedValue(undefined),
  emitWatchdogStatusChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/watchdog/maps-kill-switch", () => ({
  isMapsFlagEnabled: vi.fn().mockResolvedValue(true),
}));

import { dispatchAlerts, _resetThrottleForTests } from "../ai/watchdog/alerts";
import type { HealthSnapshot, Problem } from "../ai/watchdog/types";

function makeSnapshot(problems: Problem[]): HealthSnapshot {
  return {
    status: "yellow",
    score: 78,
    problems,
    metrics: {},
    generatedAt: new Date().toISOString(),
  };
}

const dbOverloadProblem: Problem = {
  id: "db.db.overload_sustained",
  severity: "high",
  source: "db",
  title: "Database sovraccarico da 3 cicli consecutivi (pool al 95%, ping 800ms)",
  suggestion: "Il database è sovraccarico in modo sostenuto. Verifica query lente/lock.",
  detail: JSON.stringify({ consecutiveTicks: 3, reasons: ["pool al 95%", "ping 800ms"], poolActivePct: 95 }),
};

const backendOverloadProblem: Problem = {
  id: "app.backend.overload_sustained",
  severity: "high",
  source: "app",
  title: "Backend Node sovraccarico da 4 cicli consecutivi (event-loop lag 150ms)",
  suggestion: "Il server Node è sovraccarico in modo sostenuto. Verifica loop bloccanti.",
  detail: JSON.stringify({ consecutiveTicks: 4, reasons: ["event-loop lag 150ms"], cpuPct: 40 }),
};

describe("watchdog overload alerts (Task #72)", () => {
  beforeEach(() => {
    sendPushMock.mockClear();
    _resetThrottleForTests();
  });

  it("invia una push DB quando il segnale db.overload_sustained è high", async () => {
    const result = await dispatchAlerts(makeSnapshot([dbOverloadProblem]));

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [title, , payload] = sendPushMock.mock.calls[0];
    expect(title).toContain("Database sovraccarico");
    expect(payload).toMatchObject({ type: "watchdog_db_overload", consecutiveTicks: 3 });
    expect(result.sent).toBe(2);
  });

  it("invia una push backend quando il segnale backend.overload_sustained è high", async () => {
    await dispatchAlerts(makeSnapshot([backendOverloadProblem]));

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [title, , payload] = sendPushMock.mock.calls[0];
    expect(title).toContain("Backend sovraccarico");
    expect(payload).toMatchObject({ type: "watchdog_backend_overload", consecutiveTicks: 4 });
  });

  it("distingue DB e backend: due push separate quando entrambi sono sovraccarichi", async () => {
    await dispatchAlerts(makeSnapshot([dbOverloadProblem, backendOverloadProblem]));

    const dbCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_overload",
    );
    const backendCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_backend_overload",
    );
    expect(dbCalls).toHaveLength(1);
    expect(backendCalls).toHaveLength(1);
  });

  it("throttle: non reinvia la stessa push DB entro la finestra TTL", async () => {
    await dispatchAlerts(makeSnapshot([dbOverloadProblem]));
    await dispatchAlerts(makeSnapshot([dbOverloadProblem]));

    const dbCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_overload",
    );
    expect(dbCalls).toHaveLength(1);
  });

  it("NON invia push quando la severity è declassata a warn (es. ThinkCentre spento)", async () => {
    const warnedDb: Problem = { ...dbOverloadProblem, severity: "warn" };
    const warnedBackend: Problem = { ...backendOverloadProblem, severity: "warn" };

    await dispatchAlerts(makeSnapshot([warnedDb, warnedBackend]));

    const overloadCalls = sendPushMock.mock.calls.filter(([, , p]) => {
      const t = (p as { type?: string })?.type;
      return t === "watchdog_db_overload" || t === "watchdog_backend_overload";
    });
    expect(overloadCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Task #84 — rientro dal sovraccarico sostenuto. L'overload-collector emette un
  // segnale info *.overload_recovered (value numerico → finisce nei metrics dello
  // snapshot). dispatchAlerts() legge quei metrics e invia UNA push "rientrato"
  // distinguendo DB e backend, rispettando il throttle.
  // -------------------------------------------------------------------------
  function snapWithMetrics(metrics: Record<string, number>): HealthSnapshot {
    return { status: "green", score: 96, problems: [], metrics, generatedAt: new Date().toISOString() };
  }

  it("invia una push di rientro DB quando db.db.overload_recovered è nei metrics (dopo uno start reale)", async () => {
    // Task #96 — lo start alert reale arma il latch; solo allora il rientro parte.
    await dispatchAlerts(makeSnapshot([dbOverloadProblem]));
    sendPushMock.mockClear();

    await dispatchAlerts(snapWithMetrics({ "db.db.overload_recovered": 3 }));

    const dbCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_recovered",
    );
    expect(dbCalls).toHaveLength(1);
    expect(dbCalls[0][0]).toContain("Database rientrato");
  });

  it("invia una push di rientro backend quando app.backend.overload_recovered è nei metrics (dopo uno start reale)", async () => {
    await dispatchAlerts(makeSnapshot([backendOverloadProblem]));
    sendPushMock.mockClear();

    await dispatchAlerts(snapWithMetrics({ "app.backend.overload_recovered": 3 }));

    const beCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_backend_recovered",
    );
    expect(beCalls).toHaveLength(1);
    expect(beCalls[0][0]).toContain("Backend rientrato");
  });

  it("distingue rientro DB e backend: due push separate quando entrambi rientrano", async () => {
    await dispatchAlerts(makeSnapshot([dbOverloadProblem, backendOverloadProblem]));
    sendPushMock.mockClear();

    await dispatchAlerts(snapWithMetrics({
      "db.db.overload_recovered": 3,
      "app.backend.overload_recovered": 4,
    }));

    const types = sendPushMock.mock.calls.map(([, , p]) => (p as { type?: string })?.type);
    expect(types.filter((t) => t === "watchdog_db_recovered")).toHaveLength(1);
    expect(types.filter((t) => t === "watchdog_backend_recovered")).toHaveLength(1);
  });

  it("throttle: non reinvia la stessa push di rientro DB entro la finestra TTL", async () => {
    // Primo incidente completo: start (arma latch) → rientro (push inviata, latch consumato).
    await dispatchAlerts(makeSnapshot([dbOverloadProblem]));
    await dispatchAlerts(snapWithMetrics({ "db.db.overload_recovered": 3 }));
    sendPushMock.mockClear();

    // Secondo incidente entro la finestra: nuovo start ri-arma il latch, ma il
    // throttle (10 min) blocca la seconda push di rientro.
    await dispatchAlerts(makeSnapshot([dbOverloadProblem]));
    await dispatchAlerts(snapWithMetrics({ "db.db.overload_recovered": 5 }));

    const dbCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_recovered",
    );
    expect(dbCalls).toHaveLength(0);
  });

  it("nessuna push di rientro quando i metrics non contengono le chiavi", async () => {
    await dispatchAlerts(makeSnapshot([dbOverloadProblem, backendOverloadProblem]));
    sendPushMock.mockClear();

    await dispatchAlerts(snapWithMetrics({}));

    const recoveryCalls = sendPushMock.mock.calls.filter(([, , p]) => {
      const t = (p as { type?: string })?.type;
      return t === "watchdog_db_recovered" || t === "watchdog_backend_recovered";
    });
    expect(recoveryCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Task #96 — il gate anti "all-clear fantasma": se lo start alert non è mai
  // stato emesso agli admin (nessuno start, oppure start soppresso perché il
  // ThinkCentre è spento → severity declassata a "warn"), NON deve partire alcuna
  // push di rientro leggendo i metrics grezzi.
  // -------------------------------------------------------------------------
  it("NON invia push di rientro DB se non c'era uno start alert precedente", async () => {
    await dispatchAlerts(snapWithMetrics({ "db.db.overload_recovered": 3 }));

    const dbCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_recovered",
    );
    expect(dbCalls).toHaveLength(0);
  });

  it("NON invia push di rientro backend se non c'era uno start alert precedente", async () => {
    await dispatchAlerts(snapWithMetrics({ "app.backend.overload_recovered": 3 }));

    const beCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_backend_recovered",
    );
    expect(beCalls).toHaveLength(0);
  });

  it("NON invia push di rientro se lo start era soppresso (ThinkCentre spento → warn)", async () => {
    // Start declassato a "warn" dalla soppressione downstream: latch mai armato.
    const warnedDb: Problem = { ...dbOverloadProblem, severity: "warn" };
    const warnedBackend: Problem = { ...backendOverloadProblem, severity: "warn" };
    await dispatchAlerts(makeSnapshot([warnedDb, warnedBackend]));
    sendPushMock.mockClear();

    await dispatchAlerts(snapWithMetrics({
      "db.db.overload_recovered": 3,
      "app.backend.overload_recovered": 4,
    }));

    const recoveryCalls = sendPushMock.mock.calls.filter(([, , p]) => {
      const t = (p as { type?: string })?.type;
      return t === "watchdog_db_recovered" || t === "watchdog_backend_recovered";
    });
    expect(recoveryCalls).toHaveLength(0);
  });
});
