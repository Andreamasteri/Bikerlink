/**
 * Task #222 — Confirm Quebracho sees the correct pre-fetched file content
 * when asked to read a shared file mid-conversation.
 *
 * Quebracho uses the exact same `buildHubFileContextForPrompt` pre-composition
 * path as Ares (agent.ts, Quebracho branch): the "AI-HUB FILE READ" block is
 * appended to the Quebracho system prompt BEFORE `streamQuebrachoChat` is
 * called. This mirrors task-171-ares-hub-prefetch.test.ts and verifies that:
 *   1. File found    — hub returns content → system prompt contains the block
 *                      with the expected file content.
 *   2. File not found — hub returns a 404/error → system prompt contains an
 *                       error note instead of the content.
 *   3. Hub unavailable — isHubAvailable() returns false → no hub section is
 *                        injected into the system prompt at all.
 *
 * Strategy: mock `streamQuebrachoChat` to capture the `system` argument it
 * receives; mock `hubGet` / `isHubAvailable` (ai-hub-client) to control the hub
 * behaviour per test case. Let `buildHubFileContextForPrompt` run for real so we
 * cover the actual integration path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted stubs ──────────────────────────────────────────────────────────────

const hubMocks = vi.hoisted(() => ({
  isHubAvailable: vi.fn(() => true),
  hubGet: vi.fn(async () => ({ ok: true, status: 200, data: null })),
  hubPost: vi.fn(async () => ({ ok: true, status: 200 })),
}));

const quebrachoMocks = vi.hoisted(() => ({
  isQuebrachoConfigured: true as boolean,
  getQuebrachoModelId: vi.fn(() => "quebracho-test"),
  streamQuebrachoChat: vi.fn(async () => ({ text: "" })),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/ai-hub-client", () => ({
  isHubAvailable: hubMocks.isHubAvailable,
  hubGet: hubMocks.hubGet,
  hubPost: hubMocks.hubPost,
}));

vi.mock("../lib/quebracho-client", () => ({
  get isQuebrachoConfigured() { return quebrachoMocks.isQuebrachoConfigured; },
  getQuebrachoModelId: quebrachoMocks.getQuebrachoModelId,
  streamQuebrachoChat: quebrachoMocks.streamQuebrachoChat,
  isQuebrachoReachable: vi.fn(async () => true),
  resetQuebrachoProbeCache: vi.fn(),
}));

// Composizione domanda: restituisce il messaggio grezzo così il path resta stabile.
vi.mock("../ai/assistant/quebracho-question", () => ({
  composeQuebrachoQuestion: vi.fn(async (_h: unknown, m: string) => m),
}));

// Nadir: nessun frammento e regex che non matcha → nessuna sezione Nadir iniettata.
vi.mock("../nadir", () => ({
  searchNadir: vi.fn(async () => ({ fragments: [], model: "test" })),
  SEARCH_MANUAL_RE: /__never_match__/,
}));

// Ares-side deps still imported at module load by agent.ts — keep them stubbed.
vi.mock("../lib/ares-client", () => ({
  get isAresConfigured() { return false; },
  getAresModelId: vi.fn(() => "devstral-test"),
  streamAresChat: vi.fn(async () => ({})),
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
  buildQuebrachoSystemPrompt: vi.fn(() => "system: quebracho"),
}));

vi.mock("../ai/assistant/roster", () => ({
  AI_ROSTER: {
    bowie: { name: "Bowie" },
    horus: { name: "Horus" },
    ares: { name: "Ares" },
    quebracho: { name: "Quebracho" },
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
  QUEBRACHO_INTRO_POEM: "",
}));

vi.mock("@shared/languages", () => ({
  SOURCE_APP_LANGUAGE: "it",
}));

// ── Import under test — after all mocks ───────────────────────────────────────

import { runAssistantAgent } from "../ai/assistant/agent";

// ── Shared opts ───────────────────────────────────────────────────────────────

const QUEBRACHO_OPTS = {
  message: "leggi il file quebracho/config.md",
  platform: "admin" as const,
  allowedActions: [],
  userId: null,
  persona: "quebracho" as const,
  adminContext: "",
};

// ── Helper: capture system passed to streamQuebrachoChat ──────────────────────

function captureQuebrachoSystem(): { get: () => string | null } {
  let captured: string | null = null;
  quebrachoMocks.streamQuebrachoChat.mockImplementation(
    async (opts: { system: string; onDelta?: (d: string) => void }) => {
      captured = opts.system;
      opts.onDelta?.("risposta di coordinamento di Quebracho.");
      return { text: "" };
    },
  );
  return { get: () => captured };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task #222 — Quebracho pre-fetched file injection", () => {
  beforeEach(() => {
    hubMocks.isHubAvailable.mockReturnValue(true);
    hubMocks.hubGet.mockReset();
    quebrachoMocks.streamQuebrachoChat.mockReset();
  });

  it("injects AI-HUB FILE READ block when hub returns file content", async () => {
    hubMocks.hubGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ok: true,
        content: "# Config\nCoordinamento configurato con successo.",
        path: "quebracho/config.md",
      },
    });

    const cap = captureQuebrachoSystem();
    await runAssistantAgent(QUEBRACHO_OPTS);

    const system = cap.get();
    expect(system).not.toBeNull();
    // The AI-HUB FILE READ section must be present with the file path and content.
    expect(system).toContain("AI-HUB FILE READ");
    expect(system).toContain("quebracho/config.md");
    expect(system).toContain("Coordinamento configurato con successo.");
  });

  it("injects an error note when hub returns 404 / file not found", async () => {
    hubMocks.hubGet.mockResolvedValue({
      ok: false,
      status: 404,
      data: null,
      error: "file non trovato",
    });

    const cap = captureQuebrachoSystem();
    await runAssistantAgent(QUEBRACHO_OPTS);

    const system = cap.get();
    expect(system).not.toBeNull();
    // An error description must appear instead of content — Quebracho is told the
    // file could not be read so it doesn't answer confidently based on nothing.
    expect(system).toContain("AI-HUB FILE READ");
    expect(system).toContain("quebracho/config.md");
    // Must not contain the (absent) file's real content.
    expect(system).not.toContain("Coordinamento configurato");
  });

  it("injects no hub section when isHubAvailable returns false", async () => {
    hubMocks.isHubAvailable.mockReturnValue(false);
    // hubGet should never be called when hub is unavailable.
    hubMocks.hubGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, content: "SECRET", path: "quebracho/config.md" },
    });

    const cap = captureQuebrachoSystem();
    await runAssistantAgent(QUEBRACHO_OPTS);

    const system = cap.get();
    expect(system).not.toBeNull();
    // Hub section must be completely absent — no stale or absent data injected.
    expect(system).not.toContain("AI-HUB");
    expect(system).not.toContain("agent-shared");
    expect(hubMocks.hubGet).not.toHaveBeenCalled();
  });
});
