import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #37 — Il proposer generico (Groq/OpenAI/Gemini) e il proposer di routing
// di Horus (Ollama sul ThinkCentre) girano ognuno sul PROPRIO cooldown
// (lastProposerRunAt vs lastHorusProposerRunAt in scheduler.ts). Un problema
// di routing persistente (es. Valhalla giù tutto il giorno) NON deve richiamare
// il modello di Horus ad ogni tick (spam/quota burn), e i due cooldown NON
// devono essere accoppiati: se uno è in cooldown l'altro deve poter comunque
// girare quando il suo problema compare per la prima volta.
//
// Isoliamo tick() mockando aggregator/auto-fix/proposer/alerts; controlliamo
// il tempo con vi.useFakeTimers per attraversare la finestra di cooldown
// (60 minuti) senza attendere davvero.
// ---------------------------------------------------------------------------

const runAggregatorCycleMock = vi.hoisted(() => vi.fn());
const runAutoFixMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const runProposerMock = vi.hoisted(() => vi.fn());
const runHorusRoutingProposerMock = vi.hoisted(() => vi.fn());
const filterHorusProblemsMock = vi.hoisted(() =>
  vi.fn((problems: Array<{ source?: string; id: string; severity: string }>) =>
    problems.filter(
      (p) => (p.source === "horus" || p.id.startsWith("horus.")) && (p.severity === "high" || p.severity === "critical"),
    ),
  ),
);
const dispatchAlertsMock = vi.hoisted(() => vi.fn().mockResolvedValue({ sent: 0 }));
const isWatchdogEnabledMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const sendSystemAlertPushToAdminsMock = vi.hoisted(() => vi.fn().mockResolvedValue(0));

vi.mock("../ai/watchdog/aggregator", () => ({
  runAggregatorCycle: runAggregatorCycleMock,
}));
vi.mock("../ai/watchdog/auto-fix", () => ({
  runAutoFix: runAutoFixMock,
}));
vi.mock("../ai/watchdog/proposer", () => ({
  runProposer: runProposerMock,
}));
vi.mock("../ai/watchdog/horus-proposer", () => ({
  runHorusRoutingProposer: runHorusRoutingProposerMock,
  filterHorusProblems: filterHorusProblemsMock,
}));
vi.mock("../ai/watchdog/alerts", () => ({
  dispatchAlerts: dispatchAlertsMock,
}));
vi.mock("../ai/watchdog/signals", () => ({
  cleanupOldSignals: vi.fn().mockResolvedValue(0),
}));
vi.mock("../ai/watchdog/kill-switch", () => ({
  isWatchdogEnabled: isWatchdogEnabledMock,
}));
vi.mock("../ai/watchdog/weekly-report", () => ({
  startWeeklyReportScheduler: vi.fn(),
}));
vi.mock("../jobs/metro-crash-diag-job", () => ({
  startMetroCrashDiagScheduler: vi.fn(),
}));
vi.mock("../ai/watchdog/maps-telemetry-store", () => ({
  cleanupMapsTelemetry: vi.fn().mockResolvedValue(0),
}));
vi.mock("../ai/watchdog/maps-health-checks", () => ({
  runMapsHealthChecks: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../push-notifications-admin", () => ({
  sendSystemAlertPushToAdmins: sendSystemAlertPushToAdminsMock,
}));
vi.mock("../ai/coordinator/gated-job", () => ({
  withJobGate: (_name: string, fn: (...args: unknown[]) => unknown) => fn,
}));

import { _tickForTests as tick, _resetSchedulerCooldownsForTests } from "../ai/watchdog/scheduler";
import type { HealthSnapshot, Problem } from "../ai/watchdog/types";

const routingProblem: Problem = {
  id: "horus.routing.valhalla.correct",
  severity: "critical",
  source: "horus",
  title: "Routing valhalla: correttezza KO",
};

const genericProblem: Problem = {
  id: "db.ping",
  severity: "high",
  source: "db",
  title: "DB ping lento",
};

function snapshot(problems: Problem[]): HealthSnapshot {
  return { status: "red", score: 40, problems, metrics: {}, generatedAt: new Date().toISOString() };
}

describe("watchdog scheduler — cooldown proposer generico vs Horus (Task #37)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T10:00:00.000Z"));
    _resetSchedulerCooldownsForTests();
    runAggregatorCycleMock.mockReset();
    runProposerMock.mockReset();
    runHorusRoutingProposerMock.mockReset();
    dispatchAlertsMock.mockClear();
    isWatchdogEnabledMock.mockResolvedValue(true);
    runProposerMock.mockResolvedValue({ proposals: [{}], meta: { provider: "groq", model: "x" } });
    runHorusRoutingProposerMock.mockResolvedValue({
      proposals: [{}],
      meta: { provider: "ollama", model: "qwen3:4b", costUsd: 0 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("un problema di routing persistente NON richiama Horus ad ogni tick (niente spam AI)", async () => {
    runAggregatorCycleMock.mockResolvedValue(snapshot([routingProblem]));

    // 5 tick consecutivi (1 al minuto) con lo STESSO problema di routing persistente.
    for (let i = 0; i < 5; i++) {
      await tick();
      vi.advanceTimersByTime(60_000);
    }

    // Il proposer di Horus deve girare una sola volta (poi resta in cooldown 60min).
    expect(runHorusRoutingProposerMock).toHaveBeenCalledTimes(1);
  });

  it("il cooldown del proposer generico blocca il generico ma NON quello di Horus quando compare per la prima volta", async () => {
    // Tick 1: solo problema generico → il proposer generico gira e va in cooldown.
    runAggregatorCycleMock.mockResolvedValueOnce(snapshot([genericProblem]));
    await tick();
    expect(runProposerMock).toHaveBeenCalledTimes(1);
    expect(runHorusRoutingProposerMock).not.toHaveBeenCalled();

    // Tick 2 (30 min dopo, ancora dentro il cooldown generico): compare ANCHE il
    // problema di routing. Il generico deve restare in cooldown (skip), mentre
    // Horus — che non ha mai girato — deve poter partire subito.
    vi.advanceTimersByTime(30 * 60_000);
    runAggregatorCycleMock.mockResolvedValueOnce(snapshot([genericProblem, routingProblem]));
    await tick();

    expect(runProposerMock).toHaveBeenCalledTimes(1); // ancora 1: bloccato dal proprio cooldown
    expect(runHorusRoutingProposerMock).toHaveBeenCalledTimes(1); // Horus è partito indipendentemente
  });

  it("ogni proposer riparte sul PROPRIO orologio, non su quello dell'altro", async () => {
    // Tick 1 (t=0): solo problema generico → il generico gira e va in cooldown
    // ancorato a t=0 (scade a t=60min). Horus non presente, non gira.
    runAggregatorCycleMock.mockResolvedValueOnce(snapshot([genericProblem]));
    await tick();
    expect(runProposerMock).toHaveBeenCalledTimes(1);
    expect(runHorusRoutingProposerMock).not.toHaveBeenCalled();

    // Tick 2 (t=40min, ancora dentro il cooldown del generico): compare ANCHE il
    // problema di routing → il generico resta in cooldown (skip), Horus parte per
    // la prima volta e ancora il SUO cooldown a t=40min (scade a t=100min).
    vi.advanceTimersByTime(40 * 60_000);
    runAggregatorCycleMock.mockResolvedValueOnce(snapshot([genericProblem, routingProblem]));
    await tick();
    expect(runProposerMock).toHaveBeenCalledTimes(1); // ancora bloccato dal proprio cooldown
    expect(runHorusRoutingProposerMock).toHaveBeenCalledTimes(1); // partito per la prima volta

    // Tick 3 (t=65min totali): sono passati 65min dall'ultimo run generico (t=0)
    // → il SUO cooldown è scaduto, riparte. Sono passati solo 25min dall'ultimo
    // run di Horus (t=40min) → il SUO cooldown NON è scaduto, resta bloccato.
    // Prova che i due orologi sono davvero indipendenti, non un unico cooldown
    // condiviso ri-arma­to dall'ultimo tick "di qualcuno".
    vi.advanceTimersByTime(25 * 60_000);
    runAggregatorCycleMock.mockResolvedValueOnce(snapshot([genericProblem, routingProblem]));
    await tick();
    expect(runProposerMock).toHaveBeenCalledTimes(2); // riparte: 65min > 60min cooldown
    expect(runHorusRoutingProposerMock).toHaveBeenCalledTimes(1); // ancora bloccato: solo 25min dal suo ultimo run
  });

  it("dopo la finestra di cooldown (60min) entrambi i proposer possono girare di nuovo", async () => {
    runAggregatorCycleMock.mockResolvedValue(snapshot([routingProblem, genericProblem]));

    await tick();
    expect(runProposerMock).toHaveBeenCalledTimes(1);
    expect(runHorusRoutingProposerMock).toHaveBeenCalledTimes(1);

    // Dentro il cooldown: nessuno dei due deve rigirare.
    vi.advanceTimersByTime(59 * 60_000);
    await tick();
    expect(runProposerMock).toHaveBeenCalledTimes(1);
    expect(runHorusRoutingProposerMock).toHaveBeenCalledTimes(1);

    // Superata la finestra di 60min: entrambi possono girare di nuovo.
    vi.advanceTimersByTime(2 * 60_000);
    await tick();
    expect(runProposerMock).toHaveBeenCalledTimes(2);
    expect(runHorusRoutingProposerMock).toHaveBeenCalledTimes(2);
  });

  it("nessun problema high/critical residuo → nessuno dei due proposer viene invocato", async () => {
    runAggregatorCycleMock.mockResolvedValue(snapshot([{ ...routingProblem, severity: "warn" }]));

    await tick();

    expect(runProposerMock).not.toHaveBeenCalled();
    expect(runHorusRoutingProposerMock).not.toHaveBeenCalled();
  });
});
