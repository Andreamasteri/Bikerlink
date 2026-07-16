/**
 * Test suite — decideEngineWithAI: think:false per Ollama (Task #275)
 *
 * Verifica che la chiamata generateObject verso Ollama includa sempre
 * `providerOptions: { ollama: { think: false } }` in modo che qwen3:1.7b
 * (BOWIE_OLLAMA_MODEL) non emetta token <think>…</think> che rompono
 * il parsing dello schema Zod.
 *
 * Mock: ai (generateObject), ai/moderation/provider (tryBuildOllama),
 *       ai/ai-priority-gate, ai/fallback-switch, routing-metrics.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stable mock refs (hoisted prima di vi.mock)
// ---------------------------------------------------------------------------
const aiMocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
}));

const ollamaModel = { _provider: "ollama", modelId: "qwen3:1.7b" } as const;

const providerMocks = vi.hoisted(() => ({
  tryBuildOllama: vi.fn(),
}));

const priorityMocks = vi.hoisted(() => ({
  withRoutingAiPriority: vi.fn(<T>(fn: () => Promise<T>) => fn()),
}));

const fallbackMocks = vi.hoisted(() => ({
  isAiFallbackEnabled: vi.fn().mockResolvedValue(false),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  generateObject: aiMocks.generateObject,
}));

vi.mock("../ai/moderation/provider", () => ({
  tryBuildOllama: providerMocks.tryBuildOllama,
  runWithFallback: vi.fn(),
  generateStructured: vi.fn(),
}));

vi.mock("../ai/ai-priority-gate", () => ({
  withRoutingAiPriority: priorityMocks.withRoutingAiPriority,
}));

vi.mock("../ai/fallback-switch", () => ({
  isAiFallbackEnabled: fallbackMocks.isAiFallbackEnabled,
}));

vi.mock("../routing/routing-metrics", () => ({
  getRoutingCounters: vi.fn().mockReturnValue({
    byEngine: {},
    enginesDown: {},
    successes: 0,
    failures: 0,
    fallbacks: 0,
  }),
  getRecentLatencies: vi.fn().mockReturnValue({ graphhopper: null, valhalla: null }),
  getBboxEngineQuality: vi.fn().mockReturnValue({}),
  bboxKeyOf: vi.fn().mockReturnValue("45.0,10.0"),
}));

// ---------------------------------------------------------------------------
// Import sotto test — dopo i mock
// ---------------------------------------------------------------------------
import { decideEngineWithAI } from "../routing/ai-engine-decider";
import type { AiRoutingContext } from "../routing/ai-engine-decider";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
const FAKE_CTX: AiRoutingContext = {
  style: "curvy",
  area: { centerLat: 45.25, centerLon: 10.25 },
  bboxKey: "45.0,10.0",
  hourOfDay: 10,
  valhallaConfigured: true,
  engineHealth: {
    graphhopper: { success: 10, fallback: 0, failure: 0, down: false },
    valhalla: { success: 10, fallback: 0, failure: 0, down: false },
  },
  recentLatencyMs: { graphhopper: 300, valhalla: 250 },
  bboxQuality: {},
};

const VALID_DECISION_OBJECT = {
  engine: "graphhopper",
  confidence: 0.85,
  reason: "graphhopper ottimale per area curvy",
};

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // withRoutingAiPriority esegue direttamente il callback.
  priorityMocks.withRoutingAiPriority.mockImplementation(<T>(fn: () => Promise<T>) => fn());
  fallbackMocks.isAiFallbackEnabled.mockResolvedValue(false);
});

// ---------------------------------------------------------------------------
// Suite principale: think:false
// ---------------------------------------------------------------------------
describe("decideEngineWithAI — think:false per Ollama", () => {
  it("passa providerOptions: { ollama: { think: false } } a generateObject", async () => {
    providerMocks.tryBuildOllama.mockReturnValue({
      id: "ollama",
      providerName: "ollama",
      modelId: "qwen3:1.7b",
      model: ollamaModel,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    });
    aiMocks.generateObject.mockResolvedValue({ object: VALID_DECISION_OBJECT });

    await decideEngineWithAI(FAKE_CTX, 800, 400);

    expect(aiMocks.generateObject).toHaveBeenCalledTimes(1);
    const callArgs = aiMocks.generateObject.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).toMatchObject({
      providerOptions: { ollama: { think: false } },
    });
  });

  it("ritorna una decisione valida quando Ollama risponde correttamente", async () => {
    providerMocks.tryBuildOllama.mockReturnValue({
      id: "ollama",
      providerName: "ollama",
      modelId: "qwen3:1.7b",
      model: ollamaModel,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    });
    aiMocks.generateObject.mockResolvedValue({ object: VALID_DECISION_OBJECT });

    const decision = await decideEngineWithAI(FAKE_CTX, 800, 400);

    expect(decision).not.toBeNull();
    expect(decision!.engine).toBe("graphhopper");
    expect(decision!.confidence).toBeGreaterThan(0);
    expect(decision!.reason).toBeTruthy();
    expect(decision!.provider).toBe("ollama");
  });

  it("NON chiama cloud chain quando Ollama risponde entro il budget", async () => {
    const { runWithFallback } = await import("../ai/moderation/provider");
    providerMocks.tryBuildOllama.mockReturnValue({
      id: "ollama",
      providerName: "ollama",
      modelId: "qwen3:1.7b",
      model: ollamaModel,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    });
    aiMocks.generateObject.mockResolvedValue({ object: VALID_DECISION_OBJECT });

    await decideEngineWithAI(FAKE_CTX, 800, 400);

    expect(runWithFallback).not.toHaveBeenCalled();
  });

  it("ricade sul deterministico quando generateObject fallisce (think:false non ha aiutato — es. ECONNREFUSED)", async () => {
    providerMocks.tryBuildOllama.mockReturnValue({
      id: "ollama",
      providerName: "ollama",
      modelId: "qwen3:1.7b",
      model: ollamaModel,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    });
    // Simula errore di connessione (Ollama non raggiungibile)
    aiMocks.generateObject.mockRejectedValue(new Error("ECONNREFUSED ollama"));

    // Con fallback cloud disabilitato → deterministico → valhalla (perché valhallaConfigured=true)
    const decision = await decideEngineWithAI(FAKE_CTX, 800, 400);

    expect(decision).not.toBeNull();
    expect(decision!.engine).toBe("valhalla");
    expect(decision!.provider).toBeNull(); // provider=null = fallback deterministico
  });

  it("ricade sul deterministico (null → null) quando Ollama fallisce e valhallaConfigured=false", async () => {
    providerMocks.tryBuildOllama.mockReturnValue({
      id: "ollama",
      providerName: "ollama",
      modelId: "qwen3:1.7b",
      model: ollamaModel,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    });
    aiMocks.generateObject.mockRejectedValue(new Error("connection refused"));

    const ctxNoValhalla: AiRoutingContext = { ...FAKE_CTX, valhallaConfigured: false };
    const decision = await decideEngineWithAI(ctxNoValhalla, 800, 400);

    // deterministicFallback ritorna null se valhallaConfigured=false
    expect(decision).toBeNull();
  });

  it("ritorna null (non chiama generateObject) se Ollama non è configurato e cloud chain è OFF", async () => {
    // Ollama non disponibile
    providerMocks.tryBuildOllama.mockReturnValue(null);
    fallbackMocks.isAiFallbackEnabled.mockResolvedValue(false);

    const decision = await decideEngineWithAI(FAKE_CTX, 800, 400);

    // Nessuna chiamata a generateObject (Ollama assente)
    expect(aiMocks.generateObject).not.toHaveBeenCalled();
    // Ricade sul deterministico
    expect(decision).not.toBeNull();
    expect(decision!.provider).toBeNull();
  });

  it("clampConfidence: confidence fuori range [0,1] viene normalizzata", async () => {
    providerMocks.tryBuildOllama.mockReturnValue({
      id: "ollama",
      providerName: "ollama",
      modelId: "qwen3:1.7b",
      model: ollamaModel,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    });
    // Il modello restituisce confidence > 1 (output anomalo)
    aiMocks.generateObject.mockResolvedValue({
      object: { engine: "valhalla", confidence: 1.5, reason: "test anomalo" },
    });

    const decision = await decideEngineWithAI(FAKE_CTX, 800, 400);

    expect(decision!.confidence).toBe(1); // clampato a 1
  });

  // Task #279 — Smoke verification: la decisione restituita da Ollama con think:false
  // ha tutti i campi richiesti non-null, coerente con il test live su qwen3:1.7b che
  // ha prodotto engine/confidence/reason validi in ~1.9s senza reasoning leak.
  it("decisione Ollama ha engine, confidence e reason non-null (smoke verification Task #279)", async () => {
    providerMocks.tryBuildOllama.mockReturnValue({
      id: "ollama",
      providerName: "ollama",
      modelId: "qwen3:1.7b",
      model: ollamaModel,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    });
    // Risposta che rispecchia l'output live osservato durante la verifica Task #279
    aiMocks.generateObject.mockResolvedValue({
      object: {
        engine: "valhalla",
        confidence: 0.95,
        reason:
          "Valhalla è configurato e ha performance elevate nella zona; stile curvy favorisce Valhalla",
      },
    });

    const decision = await decideEngineWithAI(FAKE_CTX, 800, 400);

    // engine deve essere uno dei due candidati
    expect(["graphhopper", "valhalla"]).toContain(decision!.engine);
    // confidence deve essere nel range [0, 1] e non-null
    expect(decision!.confidence).not.toBeNull();
    expect(decision!.confidence).toBeGreaterThanOrEqual(0);
    expect(decision!.confidence).toBeLessThanOrEqual(1);
    // reason deve essere una stringa non vuota
    expect(typeof decision!.reason).toBe("string");
    expect(decision!.reason.length).toBeGreaterThan(0);
    // provider="ollama" conferma che la risposta viene da Ollama, non dal fallback deterministico
    expect(decision!.provider).toBe("ollama");
  });
});
