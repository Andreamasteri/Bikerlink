/**
 * Task #171 — Confirm Ares sees the correct pre-fetched file content
 * when asked to read a shared file mid-diagnosis.
 *
 * `buildHubFileContextForPrompt` appends an "AI-HUB FILE READ" block to the
 * Ares system prompt BEFORE `streamAresChat` is called. This test verifies
 * that:
 *   1. File found   — hub returns content → system prompt contains the block
 *                     with the expected file content.
 *   2. File not found — hub returns a 404/error → system prompt contains an
 *                       error note instead of the content.
 *   3. Hub unavailable — isHubAvailable() returns false → no hub section is
 *                        injected into the system prompt at all.
 *
 * Strategy: mock `streamAresChat` to capture the `system` argument it receives;
 * mock `hubGet` / `isHubAvailable` (ai-hub-client) to control the hub
 * behaviour per test case. Let `buildHubFileContextForPrompt` run for real so
 * we cover the actual integration path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted stubs ──────────────────────────────────────────────────────────────

const hubMocks = vi.hoisted(() => ({
  isHubAvailable: vi.fn(() => true),
  hubGet: vi.fn(async () => ({ ok: true, status: 200, data: null })),
  hubPost: vi.fn(async () => ({ ok: true, status: 200 })),
}));

const aresMocks = vi.hoisted(() => ({
  isAresConfigured: true as boolean,
  getAresModelId: vi.fn(() => "devstral-test"),
  streamAresChat: vi.fn(async () => ({})),
  capturedSystem: null as string | null,
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/ai-hub-client", () => ({
  isHubAvailable: hubMocks.isHubAvailable,
  hubGet: hubMocks.hubGet,
  hubPost: hubMocks.hubPost,
  HUB_FILE_READ_TIMEOUT_MS: 5_000,
}));

vi.mock("../lib/ares-client", () => ({
  get isAresConfigured() { return aresMocks.isAresConfigured; },
  getAresModelId: aresMocks.getAresModelId,
  streamAresChat: aresMocks.streamAresChat,
}));

vi.mock("../lib/vram-arbiter", () => ({
  withAresVramPriority: async (_model: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../ai/ares-jobs", () => ({
  startAresJob: vi.fn(async () => ({ started: false, reason: "mocked" })),
  withAresInteractivePriority: async (fn: () => Promise<unknown>) => fn(),
  detectAresJobRequest: vi.fn(() => null),
}));

vi.mock("../ai/assistant/ares-question", () => ({
  composeAresQuestion: vi.fn(async () => "diagnostica: leggi il file ares/report.md"),
}));

vi.mock("../ai/assistant/ares-learning", () => ({
  buildAresLearningContext: vi.fn(async () => ""),
}));

vi.mock("../ai/assistant/knowledge", () => ({
  buildSystemPrompt: vi.fn(() => "system: utente"),
  buildAdminSystemPrompt: vi.fn(() => "system: admin"),
  buildHorusSystemPrompt: vi.fn(() => "system: horus"),
  buildAresSystemPrompt: vi.fn(() => "system: ares-base"),
  // buildQuebrachoSystemPrompt removed (Task #591)
}));

vi.mock("../ai/assistant/roster", () => ({
  AI_ROSTER: {
    bowie: { name: "Bowie" },
    horus: { name: "Horus" },
    ares: { name: "Ares" },
    // quebracho removed (Task #591)
  },
  createHandoffMarkerFilter: vi.fn(() => ({
    push: (delta: string, emit: (s: string) => void) => emit(delta),
    flush: (emit: (s: string) => void) => { void emit; },
  })),
  stripHandoffMarker: vi.fn((t: string) => t),
  detectAresJobRequest: vi.fn(() => null),
}));

vi.mock("../ai/assistant/horus-scanner", () => ({
  detectHorusScanRequest: vi.fn(() => null),
  startHorusScan: vi.fn(),
}));

vi.mock("../ai/assistant/task-review", () => ({
  detectPlanReviewRequest: vi.fn(() => null),
  reviewTaskPlan: vi.fn(),
}));

vi.mock("../ai/assistant/tc-hub-tools", () => ({
  buildHubFileTools: vi.fn(() => ({})),
  buildCheckVramTool: vi.fn(() => ({})),
}));

vi.mock("../ai/assistant/hub-file-injection", async (importOriginal) => {
  // Import the REAL module so buildHubFileContextForPrompt runs for real.
  // We only stub the streaming filter and executeHubFileSaves (not under test here).
  const real = await importOriginal<typeof import("../ai/assistant/hub-file-injection")>();
  return {
    ...real,
    createSaveDirectiveStreamFilter: vi.fn(() => ({
      push: (_delta: string, emit: (s: string) => void) => emit(_delta),
      flush: (_emit: (s: string) => void) => [],
    })),
    executeHubFileSaves: vi.fn(async () => []),
    buildHubFileCapabilitiesBlock: vi.fn(() => "[HUB CAPS BLOCK]"),
  };
});

vi.mock("../ai/assistant/tools", () => ({
  OLLAMA_TOOLS: {},
  HORUS_TOOLS: {},
  buildBowieInterAgentTools: vi.fn(() => ({})),
  buildRememberNoteTool: vi.fn(() => ({})),
  buildReviewTaskPlanTool: vi.fn(() => ({})),
  buildSearchManualTool: vi.fn(() => ({})),
}));

vi.mock("../ai/assistant/rag", () => ({
  retrieveContext: vi.fn(() => []),
  formatRagContext: vi.fn(() => ""),
  indexKnowledge: vi.fn(),
}));

vi.mock("../ai/assistant/user-context", () => ({
  fetchUserLiveContext: vi.fn(async () => ""),
}));

vi.mock("../ai/assistant/knowledge-gaps", () => ({
  recordKnowledgeGap: vi.fn(async () => undefined),
}));

vi.mock("../ai/assistant/tool-calling", () => ({
  selectToolNamesForMessage: vi.fn(() => []),
  buildMissingToolInstruction: vi.fn(() => ""),
  createOllamaOutputGate: vi.fn(() => ({ push: vi.fn(), flush: vi.fn() })),
}));

vi.mock("../ai/assistant/web-search", () => ({
  isWebSearchConfigured: vi.fn(() => false),
}));

vi.mock("../ai/assistant/horus-memory", () => ({
  loadHorusMemory: vi.fn(async () => null),
}));

vi.mock("../ai/assistant/horus-analyzer", () => ({
  loadShareableAnalysisKnowledge: vi.fn(async () => []),
}));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: false,
  getOllamaModel: vi.fn(),
  warmOllama: vi.fn(),
  isOllamaReachable: vi.fn(async () => false),
}));

vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: vi.fn(async () => false),
}));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: vi.fn(),
  estimateCostUsd: vi.fn(() => 0),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
  isStepCount: vi.fn(() => "sentinel"),
}));

vi.mock("../lib/ai-logger", () => ({
  logAiCall: vi.fn(),
}));

vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

vi.mock("@shared/db", () => ({
  aiConversationTurns: { _: "mocked-table" },
}));

vi.mock("drizzle-orm", () => {
  const sql = vi.fn((s: TemplateStringsArray, ...v: unknown[]) => ({ __sql: s, v }));
  (sql as unknown as { raw: unknown }).raw = vi.fn((s: string) => ({ __rawSql: s }));
  return {
    eq: vi.fn((a: unknown, b: unknown) => `eq(${String(a)},${String(b)})`),
    desc: vi.fn((a: unknown) => `desc(${String(a)})`),
    sql,
  };
});

vi.mock("../ai/assistant/memory-pruner", () => ({
  pruneUserMemory: vi.fn(async () => undefined),
  MEMORY_TURNS_LIMIT: 10,
}));

vi.mock("@shared/bowie-greeting", () => ({
  BOWIE_INTRO_POEM: "",
  HORUS_INTRO_POEM: "",
  ARES_INTRO_POEM: "",
  // QUEBRACHO_INTRO_POEM removed (Task #591)
}));

vi.mock("@shared/languages", () => ({
  SOURCE_APP_LANGUAGE: "it",
}));

// ── Import under test — after all mocks ───────────────────────────────────────

import { runAssistantAgent } from "../ai/assistant/agent";

// ── Shared opts ───────────────────────────────────────────────────────────────

const ARES_OPTS = {
  message: "leggi il file ares/report.md",
  platform: "admin" as const,
  allowedActions: [],
  userId: null,
  persona: "ares" as const,
  adminContext: "",
};

// ── Helper: capture system passed to streamAresChat ───────────────────────────

function captureAresSystem(): { get: () => string | null } {
  let captured: string | null = null;
  aresMocks.streamAresChat.mockImplementation(
    async (opts: { system: string; onDelta?: (d: string) => void }) => {
      captured = opts.system;
      opts.onDelta?.("risposta diagnostica di Ares.");
      return {};
    },
  );
  return { get: () => captured };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task #171 — Ares pre-fetched file injection", () => {
  beforeEach(() => {
    hubMocks.isHubAvailable.mockReturnValue(true);
    hubMocks.hubGet.mockReset();
    aresMocks.streamAresChat.mockReset();
  });

  it("injects AI-HUB FILE READ block when hub returns file content", async () => {
    hubMocks.hubGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ok: true,
        content: "# Report\nDiagnostica completata con successo.",
        path: "ares/report.md",
      },
    });

    const cap = captureAresSystem();
    await runAssistantAgent(ARES_OPTS);

    const system = cap.get();
    expect(system).not.toBeNull();
    // The AI-HUB FILE READ section must be present with the file path and content.
    expect(system).toContain("AI-HUB FILE READ");
    expect(system).toContain("ares/report.md");
    expect(system).toContain("Diagnostica completata con successo.");
  });

  it("injects an error note when hub returns 404 / file not found", async () => {
    hubMocks.hubGet.mockResolvedValue({
      ok: false,
      status: 404,
      data: null,
      error: "file non trovato",
    });

    const cap = captureAresSystem();
    await runAssistantAgent(ARES_OPTS);

    const system = cap.get();
    expect(system).not.toBeNull();
    // An error description must appear instead of content — Ares is told the file
    // could not be read so it doesn't give a confident answer based on nothing.
    expect(system).toContain("AI-HUB FILE READ");
    expect(system).toContain("ares/report.md");
    // Must not contain a code-block with real content (the file wasn't found).
    expect(system).not.toContain("Diagnostica completata");
  });

  it("injects no hub section when isHubAvailable returns false", async () => {
    hubMocks.isHubAvailable.mockReturnValue(false);
    // hubGet should never be called when hub is unavailable.
    hubMocks.hubGet.mockResolvedValue({ ok: true, status: 200, data: { ok: true, content: "SECRET", path: "ares/report.md" } });

    const cap = captureAresSystem();
    await runAssistantAgent(ARES_OPTS);

    const system = cap.get();
    expect(system).not.toBeNull();
    // Hub section must be completely absent — no stale or absent data injected.
    expect(system).not.toContain("AI-HUB");
    expect(system).not.toContain("agent-shared");
    expect(hubMocks.hubGet).not.toHaveBeenCalled();
  });
});
