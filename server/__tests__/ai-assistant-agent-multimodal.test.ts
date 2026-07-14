/**
 * Task #5333 — Guard the multimodal (vision) path of the AI Assistant agent.
 *
 * When images are attached to a message (already resolved to base64 by the
 * route via resolveAssistantImageBuffer):
 *  - Ollama (not multimodal) MUST be skipped entirely — no wasted attempt.
 *  - The cloud vision chain (runWithFallback) is attempted with the image parts.
 *  - If the cloud vision chain fails and no vision provider is available, the
 *    agent MUST still fall back to a text-only Ollama reply (ignoring the
 *    images) rather than failing the whole turn silently.
 *  - If Ollama is also unavailable at that point, the agent degrades
 *    gracefully with a user-facing ⚠️ message instead of throwing.
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
  getOllamaModel: vi.fn(() => ({ __provider: "ollama", modelId: "mistral-nemo:latest" })),
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

vi.mock("../lib/ares-client", () => ({
  isAresConfigured: false,
  getAresModelId: vi.fn(() => "ares-mock"),
  streamAresChat: vi.fn(),
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

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => `eq(${String(a)},${String(b)})`),
  desc: vi.fn((a: unknown) => `desc(${String(a)})`),
}));

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
  usage: { inputTokens: number; outputTokens: number } = { inputTokens: 50, outputTokens: 100 },
) {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    usage: Promise.resolve(usage),
  };
}

const IMAGE_OPTS = {
  message: "Cos'è questo rumore nel motore?",
  platform: "android" as const,
  allowedActions: [],
  userId: "user-test-123",
  images: [{ base64: "ZmFrZS1pbWFnZS1ieXRlcw==", mediaType: "image/png" }],
};

describe("runAssistantAgent — multimodal (vision) path", () => {
  beforeEach(() => {
    aiMocks.streamText.mockReset();
    aiMocks.isStepCount.mockClear();
    providerMocks.runWithFallback.mockReset();
    ollamaMocks.getOllamaModel.mockClear();
    ollamaMocks.warmOllama.mockClear();
    offlineMocks.isThinkCentreOffline.mockReset();
    offlineMocks.isThinkCentreOffline.mockResolvedValue(false);
  });

  it("skips Ollama entirely and goes straight to the cloud vision chain when images are present", async () => {
    providerMocks.runWithFallback.mockImplementation(
      async (
        _opts: unknown,
        fn: (m: { model: unknown; scheduler: (cb: () => Promise<void>) => Promise<void> }) => Promise<void>,
      ) => {
        await fn({
          model: { __provider: "gemini" },
          scheduler: async (cb: () => Promise<void>) => cb(),
        });
        return { model: { providerName: "gemini", modelId: "gemini-1.5-flash" } };
      },
    );
    aiMocks.streamText.mockReturnValue(
      makeStream(["Sembra un rumore da catena di distribuzione."]),
    );

    const result = await runAssistantAgent(IMAGE_OPTS);

    // Ollama must never be attempted (not multimodal) when images are present.
    expect(ollamaMocks.getOllamaModel).not.toHaveBeenCalled();
    expect(ollamaMocks.warmOllama).not.toHaveBeenCalled();

    expect(providerMocks.runWithFallback).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("gemini");
    expect(result.text).toContain("catena di distribuzione");
    expect(result.degraded).toBe(false);
  });

  it("passes the image parts to streamText's messages when using the cloud vision chain", async () => {
    providerMocks.runWithFallback.mockImplementation(
      async (
        _opts: unknown,
        fn: (m: { model: unknown; scheduler: (cb: () => Promise<void>) => Promise<void> }) => Promise<void>,
      ) => {
        await fn({
          model: { __provider: "gemini" },
          scheduler: async (cb: () => Promise<void>) => cb(),
        });
        return { model: { providerName: "gemini", modelId: "gemini-1.5-flash" } };
      },
    );
    aiMocks.streamText.mockReturnValue(makeStream(["Vedo la foto."]));

    await runAssistantAgent(IMAGE_OPTS);

    expect(aiMocks.streamText).toHaveBeenCalledTimes(1);
    const callArgs = aiMocks.streamText.mock.calls[0][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const lastMsg = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMsg.role).toBe("user");
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const parts = lastMsg.content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === "text")).toBe(true);
    expect(parts.some((p) => p.type === "image")).toBe(true);
  });

  it("falls back to a text-only Ollama reply when the cloud vision chain fails and Ollama is reachable", async () => {
    providerMocks.runWithFallback.mockRejectedValue(
      new Error("nessun provider vision cloud disponibile (mock)"),
    );
    aiMocks.streamText.mockReturnValue(
      makeStream(["Non vedo l'immagine ma provo ad aiutarti col testo."]),
    );

    const result = await runAssistantAgent(IMAGE_OPTS);

    // The text-only Ollama fallback must have been attempted.
    expect(ollamaMocks.getOllamaModel).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("ollama");
    expect(result.degraded).toBe(false);
    expect(result.text).toContain("Non vedo l'immagine ma provo ad aiutarti col testo");
    // The user must be warned that the images themselves weren't analyzed.
    expect(result.text).toMatch(/non riesco ad analizzare le immagini/i);

    // The text-only fallback must NOT include the image parts (Ollama isn't multimodal).
    const lastCall = aiMocks.streamText.mock.calls[aiMocks.streamText.mock.calls.length - 1][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const lastMsg = lastCall.messages[lastCall.messages.length - 1];
    expect(typeof lastMsg.content).toBe("string");
  });

  it("degrades gracefully (no crash) when BOTH cloud vision and the Ollama text fallback fail", async () => {
    providerMocks.runWithFallback.mockRejectedValue(new Error("cloud offline (mock)"));
    aiMocks.streamText.mockImplementation(() => {
      throw new Error("ollama connection refused (mock)");
    });

    const result = await runAssistantAgent(IMAGE_OPTS);

    expect(result.degraded).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).toContain("⚠️");
  });

  it("skips the Ollama text-only fallback (and just degrades) when the ThinkCentre is known offline", async () => {
    providerMocks.runWithFallback.mockRejectedValue(new Error("cloud offline (mock)"));
    offlineMocks.isThinkCentreOffline.mockResolvedValue(true);

    const result = await runAssistantAgent(IMAGE_OPTS);

    expect(ollamaMocks.getOllamaModel).not.toHaveBeenCalled();
    expect(result.degraded).toBe(true);
    expect(result.text).toContain("⚠️");
  });
});
