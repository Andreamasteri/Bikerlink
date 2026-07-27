/**
 * Task #141 — Stop Horus from making users wait 60 seconds before seeing any reply.
 *
 * Root cause: with think:true, qwen3 (Horus 4b / Bowie 1.7b) reasons for ~45–60s
 * BEFORE emitting any `text-delta`. agent.ts consumed only `result.textStream`, so
 * the client saw an empty stream for the whole reasoning phase (blank-screen wait).
 *
 * Fix: streamWith() now consumes `result.fullStream`, and on the FIRST
 * `reasoning-delta` (before any text) fires `onThinking()` exactly once. The route
 * forwards it as a lightweight "thinking" SSE event so the client can show a
 * "sta pensando…" indicator within <2s, without changing text accumulation.
 *
 * Guarantees under test:
 *  - onThinking fires (once) before the first onTextDelta when reasoning precedes text.
 *  - text-delta parts still accumulate into the final answer unchanged.
 *  - a stream that never reasons (no reasoning-delta) never calls onThinking.
 *  - a mock that exposes only textStream (no fullStream) still works (fallback path).
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
  // buildQuebrachoSystemPrompt removed (Task #591)
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
// module-scope → il mock DEVE esportare `sql` (vedi memory drizzle-sql-mock-agent-import).
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
// Helpers — mock streamText results with a fullStream (reasoning + text parts).
// ---------------------------------------------------------------------------

type StreamPart =
  | { type: "reasoning-delta"; text: string }
  | { type: "text-delta"; text: string }
  | { type: "error"; error: unknown }
  | { type: "abort" }
  | { type: string };

function makeFullStream(
  parts: StreamPart[],
  usage: { inputTokens: number; outputTokens: number } = { inputTokens: 10, outputTokens: 10 },
) {
  return {
    fullStream: (async function* () {
      for (const p of parts) yield p;
    })(),
    // textStream is still exposed by the real SDK; we don't consume it when
    // fullStream is present, but include a compatible one for completeness.
    textStream: (async function* () {
      for (const p of parts) if (p.type === "text-delta") yield (p as { text: string }).text;
    })(),
    usage: Promise.resolve(usage),
  };
}

// Legacy shape (textStream only) — exercises the fallback path.
function makeTextOnlyStream(
  chunks: string[],
  usage: { inputTokens: number; outputTokens: number } = { inputTokens: 10, outputTokens: 10 },
) {
  return {
    textStream: (async function* () {
      for (const c of chunks) yield c;
    })(),
    usage: Promise.resolve(usage),
  };
}

const BASE_OPTS = {
  message: "chiedi a Horus di pianificarmi un percorso panoramico",
  platform: "admin" as const,
  allowedActions: [],
  adminContext: "snapshot",
};

describe("Task #141 — thinking indicator (onThinking before first text-delta)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ollamaMocks.isOllamaConfigured = true;
    offlineMocks.isThinkCentreOffline.mockResolvedValue(false);
    // Cloud fallback never wins — Ollama answers first.
    providerMocks.runWithFallback.mockRejectedValue(new Error("cloud offline (mock)"));
  });

  it("fires onThinking exactly once, BEFORE the first text delta, when reasoning precedes text", async () => {
    aiMocks.streamText.mockReturnValue(
      makeFullStream([
        { type: "reasoning-delta", text: "Sto valutando le colline..." },
        { type: "reasoning-delta", text: " e i tornanti..." },
        { type: "text-delta", text: "Ecco un percorso panoramico" },
        { type: "text-delta", text: " tra le colline." },
      ]),
    );

    const order: string[] = [];
    const onThinking = vi.fn(() => order.push("thinking"));
    const onTextDelta = vi.fn(() => order.push("delta"));

    const result = await runAssistantAgent({
      ...BASE_OPTS,
      persona: "horus",
      onThinking,
      onTextDelta,
    });

    // Signalled once, and strictly before any visible text.
    expect(onThinking).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("thinking");
    expect(order.indexOf("thinking")).toBeLessThan(order.indexOf("delta"));

    // Text accumulates from text-delta parts; reasoning never leaks into it.
    expect(result.text).toContain("Ecco un percorso panoramico tra le colline.");
    expect(result.text).not.toContain("colline...");
    expect(result.text).not.toContain("tornanti");
    expect(result.provider).toBe("ollama");
  });

  it("never fires onThinking when the stream produces no reasoning parts", async () => {
    aiMocks.streamText.mockReturnValue(
      makeFullStream([
        { type: "text-delta", text: "Risposta diretta senza ragionamento." },
      ]),
    );

    const onThinking = vi.fn();
    const result = await runAssistantAgent({
      ...BASE_OPTS,
      message: "ciao",
      persona: "bowie",
      onThinking,
    });

    expect(onThinking).not.toHaveBeenCalled();
    expect(result.text).toContain("Risposta diretta senza ragionamento.");
  });

  it("falls back to textStream (and skips onThinking) for providers without a fullStream", async () => {
    aiMocks.streamText.mockReturnValue(makeTextOnlyStream(["Ciao! Come posso aiutarti?"]));

    const onThinking = vi.fn();
    const result = await runAssistantAgent({
      ...BASE_OPTS,
      message: "ciao",
      persona: "bowie",
      onThinking,
    });

    expect(onThinking).not.toHaveBeenCalled();
    expect(result.text).toContain("Come posso aiutarti?");
  });

  it("re-throws a fullStream `error` part so the fallback chain still triggers", async () => {
    // First (Ollama) attempt: error part with no text yet → must throw → cloud is
    // tried. Cloud is mocked to reject → degraded warning, but crucially the
    // error part did NOT silently complete as an empty success.
    aiMocks.streamText.mockReturnValue(
      makeFullStream([{ type: "error", error: new Error("ollama exploded mid-stream") }]),
    );

    const result = await runAssistantAgent({
      ...BASE_OPTS,
      message: "ciao",
      persona: "bowie",
    });

    // No usable content came through → agent degrades with the standard warning.
    expect(result.degraded).toBe(true);
    expect(result.text).toContain("⚠️");
  });
});
