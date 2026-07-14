import { describe, it, expect, vi, beforeEach } from "vitest";

// Task #10 (Quebracho c) — canale di escalation Quebracho→Horus→report.
// Invariante critica: MAI un throw da questo modulo, e MAI un fallback cloud
// se Horus non risponde — il finding originale resta comunque loggato.

const writeWatchdogLogMock = vi.hoisted(() => vi.fn(async () => "log-id-1"));
vi.mock("../ai/watchdog/log", () => ({ writeWatchdogLog: writeWatchdogLogMock }));

const callOllamaChatMock = vi.hoisted(() => vi.fn(async () => "Valutazione sintetica di Horus."));
vi.mock("../lib/ollama-client", () => ({ callOllamaChat: callOllamaChatMock }));

vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));

import { escalateFinding, askHorusForAssessment } from "../ai/coordinator/escalation";

beforeEach(() => {
  writeWatchdogLogMock.mockReset().mockResolvedValue("log-id-1");
  callOllamaChatMock.mockReset().mockResolvedValue("Valutazione sintetica di Horus.");
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
