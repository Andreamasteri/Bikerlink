import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #946 — routing plausibility failures (GH/Valhalla rispondono 2xx ma il
// percorso è anomalo) emettono un segnale "high" (horus.routing.<engine>.correct).
// Verifichiamo che dispatchAlerts() invii una push agli admin per ciascun engine,
// rispetti il throttle e NON invii quando la severity è declassata a "warn".
//
// Il loop generico di alerts.ts notifica solo severity "critical" → il blocco
// dedicato (Task #941) è indispensabile per far partire la push. Questi test lo
// verificano direttamente.
// ---------------------------------------------------------------------------

const sendPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(2));
const getAdminPushTokenCountMock = vi.hoisted(() => vi.fn().mockResolvedValue(-1));

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

// getAdminPushTokenCount è chiamato a ogni dispatchAlerts() per il guard anti-spam.
// Default: -1 (errore DB simulato) → guard non si attiva.
vi.mock("../push-notifications-internal", () => ({
  getAdminPushTokenCount: getAdminPushTokenCountMock,
}));

import { dispatchAlerts, _resetThrottleForTests } from "../ai/watchdog/alerts";
import type { HealthSnapshot, Problem } from "../ai/watchdog/types";

function makeSnapshot(problems: Problem[]): HealthSnapshot {
  return {
    status: "yellow",
    score: 75,
    problems,
    metrics: {},
    generatedAt: new Date().toISOString(),
  };
}

const ghPlausibilityProblem: Problem = {
  id: "horus.routing.graphhopper.correct",
  severity: "high",
  source: "horus",
  title: "GraphHopper: percorso anomalo (velocità implicita 380 km/h)",
  suggestion: "Verifica il grafo GraphHopper sul ThinkCentre.",
  detail: JSON.stringify({
    reason: "velocità implicita 380 km/h",
    distanceKm: 120,
    durationMin: 19,
    impliedKmh: 380,
  }),
};

const valhallaPlausibilityProblem: Problem = {
  id: "horus.routing.valhalla.correct",
  severity: "high",
  source: "horus",
  title: "Valhalla: percorso anomalo (distanza 2 km per tratta di 200 km)",
  suggestion: "Verifica i tile Valhalla sul ThinkCentre.",
  detail: JSON.stringify({
    reason: "distanza 2 km per tratta di 200 km",
    distanceKm: 2,
    durationMin: 4,
    impliedKmh: 30,
  }),
};

describe("watchdog routing plausibility alerts (Task #946)", () => {
  beforeEach(() => {
    sendPushMock.mockClear();
    getAdminPushTokenCountMock.mockClear();
    _resetThrottleForTests();
  });

  it("invia una push agli admin quando horus.routing.graphhopper.correct è high", async () => {
    const result = await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [title, body, payload] = sendPushMock.mock.calls[0];
    expect(title).toContain("graphhopper");
    expect(body).toContain("graphhopper");
    expect(payload).toMatchObject({
      type: "watchdog_routing_plausibility",
      engine: "graphhopper",
    });
    expect(result.sent).toBe(2);
  });

  it("invia una push agli admin quando horus.routing.valhalla.correct è high", async () => {
    const result = await dispatchAlerts(makeSnapshot([valhallaPlausibilityProblem]));

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [title, body, payload] = sendPushMock.mock.calls[0];
    expect(title).toContain("valhalla");
    expect(body).toContain("valhalla");
    expect(payload).toMatchObject({
      type: "watchdog_routing_plausibility",
      engine: "valhalla",
    });
    expect(result.sent).toBe(2);
  });

  it("invia il reason estratto dal detail nel corpo della push", async () => {
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));

    const [, body] = sendPushMock.mock.calls[0];
    expect(body).toContain("velocità implicita 380 km/h");
  });

  it("throttle: non reinvia la push graphhopper entro la finestra TTL di 10 min", async () => {
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));

    const ghCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "graphhopper",
    );
    expect(ghCalls).toHaveLength(1);
  });

  it("throttle: non reinvia la push valhalla entro la finestra TTL di 10 min", async () => {
    await dispatchAlerts(makeSnapshot([valhallaPlausibilityProblem]));
    await dispatchAlerts(makeSnapshot([valhallaPlausibilityProblem]));

    const vCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "valhalla",
    );
    expect(vCalls).toHaveLength(1);
  });

  it("GH e Valhalla hanno throttle indipendenti: due push separate quando entrambi sono high", async () => {
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem, valhallaPlausibilityProblem]));

    const ghCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "graphhopper",
    );
    const vCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "valhalla",
    );
    expect(ghCalls).toHaveLength(1);
    expect(vCalls).toHaveLength(1);
  });

  it("GH throttle non blocca Valhalla: Valhalla invia anche se GH è già throttled", async () => {
    // Prima call: GH entra nel throttle
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));
    sendPushMock.mockClear();

    // Seconda call: GH throttled, Valhalla è nuovo → deve passare
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem, valhallaPlausibilityProblem]));

    const ghCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "graphhopper",
    );
    const vCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "valhalla",
    );
    expect(ghCalls).toHaveLength(0); // throttled
    expect(vCalls).toHaveLength(1);  // libera
  });

  it("NON invia push graphhopper quando la severity è declassata a warn", async () => {
    const warned: Problem = { ...ghPlausibilityProblem, severity: "warn" };

    await dispatchAlerts(makeSnapshot([warned]));

    const ghCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "graphhopper",
    );
    expect(ghCalls).toHaveLength(0);
  });

  it("NON invia push valhalla quando la severity è declassata a warn", async () => {
    const warned: Problem = { ...valhallaPlausibilityProblem, severity: "warn" };

    await dispatchAlerts(makeSnapshot([warned]));

    const vCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "valhalla",
    );
    expect(vCalls).toHaveLength(0);
  });

  it("NON invia push per un segnale routing.correct con severity critical (coperto dal loop generico)", async () => {
    // severity "critical" sul segnale plausibility non deve far scattare DUE push
    // (una dal blocco dedicato + una dal loop generico critical): il blocco dedicato
    // controlla solo "high", lasciando il critical al loop generico.
    const criticalGh: Problem = { ...ghPlausibilityProblem, severity: "critical" };

    await dispatchAlerts(makeSnapshot([criticalGh]));

    const plausibilityCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_routing_plausibility",
    );
    expect(plausibilityCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task #952 — recovery ("all-clear") per il segnale di plausibilità routing.
// Il collector emette horus.routing.<engine>.correct.recovered quando l'engine
// torna a rispondere con percorsi plausibili. alerts.ts legge il metric dallo
// snapshot e invia la push di rientro SOLO se il latch start era armato
// (cioè se una push "high" era stata realmente emessa).
// ---------------------------------------------------------------------------
function makeRecoverySnapshot(
  problems: Problem[],
  recoveredEngines: Array<"graphhopper" | "valhalla"> = [],
): HealthSnapshot {
  const metrics: Record<string, number> = {};
  for (const eng of recoveredEngines) {
    metrics[`horus.routing.${eng}.correct.recovered`] = 1;
  }
  return {
    status: "yellow",
    score: 90,
    problems,
    metrics,
    generatedAt: new Date().toISOString(),
  };
}

describe("watchdog routing plausibility recovery alerts (Task #952)", () => {
  beforeEach(() => {
    sendPushMock.mockClear();
    getAdminPushTokenCountMock.mockClear();
    _resetThrottleForTests();
  });

  it("invia la push di rientro GH se il latch start era armato", async () => {
    // Ciclo 1: problema high → arma il latch
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));
    sendPushMock.mockClear();

    // Ciclo 2: nessun problema, ma metric recovered presente
    await dispatchAlerts(makeRecoverySnapshot([], ["graphhopper"]));

    const recoveryCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    expect(recoveryCalls).toHaveLength(1);
    const [title, , payload] = recoveryCalls[0];
    expect(title).toContain("GraphHopper");
    expect((payload as { engine?: string })?.engine).toBe("graphhopper");
  });

  it("invia la push di rientro Valhalla se il latch start era armato", async () => {
    await dispatchAlerts(makeSnapshot([valhallaPlausibilityProblem]));
    sendPushMock.mockClear();

    await dispatchAlerts(makeRecoverySnapshot([], ["valhalla"]));

    const recoveryCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    expect(recoveryCalls).toHaveLength(1);
    const [title, , payload] = recoveryCalls[0];
    expect(title).toContain("Valhalla");
    expect((payload as { engine?: string })?.engine).toBe("valhalla");
  });

  it("NON invia la push di rientro GH se il latch start non era armato", async () => {
    // Nessun ciclo "high" precedente → latch non armato
    await dispatchAlerts(makeRecoverySnapshot([], ["graphhopper"]));

    const recoveryCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    expect(recoveryCalls).toHaveLength(0);
  });

  it("NON invia la push di rientro Valhalla se il latch start non era armato", async () => {
    await dispatchAlerts(makeRecoverySnapshot([], ["valhalla"]));

    const recoveryCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    expect(recoveryCalls).toHaveLength(0);
  });

  it("latch GH non arma il rientro Valhalla e viceversa", async () => {
    // Arma solo GH
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));
    sendPushMock.mockClear();

    // Recovered per Valhalla: latch GH armato ma Valhalla mai notificato → 0 push Valhalla
    await dispatchAlerts(makeRecoverySnapshot([], ["valhalla"]));

    const recoveryCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    expect(recoveryCalls).toHaveLength(0);
  });

  it("throttle rientro GH: non reinvia la push di rientro entro il TTL di 10 min", async () => {
    // Arm → recover → secondo recover subito dopo (stesso TTL): deve essere bloccato
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));
    await dispatchAlerts(makeRecoverySnapshot([], ["graphhopper"]));
    sendPushMock.mockClear();

    // Secondo ciclo con problema → re-arma il latch
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));
    sendPushMock.mockClear();

    // Secondo rientro entro il TTL → throttled
    await dispatchAlerts(makeRecoverySnapshot([], ["graphhopper"]));

    const recoveryCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    expect(recoveryCalls).toHaveLength(0);
  });

  it("il latch viene consumato: un secondo rientro senza nuovo start non invia push", async () => {
    // Start → recover (consuma latch)
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem]));
    _resetThrottleForTests(); // resetta throttle per poter ritestare il rientro
    // Simula: latch resettato (non armato) + metric recovered presente
    await dispatchAlerts(makeRecoverySnapshot([], ["graphhopper"]));

    const recoveryCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    // _resetThrottleForTests azzera anche i latch → nessuna push
    expect(recoveryCalls).toHaveLength(0);
  });

  it("rientro GH e Valhalla contemporanei: due push separate se entrambi i latch erano armati", async () => {
    await dispatchAlerts(makeSnapshot([ghPlausibilityProblem, valhallaPlausibilityProblem]));
    sendPushMock.mockClear();

    await dispatchAlerts(makeRecoverySnapshot([], ["graphhopper", "valhalla"]));

    const ghRecovery = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "graphhopper" &&
        (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    const vRecovery = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { engine?: string })?.engine === "valhalla" &&
        (payload as { type?: string })?.type === "watchdog_routing_plausibility_recovered",
    );
    expect(ghRecovery).toHaveLength(1);
    expect(vRecovery).toHaveLength(1);
  });
});
