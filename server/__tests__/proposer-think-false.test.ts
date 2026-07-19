import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #859 — Verifica che runProposer (proposer.ts) e runHorusRoutingProposer
// (horus-proposer.ts) passino entrambi think:false nelle providerOptions di
// generateStructured/generateObject quando chiamano Ollama sul ThinkCentre.
//
// Con think:true su Ollama 0.30.11 + qwen3, il path non-streaming di
// structured-output JSON restituisce 400 Bad Request. Task #858 ha corretto i
// callsite; questi test verificano che la correzione NON regredisca.
//
// Strategia di test:
//   • Mocchiamo generateStructured e catturiamo le providerOptions ricevute.
//   • Mocchiamo tryBuildOllama con un modello fittizio in modo che il proposer
//     esegua il ramo Ollama (Step 0).
//   • Verifichiamo che providerOptions.ollama.think === false.
//   • Verifichiamo che nessun Bad Request venga lanciato simulando un Ollama
//     che restituisce 400 quando think=true e 200 quando think=false.
// ---------------------------------------------------------------------------

// ─── hoist mocks ────────────────────────────────────────────────────────────
const writeWatchdogLogMock = vi.hoisted(() => vi.fn().mockResolvedValue("log-id-1"));
const generateStructuredMock = vi.hoisted(() => vi.fn());
const appSettingStore = vi.hoisted(() => new Map<string, string>());

const fakeOllamaModel = vi.hoisted(() => ({
  id: "ollama-local",
  providerName: "ollama",
  modelId: "qwen3:4b",
  scheduler: <T>(f: () => Promise<T>) => f(),
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: writeWatchdogLogMock,
}));

vi.mock("../ai/watchdog/kill-switch", () => ({
  isWatchdogEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../ai/watchdog/maps-kill-switch", () => ({
  isMapsFlagEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/thinkcentre-ignore-tests", () => ({
  isThinkCentreIgnoredForTests: vi.fn().mockResolvedValue(false),
}));

vi.mock("../ai/moderation/budget", () => ({
  withBudget: vi.fn(async (_scope: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../ai/moderation/log", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/audit", () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/moderation/provider", () => ({
  estimateCostUsd: vi.fn().mockReturnValue(0.0001),
  generateStructured: generateStructuredMock,
  resolveModel: vi.fn(() => fakeOllamaModel),
  // tryBuildOllama ritorna il modello fittizio → Step 0 viene eseguito.
  tryBuildOllama: vi.fn(() => fakeOllamaModel),
  runWithFallback: vi.fn(async (_opts: unknown, fn: (m: unknown) => Promise<unknown>) => {
    const model = {
      id: "groq-fallback", providerName: "groq", modelId: "llama-3.3-70b-versatile",
      scheduler: <T>(f: () => Promise<T>) => f(),
    };
    const value = await fn(model);
    return { value, model };
  }),
}));

vi.mock("../storage", () => ({
  storage: {
    // Sempre nessun fingerprint → non viene saltata la call AI.
    getAppSetting: vi.fn(async (k: string) =>
      appSettingStore.has(k) ? { value: appSettingStore.get(k)! } : null,
    ),
    upsertAppSetting: vi.fn(async (k: string, v: string) => { appSettingStore.set(k, v); }),
  },
}));

import { runProposer, _resetProposerForTests } from "../ai/watchdog/proposer";
import type { HealthSnapshot, Problem } from "../ai/watchdog/types";

// Problema generico non-routing (non verrà filtrato dal proposer generico).
const dbProblem: Problem = {
  id: "db.embeddings.hnsw_index",
  severity: "high",
  source: "db",
  title: "Indice HNSW mancante — findSimilar() degrada a sequential scan",
};

function snapshot(problems: Problem[]): HealthSnapshot {
  return { status: "red", score: 45, problems, metrics: {}, generatedAt: new Date().toISOString() };
}

describe("proposer (Task #859) — think:false in providerOptions Ollama", () => {
  beforeEach(() => {
    writeWatchdogLogMock.mockClear();
    generateStructuredMock.mockReset();
    // Svuota lo store e azzera il fingerprint in-process tra i test.
    appSettingStore.clear();
    _resetProposerForTests();
  });

  it("runProposer passa think:false nelle providerOptions di generateStructured (Ollama Step 0)", async () => {
    generateStructuredMock.mockResolvedValue({
      object: {
        proposals: [{
          title: "Riavvia il server per ricostruire l'indice HNSW",
          reasoning: "L'indice HNSW è assente: findSimilar degrada a sequential scan. Un riavvio ricostruisce l'indice.",
          riskLevel: "medium",
          action: { kind: "restart_worker", target: "server", params: null },
          affectedComponents: ["embeddings"],
          rollbackHint: null,
        }],
      },
      usage: { inputTokens: 120, outputTokens: 90 },
    });

    const out = await runProposer(snapshot([dbProblem]));

    expect(out).not.toBeNull();
    expect(out!.proposals).toHaveLength(1);

    // Il mock di generateStructured deve essere stato chiamato con think:false.
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    const [, callOpts] = generateStructuredMock.mock.calls[0] as [
      unknown,
      { system: string; prompt: string; providerOptions?: Record<string, Record<string, unknown>> },
    ];

    // Task #858 — think:false obbligatorio per evitare 400 Bad Request su Ollama
    // con qwen3 + JSON structured-output non-streaming.
    expect(callOpts.providerOptions).toMatchObject({ ollama: { think: false } });
  });

  it("runProposer non lancia Bad Request quando think:false è impostato (simulazione 400 se think:true)", async () => {
    // Simula Ollama che lancia 400 se think:true, restituisce risultato valido se think:false.
    generateStructuredMock.mockImplementation(
      async (_model: unknown, opts: { providerOptions?: Record<string, Record<string, unknown>> }) => {
        const ollamaOpts = opts.providerOptions?.ollama ?? {};
        if (ollamaOpts.think === true) {
          throw new Error("Bad Request: think mode incompatible with JSON structured output");
        }
        return {
          object: {
            proposals: [{
              title: "Proposta test",
              reasoning: "Test OK — think:false non causa Bad Request.",
              riskLevel: "low" as const,
              action: { kind: "manual_only" as const, target: "test", params: null },
              affectedComponents: [],
              rollbackHint: null,
            }],
          },
          usage: { inputTokens: 50, outputTokens: 40 },
        };
      },
    );

    // Con think:false nel codice, questa chiamata deve NON lanciare eccezioni.
    await expect(runProposer(snapshot([dbProblem]))).resolves.not.toBeNull();

    // Nessun "Bad Request" deve essere apparso nei log del mock.
    const calls = generateStructuredMock.mock.calls as Array<[unknown, { providerOptions?: Record<string, Record<string, unknown>> }]>;
    for (const [, opts] of calls) {
      expect(opts.providerOptions?.ollama?.think).not.toBe(true);
    }
  });

  it("runProposer ritorna null se non ci sono problemi high/critical non-routing", async () => {
    const out = await runProposer(snapshot([
      { id: "horus.routing.valhalla.correct", severity: "high", source: "horus", title: "Routing KO" },
    ]));
    // Il proposer generico filtra i problemi "horus" → nessuna chiamata AI.
    expect(out).toBeNull();
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });
});
