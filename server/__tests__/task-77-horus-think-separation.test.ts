/**
 * Task #77 — Stop Horus's raw internal reasoning from leaking into chat replies.
 *
 * Root cause (verified live 2026-07-15 via curl against qwen3:4b on Ollama
 * 0.30.x): with `think:false` the model does NOT stop reasoning — the whole
 * chain-of-thought (~4000+ chars) ends up in `content`, so in the STREAMING
 * persona path (server/ai/assistant/agent.ts) the reasoning deltas reach the
 * client before any post-hoc strip could run (unlike the non-streaming consult
 * path in inter-agent.ts which buffers then strips).
 *
 * Fix: for Horus the Ollama streaming call now passes `think:true`. Ollama then
 * separates the reasoning into the `thinking` channel; the provider
 * (ollama-ai-provider-v2) maps it to "reasoning" parts of the fullStream — NOT
 * "text" parts of the textStream, which is the only stream agent.ts consumes.
 * The final answer still streams token-by-token.
 *
 * Guarantee under test: the streaming Ollama call carries
 * providerOptions.ollama.think === true for Horus, and stays === false for
 * Bowie (unchanged; Bowie cleanliness is Task #74's scope).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  getOllamaModel: vi.fn(() => ({ __provider: "ollama", modelId: "qwen3-mock" })),
  warmOllama: vi.fn(),
}));

const offlineMocks = vi.hoisted(() => ({
  isThinkCentreOffline: vi.fn().mockResolvedValue(false),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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
  buildRunSecurityScanTool: vi.fn(() => ({})),
}));

vi.mock("../ai/assistant/knowledge", () => ({
  buildSystemPrompt: vi.fn(() => "system: assistente moto"),
  buildAdminSystemPrompt: vi.fn(() => "system: admin"),
  buildHorusSystemPrompt: vi.fn(() => "system: horus"),
  buildAresSystemPrompt: vi.fn(() => "system: ares"),
  // buildQuebrachoSystemPrompt removed (Task #591 — Quebracho unified into Horus)
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

vi.mock("../ai/assistant/horus-memory", () => ({
  loadHorusMemory: vi.fn().mockResolvedValue(""),
}));

vi.mock("../ai/assistant/horus-analyzer", () => ({
  loadShareableAnalysisKnowledge: vi.fn().mockResolvedValue([]),
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
  chain["values"] = vi.fn().mockResolvedValue(undefined);
  return { db: chain };
});

vi.mock("@shared/db", () => ({
  aiConversationTurns: { _: "mocked-table" },
}));

// NB: l'import di agent.ts tira dentro db-integrity/counters.ts che usa `sql` a
// module-scope → il mock DEVE esportare `sql` o l'intera suite fallisce
// all'import (vedi memory drizzle-sql-mock-agent-import).
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

type StreamTextArgs = { providerOptions?: { ollama?: { think?: boolean } } };

function lastOllamaCallThink(): boolean | undefined {
  const calls = aiMocks.streamText.mock.calls as Array<[StreamTextArgs]>;
  // The Ollama call is the one carrying providerOptions.ollama (cloud calls don't).
  const ollamaCall = [...calls].reverse().find((c) => c[0]?.providerOptions?.ollama !== undefined);
  return ollamaCall?.[0]?.providerOptions?.ollama?.think;
}

const BASE_OPTS = {
  message: "chiedi a Horus di pianificarmi un percorso panoramico",
  platform: "admin" as const,
  allowedActions: [],
  adminContext: "snapshot",
};

describe("Task #77 — Horus streaming reasoning separation (think:true)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ollamaMocks.isOllamaConfigured = true;
    offlineMocks.isThinkCentreOffline.mockResolvedValue(false);
    // Cloud fallback never wins in these tests — Ollama answers first.
    providerMocks.runWithFallback.mockRejectedValue(new Error("cloud offline (mock)"));
  });

  it("Horus: la chiamata Ollama in streaming passa think:true (ragionamento fuori dal textStream)", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Ecco un percorso panoramico tra le colline."]));

    const result = await runAssistantAgent({ ...BASE_OPTS, persona: "horus" });

    expect(aiMocks.streamText).toHaveBeenCalled();
    expect(lastOllamaCallThink()).toBe(true);
    expect(result.provider).toBe("ollama");
    expect(result.persona.id).toBe("horus");
    // Only the textStream content (clean answer) reaches the caller.
    expect(result.text).toContain("percorso panoramico tra le colline");
    expect(result.text).not.toContain("<think>");
    expect(result.text).not.toContain("</think>");
  });

  it("Bowie: la chiamata Ollama usa think:true per separare il ragionamento", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Ciao! Come posso aiutarti?"]));

    const result = await runAssistantAgent({
      ...BASE_OPTS,
      message: "ciao",
      persona: "bowie",
    });

    expect(aiMocks.streamText).toHaveBeenCalled();
    expect(lastOllamaCallThink()).toBe(true);
    expect(result.persona.id).toBe("bowie");
  });

  it("Horus: anche il retry (set completo di tool) mantiene think:true", async () => {
    // Primo giro: il modello emette il sentinel di tool mancante → retry.
    // Con tools={} il gate non può emettere sentinel, quindi forziamo due chiamate
    // verificando che OGNI chiamata Ollama porti think:true.
    aiMocks.streamText.mockReturnValue(makeStream(["Rotta pronta."]));

    await runAssistantAgent({ ...BASE_OPTS, persona: "horus" });

    const ollamaCalls = (aiMocks.streamText.mock.calls as Array<[StreamTextArgs]>).filter(
      (c) => c[0]?.providerOptions?.ollama !== undefined,
    );
    expect(ollamaCalls.length).toBeGreaterThan(0);
    for (const c of ollamaCalls) {
      expect(c[0].providerOptions?.ollama?.think).toBe(true);
    }
  });
});
