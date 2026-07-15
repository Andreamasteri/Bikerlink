/**
 * Task #5338 — Regression coverage for the personaFirstTurn-driven intro-poem
 * logic in server/ai/assistant/agent.ts.
 *
 * Guarantee under test: each persona's intro poem (Bowie/Horus/Ares) is
 * emitted to the client ONLY on the true first turn of that persona, is
 * NEVER persisted to ai_conversation_turns, and is NEVER counted towards
 * providerEmittedAny (the flag that gates fallback-provider retries).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BOWIE_INTRO_POEM, HORUS_INTRO_POEM, ARES_INTRO_POEM } from "@shared/bowie-greeting";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  isStepCount: vi.fn(() => "step-count-is-3-sentinel"),
}));

const providerMocks = vi.hoisted(() => ({
  runWithFallback: vi.fn(),
  estimateCostUsd: vi.fn(() => 0),
}));

const ollamaMocks = vi.hoisted(() => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __provider: "ollama", modelId: "mistral-nemo:latest" })),
  warmOllama: vi.fn(),
}));

const offlineMocks = vi.hoisted(() => ({
  isThinkCentreOffline: vi.fn().mockResolvedValue(false),
}));

const aresMocks = vi.hoisted(() => ({
  isAresConfigured: true,
  getAresModelId: vi.fn(() => "ares-mock-model"),
  streamAresChat: vi.fn(),
  composeAresQuestion: vi.fn().mockResolvedValue("Domanda sintetizzata per Ares."),
}));

const dbInsertValues = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  streamText: aiMocks.streamText,
  isStepCount: aiMocks.isStepCount,
}));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: providerMocks.runWithFallback,
  estimateCostUsd: providerMocks.estimateCostUsd,
}));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: ollamaMocks.isOllamaConfigured,
  getOllamaModel: ollamaMocks.getOllamaModel,
  warmOllama: ollamaMocks.warmOllama,
  isOllamaReachable: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: offlineMocks.isThinkCentreOffline,
}));

vi.mock("../ai/assistant/tools", () => ({
  OLLAMA_TOOLS: {},
  HORUS_TOOLS: {},
  buildBowieInterAgentTools: vi.fn(() => ({})),
  buildRememberNoteTool: vi.fn(() => ({})),
  buildReviewTaskPlanTool: vi.fn(() => ({})),
  buildSearchManualTool: vi.fn(() => ({})),
}));

vi.mock("../ai/assistant/knowledge", () => ({
  buildSystemPrompt: vi.fn(() => "system: assistente moto"),
  buildAdminSystemPrompt: vi.fn(() => "system: admin"),
  buildHorusSystemPrompt: vi.fn(() => "system: horus"),
  buildAresSystemPrompt: vi.fn(() => "system: ares"),
}));

vi.mock("../ai/assistant/rag", () => ({
  retrieveContext: vi.fn(() => []),
  formatRagContext: vi.fn(() => ""),
  indexKnowledge: vi.fn(),
}));

vi.mock("../ai/assistant/user-context", () => ({
  fetchUserLiveContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("../ai/assistant/knowledge-gaps", () => ({
  recordKnowledgeGap: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/assistant/ares-question", () => ({
  composeAresQuestion: aresMocks.composeAresQuestion,
}));

vi.mock("../lib/ares-client", () => ({
  get isAresConfigured() {
    return aresMocks.isAresConfigured;
  },
  getAresModelId: aresMocks.getAresModelId,
  streamAresChat: aresMocks.streamAresChat,
}));

vi.mock("../lib/ai-logger", () => ({
  logAiCall: vi.fn(),
}));

vi.mock("../db", () => {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "from", "where", "orderBy", "insert"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain["limit"] = vi.fn().mockResolvedValue([]);
  chain["values"] = dbInsertValues;
  return { db: chain };
});

vi.mock("@shared/db", () => ({
  aiConversationTurns: { _: "mocked-table" },
}));

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

// ---------------------------------------------------------------------------
// Import under test — after all mocks
// ---------------------------------------------------------------------------

import { runAssistantAgent } from "../ai/assistant/agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStream(
  chunks: string[],
  usage: { inputTokens: number; outputTokens: number } = { inputTokens: 10, outputTokens: 10 },
) {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    usage: Promise.resolve(usage),
  };
}

const BASE_OPTS = {
  message: "ciao",
  platform: "android" as const,
  allowedActions: [],
  userId: "user-test-poem",
};

describe("runAssistantAgent — intro poem emission (Task #5338)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ollamaMocks.isOllamaConfigured = true;
    offlineMocks.isThinkCentreOffline.mockResolvedValue(false);
    aresMocks.isAresConfigured = true;
    aresMocks.composeAresQuestion.mockResolvedValue("Domanda sintetizzata per Ares.");
    dbInsertValues.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Bowie — nessuna history precedente = prima apertura.
  // -------------------------------------------------------------------------

  it("Bowie: prima apertura (history vuota) → poesia in testa alla risposta", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Ciao! Come posso aiutarti?"]));

    const result = await runAssistantAgent({ ...BASE_OPTS, persona: "bowie", history: [] });

    expect(result.text.startsWith(BOWIE_INTRO_POEM)).toBe(true);
    expect(result.text).toContain("Ciao! Come posso aiutarti?");
  });

  it("Bowie: history NON vuota → nessuna poesia, anche senza personaFirstTurn esplicito", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Bentornato!"]));

    const result = await runAssistantAgent({
      ...BASE_OPTS,
      persona: "bowie",
      history: [{ role: "user", content: "ciao" }, { role: "assistant", content: "ciao!" }],
    });

    expect(result.text).not.toContain(BOWIE_INTRO_POEM);
    expect(result.text.trim()).toBe("Bentornato!");
  });

  it("Bowie: la poesia NON viene persistita nella memoria conversazionale (solo aiText)", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Risposta reale del modello."]));

    await runAssistantAgent({ ...BASE_OPTS, persona: "bowie", history: [] });

    // saveTurns è fire-and-forget: attendiamo il flush dei microtask.
    await new Promise((r) => setTimeout(r, 0));

    expect(dbInsertValues).toHaveBeenCalledTimes(1);
    const savedRows = dbInsertValues.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const savedAssistantMsg = savedRows.find((r) => r.role === "assistant")?.content;
    expect(savedAssistantMsg).toBe("Risposta reale del modello.");
    expect(savedAssistantMsg).not.toContain(BOWIE_INTRO_POEM);
  });

  it("Bowie: se il provider non emette alcun delta reale, la poesia non è mai emessa (differita al primo delta)", async () => {
    // Provider Ollama fallisce a ZERO delta, e la chain cloud fallisce pure → degraded.
    aiMocks.streamText.mockImplementation(() => {
      throw new Error("ollama irraggiungibile");
    });
    providerMocks.runWithFallback.mockRejectedValue(new Error("cloud offline"));

    const result = await runAssistantAgent({ ...BASE_OPTS, persona: "bowie", history: [] });

    expect(result.degraded).toBe(true);
    expect(result.text).not.toContain(BOWIE_INTRO_POEM);
    expect(result.text).toContain("⚠️");
  });

  // -------------------------------------------------------------------------
  // Horus — personaFirstTurn deciso a monte dal route, non dalla history.
  // -------------------------------------------------------------------------

  it("Horus: personaFirstTurn=true → poesia di Horus emessa una sola volta in testa", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Ecco il percorso che cercavi."]));

    const result = await runAssistantAgent({
      ...BASE_OPTS,
      persona: "horus",
      personaFirstTurn: true,
      history: [{ role: "user", content: "ciao" }, { role: "assistant", content: "ciao!" }],
    });

    expect(result.text.startsWith(HORUS_INTRO_POEM)).toBe(true);
    // La poesia compare esattamente una volta.
    expect(result.text.split(HORUS_INTRO_POEM)).toHaveLength(2);
  });

  it("Horus: personaFirstTurn=false (già presentato in precedenza) → nessuna poesia ripetuta", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Continuo con il percorso."]));

    const result = await runAssistantAgent({
      ...BASE_OPTS,
      persona: "horus",
      personaFirstTurn: false,
      history: [{ role: "user", content: "un percorso panoramico" }],
    });

    expect(result.text).not.toContain(HORUS_INTRO_POEM);
  });

  it("Horus: personaFirstTurn omesso (undefined) → trattato come non-primo-turno, nessuna poesia", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Risposta di Horus."]));

    const result = await runAssistantAgent({
      ...BASE_OPTS,
      persona: "horus",
      history: [],
    });

    expect(result.text).not.toContain(HORUS_INTRO_POEM);
  });

  it("Horus: la poesia non viene salvata nella memoria conversazionale", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Ecco la tua rotta."]));

    await runAssistantAgent({
      ...BASE_OPTS,
      persona: "horus",
      personaFirstTurn: true,
      history: [{ role: "user", content: "ciao" }],
    });
    await new Promise((r) => setTimeout(r, 0));

    const savedRows = dbInsertValues.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const savedAssistantMsg = savedRows.find((r) => r.role === "assistant")?.content;
    expect(savedAssistantMsg).toBe("Ecco la tua rotta.");
    expect(savedAssistantMsg).not.toContain(HORUS_INTRO_POEM);
  });

  // -------------------------------------------------------------------------
  // Ares — solo admin, endpoint dedicato (streamAresChat), stesso pattern.
  // -------------------------------------------------------------------------

  const ADMIN_OPTS = { ...BASE_OPTS, platform: "admin" as const, adminContext: "snapshot" };

  it("Ares: personaFirstTurn=true (admin) → poesia di Ares emessa una sola volta", async () => {
    aresMocks.streamAresChat.mockImplementation(
      async (opts: { onDelta: (d: string) => void }) => {
        opts.onDelta("Diagnosi completata: tutto operativo.");
        return { text: "Diagnosi completata: tutto operativo." };
      },
    );

    const result = await runAssistantAgent({
      ...ADMIN_OPTS,
      persona: "ares",
      personaFirstTurn: true,
      history: [{ role: "user", content: "ciao Bowie" }],
    });

    expect(result.text.startsWith(ARES_INTRO_POEM)).toBe(true);
    expect(result.text.split(ARES_INTRO_POEM)).toHaveLength(2);
    expect(result.persona.id).toBe("ares");
  });

  it("Ares: personaFirstTurn=false → nessuna poesia ripetuta sui turni successivi", async () => {
    aresMocks.streamAresChat.mockImplementation(
      async (opts: { onDelta: (d: string) => void }) => {
        opts.onDelta("Ancora io, Ares.");
        return { text: "Ancora io, Ares." };
      },
    );

    const result = await runAssistantAgent({
      ...ADMIN_OPTS,
      persona: "ares",
      personaFirstTurn: false,
      history: [{ role: "user", content: "ciao" }],
    });

    expect(result.text).not.toContain(ARES_INTRO_POEM);
  });

  it("Ares: la poesia non conta come delta AI reale — Ares offline con personaFirstTurn=true non emette la poesia (fallback a Bowie prima di qualunque delta)", async () => {
    aresMocks.isAresConfigured = false;

    const result = await runAssistantAgent({
      ...ADMIN_OPTS,
      persona: "ares",
      personaFirstTurn: true,
      history: [{ role: "user", content: "chiama Ares" }],
    });

    expect(result.persona.id).toBe("bowie");
    expect(result.text).not.toContain(ARES_INTRO_POEM);
    expect(result.text).toContain("Ares");
  });
});
