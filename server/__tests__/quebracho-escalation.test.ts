import { describe, it, expect, vi, beforeEach } from "vitest";

// Task #10 (Quebracho c) — canale di escalation Quebracho→Horus→report.
// Invariante critica: MAI un throw da questo modulo, e MAI un fallback cloud
// se Horus non risponde — il finding originale resta comunque loggato.

const writeWatchdogLogMock = vi.hoisted(() => vi.fn(async () => "log-id-1"));
vi.mock("../ai/watchdog/log", () => ({ writeWatchdogLog: writeWatchdogLogMock }));

const callOllamaChatMock = vi.hoisted(() => vi.fn(async () => "Valutazione sintetica di Horus."));
vi.mock("../lib/ollama-client", () => ({ callOllamaChat: callOllamaChatMock }));

vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));

const applyJobDirectiveMock = vi.hoisted(() => vi.fn(async () => ({ applied: true, jobName: "job", kind: "pause" as const })));
vi.mock("../ai/coordinator/job-gate", () => ({ applyJobDirective: applyJobDirectiveMock }));

import {
  escalateFinding,
  askHorusForAssessment,
  __resetEscalationRepeatCountersForTests,
} from "../ai/coordinator/escalation";

beforeEach(() => {
  writeWatchdogLogMock.mockReset().mockResolvedValue("log-id-1");
  callOllamaChatMock.mockReset().mockResolvedValue("Valutazione sintetica di Horus.");
  applyJobDirectiveMock.mockReset().mockResolvedValue({ applied: true, jobName: "job", kind: "pause" });
  __resetEscalationRepeatCountersForTests();
  vi.useRealTimers();
});

describe("escalateFinding", () => {
  it("logga sempre il finding originale come alert", async () => {
    await escalateFinding({ scope: "demo_guard", summary: "problema rilevato" });
    expect(writeWatchdogLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "alert", scope: "demo_guard", summary: "problema rilevato" }),
    );
  });

  it("persiste una seconda voce con la valutazione di Horus quando risponde", async () => {
    await escalateFinding({ scope: "demo_guard", summary: "problema rilevato" });
    expect(writeWatchdogLogMock).toHaveBeenCalledTimes(2);
    const secondCall = writeWatchdogLogMock.mock.calls[1][0];
    expect(secondCall.scope).toBe("demo_guard_escalation");
    expect(secondCall.summary).toContain("Valutazione sintetica di Horus.");
  });

  it("non aggiunge una seconda voce se Horus è irraggiungibile (nessun crash)", async () => {
    callOllamaChatMock.mockRejectedValue(new Error("Ollama non disponibile"));
    const id = await escalateFinding({ scope: "demo_guard", summary: "problema rilevato" });
    expect(id).toBe("log-id-1");
    expect(writeWatchdogLogMock).toHaveBeenCalledTimes(1); // solo il finding originale
  });

  it("askHorusForAssessment non lancia mai anche se callOllamaChat lancia", async () => {
    callOllamaChatMock.mockRejectedValue(new Error("boom"));
    const result = await askHorusForAssessment({ scope: "x", summary: "y" });
    expect(result).toBeNull();
  });

  it("scarta una risposta vuota da Horus", async () => {
    callOllamaChatMock.mockResolvedValue("   ");
    const result = await askHorusForAssessment({ scope: "x", summary: "y" });
    expect(result).toBeNull();
  });
});

describe("escalateFinding — auto-pausa Horus su finding severi ripetuti", () => {
  it("i finding 'warn' non contano MAI verso la soglia severa, anche ripetuti", async () => {
    for (let i = 0; i < 5; i++) {
      await escalateFinding(
        { scope: "auto_pause_guard", summary: "solo un warning", affectedJob: "job-x" },
        { status: "warn" },
      );
    }
    expect(applyJobDirectiveMock).not.toHaveBeenCalled();
  });

  it("un singolo finding 'error' non basta da solo a mettere in pausa (sotto soglia)", async () => {
    await escalateFinding(
      { scope: "auto_pause_guard", summary: "errore isolato", affectedJob: "job-x" },
      { status: "error" },
    );
    expect(applyJobDirectiveMock).not.toHaveBeenCalled();
  });

  it("warning seguiti da un solo errore NON raggiungono la soglia (i warning non contano)", async () => {
    await escalateFinding({ scope: "auto_pause_guard", summary: "w1", affectedJob: "job-x" }, { status: "warn" });
    await escalateFinding({ scope: "auto_pause_guard", summary: "w2", affectedJob: "job-x" }, { status: "warn" });
    await escalateFinding({ scope: "auto_pause_guard", summary: "e1", affectedJob: "job-x" }, { status: "error" });
    expect(applyJobDirectiveMock).not.toHaveBeenCalled();
  });

  it("3 finding 'error' ripetuti sullo stesso scope mettono in pausa il job come 'horus'", async () => {
    await escalateFinding({ scope: "auto_pause_guard", summary: "e1", affectedJob: "job-x" }, { status: "error" });
    await escalateFinding({ scope: "auto_pause_guard", summary: "e2", affectedJob: "job-x" }, { status: "error" });
    expect(applyJobDirectiveMock).not.toHaveBeenCalled(); // ancora sotto soglia
    await escalateFinding({ scope: "auto_pause_guard", summary: "e3", affectedJob: "job-x" }, { status: "error" });
    expect(applyJobDirectiveMock).toHaveBeenCalledTimes(1);
    expect(applyJobDirectiveMock).toHaveBeenCalledWith(
      "job-x",
      "pause",
      expect.objectContaining({ reason: expect.any(String) }),
      "horus",
    );
  });

  it("nessuna auto-pausa se il finding severo non ha affectedJob", async () => {
    await escalateFinding({ scope: "auto_pause_guard_2", summary: "e1" }, { status: "error" });
    await escalateFinding({ scope: "auto_pause_guard_2", summary: "e2" }, { status: "error" });
    await escalateFinding({ scope: "auto_pause_guard_2", summary: "e3" }, { status: "error" });
    expect(applyJobDirectiveMock).not.toHaveBeenCalled();
  });

  it("un finding severo fuori dalla finestra temporale resetta il progresso", async () => {
    vi.useFakeTimers();
    const base = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(base);
    await escalateFinding({ scope: "auto_pause_guard_3", summary: "e1", affectedJob: "job-y" }, { status: "error" });
    await escalateFinding({ scope: "auto_pause_guard_3", summary: "e2", affectedJob: "job-y" }, { status: "error" });

    // Oltre la finestra di 24h: il contatore riparte da 1, non da 3.
    vi.setSystemTime(new Date(base.getTime() + 25 * 60 * 60 * 1000));
    await escalateFinding({ scope: "auto_pause_guard_3", summary: "e3", affectedJob: "job-y" }, { status: "error" });
    expect(applyJobDirectiveMock).not.toHaveBeenCalled();

    await escalateFinding({ scope: "auto_pause_guard_3", summary: "e4", affectedJob: "job-y" }, { status: "error" });
    expect(applyJobDirectiveMock).not.toHaveBeenCalled();
    await escalateFinding({ scope: "auto_pause_guard_3", summary: "e5", affectedJob: "job-y" }, { status: "error" });
    expect(applyJobDirectiveMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
