import { describe, it, expect, vi, beforeEach } from "vitest";

// Task #7 (#12) — Guardia fallback cloud legata ai tool.
//
// Se il turno RICHIEDE tool (selezione contestuale non vuota) ma Ollama/
// ThinkCentre è irraggiungibile, l'agente NON deve ripiegare sul cloud (che gira
// SENZA tool → risposta plausibile ma priva dei dati reali): degrada con un
// messaggio esplicito. Il fallback cloud resta valido per i turni puramente
// conversazionali.

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  isStepCount: vi.fn(() => "step-count-3"),
}));

const providerMocks = vi.hoisted(() => ({
  runWithFallback: vi.fn(),
  estimateCostUsd: vi.fn(() => 0),
}));

const tcOffline = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  streamText: aiMocks.streamText,
  isStepCount: aiMocks.isStepCount,
  tool: vi.fn((definition) => definition),
}));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: providerMocks.runWithFallback,
  estimateCostUsd: providerMocks.estimateCostUsd,
}));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __provider: "ollama", modelId: "llama3.2:3b" })),
  isOllamaReachable: vi.fn().mockResolvedValue(true),
  warmOllama: vi.fn(),
}));

// ThinkCentre SEMPRE offline in questi test → Ollama viene saltato.
vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: tcOffline,
  resetThinkCentreOfflineCache: vi.fn(),
}));

vi.mock("../ai/assistant/tools", () => ({
  OLLAMA_TOOLS: {
    getBikerStats: { description: "stats", inputSchema: {}, execute: vi.fn() },
    getUserPlannedRoutes: { description: "routes", inputSchema: {}, execute: vi.fn() },
  },
  HORUS_TOOLS: {},
  buildBowieInterAgentTools: vi.fn(() => ({})),
  buildRememberNoteTool: vi.fn(() => ({})),
  buildReviewTaskPlanTool: vi.fn(() => ({})),
  buildSearchManualTool: vi.fn(() => ({})),
  buildRunSecurityScanTool: vi.fn(() => ({})),
}));

vi.mock("../ai/assistant/knowledge", () => ({
  buildSystemPrompt: vi.fn(() => "system: assistente moto"),
  buildAdminSystemPrompt: vi.fn(() => "system: admin"),
}));

vi.mock("../ai/assistant/rag", () => ({
  retrieveContext: vi.fn(() => []),
  formatRagContext: vi.fn(() => ""),
  indexKnowledge: vi.fn(),
}));

vi.mock("../lib/ai-logger", () => ({ logAiCall: vi.fn() }));

vi.mock("../db", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "insert"]) chain[m] = vi.fn(() => chain);
  chain["limit"] = vi.fn().mockResolvedValue([]);
  chain["values"] = vi.fn().mockResolvedValue(undefined);
  return { db: chain };
});

vi.mock("@shared/db", () => ({ aiConversationTurns: { _: "mocked-table" } }));

vi.mock("drizzle-orm", () => {
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: strings, values }));
  (sql as unknown as { raw: unknown }).raw = vi.fn((s: string) => ({ __rawSql: s }));
  return {
    eq: vi.fn((a: unknown, b: unknown) => `eq(${String(a)},${String(b)})`),
    desc: vi.fn((a: unknown) => `desc(${String(a)})`),
    sql,
  };
});

vi.mock("../ai/assistant/memory-pruner", () => ({
  pruneUserMemory: vi.fn().mockResolvedValue(undefined),
  MEMORY_TURNS_LIMIT: 10,
}));

import { runAssistantAgent } from "../ai/assistant/agent";

function makeStream(chunks: string[]) {
  return {
    textStream: (async function* () {
      for (const c of chunks) yield c;
    })(),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
  };
}

describe("Task #7 (#12) — guardia fallback cloud legata ai tool", () => {
  beforeEach(() => {
    aiMocks.streamText.mockReset();
    providerMocks.runWithFallback.mockReset();
    tcOffline.mockReset();
    tcOffline.mockResolvedValue(true); // ThinkCentre offline
  });

  it("turno che richiede tool + Ollama offline → NIENTE cloud, degrada con ⚠️", async () => {
    const result = await runAssistantAgent({
      message: "Quante strade ho percorso quest'anno?",
      platform: "android",
      allowedActions: [],
      userId: "user-test-123",
    });

    // Il fallback cloud (senza tool) NON deve essere tentato.
    expect(providerMocks.runWithFallback).not.toHaveBeenCalled();
    // Ollama era offline → nessuna chiamata streamText.
    expect(aiMocks.streamText).not.toHaveBeenCalled();

    expect(result.degraded).toBe(true);
    expect(result.text).toContain("⚠️");
  });

  it("turno conversazionale (nessun tool) + Ollama offline → cloud consentito", async () => {
    providerMocks.runWithFallback.mockImplementation(
      async (_cfg: unknown, cb: (m: unknown) => Promise<void>) => {
        await cb({
          model: { __provider: "groq", modelId: "llama-cloud" },
          scheduler: (fn: () => Promise<void>) => fn(),
        });
        return { model: { providerName: "groq", modelId: "llama-cloud" } };
      },
    );
    aiMocks.streamText.mockReturnValue(makeStream(["Ciao! ", "Tutto bene, grazie."]));

    const result = await runAssistantAgent({
      message: "Ciao, come stai oggi?",
      platform: "android",
      allowedActions: [],
      userId: "user-test-123",
    });

    // Nessun tool selezionato → il fallback cloud è legittimo.
    expect(providerMocks.runWithFallback).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("groq");
    expect(result.degraded).toBe(false);
    expect(result.text).toContain("Ciao!");
    // Il cloud gira senza tool.
    const cloudCall = aiMocks.streamText.mock.calls[0][0] as { tools?: unknown };
    expect(cloudCall.tools).toBeUndefined();
  });
});
