/**
 * Task #215 — Guard: `think:true` must be passed to Ollama for both Horus and
 * Bowie in the 1:1 chat path (`runAssistantAgent`).
 *
 * Context:
 *   - Tasks #77 / #122 set `ollamaThinkSeparated = true` (hard-coded) and pass
 *     it via `providerOptions: { ollama: { think: ollamaThinkSeparated } }`
 *     inside `streamWith` whenever `isOllama = true`. Without this flag, qwen3
 *     models (Bowie=1.7b, Horus=4b) dump their chain-of-thought into the
 *     `content` stream, leaking raw English reasoning to end users in regular
 *     conversations.
 *   - Task #128 already guards the group-chat path (group-conversation.ts);
 *     this test guards the 1:1 path (agent.ts).
 *
 * This is a pure-unit test: no ThinkCentre, no DB, no live Ollama required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist stable mock refs before any vi.mock() factory runs
// ---------------------------------------------------------------------------
const streamTextMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks (hoisted; order here doesn't matter — all are hoisted)
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  streamText: streamTextMock,
  isStepCount: vi.fn(() => () => false),
}));

vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

vi.mock("../lib/ollama-client", () => ({
  getOllamaModel: vi.fn(() => ({ __provider: "ollama" })),
  isOllamaConfigured: true,
  warmOllama: vi.fn(),
}));

vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: vi.fn().mockResolvedValue(false),
}));

vi.mock("../ai/assistant/roster", () => ({
  AI_ROSTER: {
    bowie: { name: "Bowie" },
    horus: { name: "Horus" },
    ares: { name: "Ares" },
    // quebracho removed (Task #591)
  },
  createHandoffMarkerFilter: vi.fn(() => ({
    push: (delta: string, sink: (d: string) => void) => sink(delta),
    flush: (_sink: (d: string) => void) => {},
  })),
  stripHandoffMarker: vi.fn((text: string) => ({ text, farewell: false })),
  detectAresJobRequest: vi.fn(() => null),
}));

vi.mock("../ai/ares-jobs", () => ({
  startAresJob: vi.fn(),
  withAresInteractivePriority: vi.fn(async (fn: () => unknown) => fn()),
}));

vi.mock("../ai/assistant/knowledge-gaps", () => ({
  recordKnowledgeGap: vi.fn(),
}));

vi.mock("../ai/assistant/ares-question", () => ({
  composeAresQuestion: vi.fn(async () => "ares question"),
}));

vi.mock("../lib/ares-client", () => ({
  isAresConfigured: false,
  getAresModelId: vi.fn(() => "ares-model"),
  streamAresChat: vi.fn(),
}));

vi.mock("../lib/vram-arbiter", () => ({
  withAresVramPriority: vi.fn(async (_id: string, fn: () => unknown) => fn()),
}));

// quebracho-question and quebracho-client removed (Task #591 — Quebracho unified into Horus)

vi.mock("../ai/assistant/task-review", () => ({
  detectPlanReviewRequest: vi.fn(() => null),
  reviewTaskPlan: vi.fn(),
}));

vi.mock("../ai/assistant/horus-scanner", () => ({
  detectHorusScanRequest: vi.fn(() => null),
  startHorusScan: vi.fn(),
}));

vi.mock("../ai/assistant/rag", () => ({
  retrieveContext: vi.fn(() => []),
  formatRagContext: vi.fn(() => ""),
  indexKnowledge: vi.fn(),
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

vi.mock("../ai/assistant/tc-hub-tools", () => ({
  buildHubFileTools: vi.fn(() => ({})),
  buildCheckVramTool: vi.fn(() => ({})),
}));

vi.mock("../ai/assistant/hub-file-injection", () => ({
  buildHubFileCapabilitiesBlock: vi.fn(() => ""),
  buildHubFileContextForPrompt: vi.fn(async () => ""),
  createSaveDirectiveStreamFilter: vi.fn(() => ({
    push: (delta: string, sink: (d: string) => void) => sink(delta),
    flush: (_sink: (d: string) => void) => [],
  })),
  executeHubFileSaves: vi.fn(async () => []),
}));

vi.mock("../ai/assistant/horus-memory", () => ({
  loadHorusMemory: vi.fn(async () => null),
}));

vi.mock("../ai/nadir", () => ({
  searchNadir: vi.fn(async () => ({ fragments: [], model: "test" })),
  SEARCH_MANUAL_RE: /(?!)/,
}));

vi.mock("@shared/languages", () => ({
  SOURCE_APP_LANGUAGE: "it",
}));

vi.mock("../ai/assistant/tool-calling", () => ({
  selectToolNamesForMessage: vi.fn(() => []),
  buildMissingToolInstruction: vi.fn(() => ""),
  createOllamaOutputGate: vi.fn(() => ({
    push: (delta: string, sink: (d: string) => void) => sink(delta),
    flush: (_sink: (d: string) => void) => ({ mode: "prose" }),
  })),
}));

vi.mock("../ai/assistant/web-search", () => ({
  isWebSearchConfigured: vi.fn(() => false),
}));

vi.mock("../ai/assistant/ares-learning", () => ({
  buildAresLearningContext: vi.fn(async () => ""),
}));

vi.mock("../ai/assistant/horus-analyzer", () => ({
  loadShareableAnalysisKnowledge: vi.fn(async () => []),
}));

vi.mock("../lib/ai-logger", () => ({
  logAiCall: vi.fn(),
}));

vi.mock("@shared/db", () => ({
  aiConversationTurns: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(() => ({ mapWith: vi.fn() })),
}));

vi.mock("../ai/assistant/memory-pruner", () => ({
  pruneUserMemory: vi.fn(async () => {}),
  MEMORY_TURNS_LIMIT: 20,
}));

vi.mock("../ai/assistant/user-context", () => ({
  fetchUserLiveContext: vi.fn(async () => null),
}));

vi.mock("@shared/bowie-greeting", () => ({
  BOWIE_INTRO_POEM: "Bowie poem",
  HORUS_INTRO_POEM: "Horus poem",
  ARES_INTRO_POEM: "Ares poem",
  // QUEBRACHO_INTRO_POEM removed (Task #591)
}));

vi.mock("../ai/assistant/knowledge", () => ({
  buildSystemPrompt: vi.fn(() => "system prompt"),
  buildAdminSystemPrompt: vi.fn(() => "admin system prompt"),
  buildHorusSystemPrompt: vi.fn(() => "horus system prompt"),
  buildAresSystemPrompt: vi.fn(() => "ares system prompt"),
  // buildQuebrachoSystemPrompt removed (Task #591)
}));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: vi.fn(async () => {
    throw new Error("cloud unavailable in unit test");
  }),
  estimateCostUsd: vi.fn(() => 0),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { runAssistantAgent } from "../ai/assistant/agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal AsyncIterable<string> that yields the given chunks.
 * Simulates `streamText(…).textStream`.
 */
function makeTextStream(chunks: string[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next(): Promise<IteratorResult<string>> {
          if (i < chunks.length) return { value: chunks[i++], done: false };
          return { value: "", done: true };
        },
      };
    },
  };
}

/** Minimal opts shared by all test cases. */
function baseOpts(persona: "bowie" | "horus") {
  return {
    message: "Ciao, come stai?",
    platform: "android" as const,
    allowedActions: [],
    persona,
    history: [{ role: "user" as const, content: "messaggio precedente" }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAssistantAgent (1:1 chat) — Ollama providerOptions.ollama.think flag", () => {
  beforeEach(() => {
    streamTextMock.mockReset();
    // Default: healthy one-chunk stream so the function can complete.
    streamTextMock.mockReturnValue({
      textStream: makeTextStream(["Risposta di test."]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    });
  });

  // ── Horus ───────────────────────────────────────────────────────────────

  it("passa think:true a Ollama per persona=horus", async () => {
    await runAssistantAgent(baseOpts("horus"));

    expect(streamTextMock).toHaveBeenCalled();
    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    expect(providerOptions?.ollama).toMatchObject({ think: true });
  });

  it("think non è false né assente nella chiamata a Ollama per horus", async () => {
    await runAssistantAgent(baseOpts("horus"));

    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    const ollamaOpts = providerOptions?.ollama as Record<string, unknown> | undefined;

    // Must be explicitly true, NOT undefined / null / false.
    expect(ollamaOpts?.think).toBe(true);
  });

  // ── Bowie ────────────────────────────────────────────────────────────────

  it("passa think:true a Ollama per persona=bowie", async () => {
    await runAssistantAgent(baseOpts("bowie"));

    expect(streamTextMock).toHaveBeenCalled();
    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    expect(providerOptions?.ollama).toMatchObject({ think: true });
  });

  it("think non è false né assente nella chiamata a Ollama per bowie", async () => {
    await runAssistantAgent(baseOpts("bowie"));

    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    const ollamaOpts = providerOptions?.ollama as Record<string, unknown> | undefined;

    // Must be explicitly true, NOT undefined / null / false.
    expect(ollamaOpts?.think).toBe(true);
  });

  // ── Both personas share the same flag constant ────────────────────────────

  it("Horus e Bowie usano entrambi think:true (stessa costante ollamaThinkSeparated)", async () => {
    const results: Array<boolean | undefined> = [];

    for (const persona of ["horus", "bowie"] as const) {
      streamTextMock.mockReset();
      streamTextMock.mockReturnValue({
        textStream: makeTextStream(["ok"]),
        usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      });
      await runAssistantAgent(baseOpts(persona));
      const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
      const po = callArgs.providerOptions as Record<string, unknown> | undefined;
      const ollamaOpts = po?.ollama as Record<string, unknown> | undefined;
      results.push(ollamaOpts?.think as boolean | undefined);
    }

    expect(results).toEqual([true, true]);
  });
});
