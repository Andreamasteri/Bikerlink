/**
 * Task #2552 — E2E Co-Pilot AI moderazione con MOCK provider.
 *
 * Senza dipendere da OPENAI/ANTHROPIC/GOOGLE API key, verifichiamo:
 *  1. Happy path: runWithFallback (mockato) ritorna un TriageOutput valido →
 *     persistito su reports.ai_analysis e loggato via logAiCall.
 *  2. Fallback rule-based: quando il budget AI è esaurito, il triage produce
 *     un output deterministico senza chiamare il provider AI.
 *  3. gatherContext fallisce → ritorna null senza chiamare provider.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const { mockRunWithFallback, mockWithBudget, mockLogAiCall } = vi.hoisted(() => ({
  mockRunWithFallback: vi.fn(),
  mockWithBudget: vi.fn(),
  mockLogAiCall: vi.fn().mockResolvedValue(undefined),
}));
const { mockDbSelect, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: vi.fn() }));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: mockRunWithFallback,
  estimateCostUsd: () => 0.0001,
}));

vi.mock("../ai/moderation/budget", () => ({
  withBudget: mockWithBudget,
}));

vi.mock("../ai/moderation/log", () => ({
  logAiCall: mockLogAiCall,
}));

vi.mock("../db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

// Chain factory: ritorna un oggetto che è AL TEMPO STESSO chain (from/where/...)
// e thenable. Awaitarlo risolve a `terminal`. Le chiamate a from/where/orderBy
// ritornano lo stesso oggetto; limit ritorna direttamente terminal (Promise).
function makeChain<T>(terminal: T | Promise<T>) {
  const p = Promise.resolve(terminal);
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(p);
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

const fakeReport = {
  id: "rep-1",
  reporterId: "reporter-1",
  reportedUserId: "reported-1",
  category: "harassment",
  severity: "high",
  context: "chat",
  affectedFeedbackLoop: false,
  reporterTrustScore: 0.9,
  reason: "test reason",
  description: "Test desc",
  disableAiAnalysis: false,
  createdAt: new Date("2026-05-01T00:00:00Z"),
};

function installFullContextSelects() {
  // gatherContext fa: 1 select report + Promise.all([history, recents, reporter, reported])
  const terminals = [
    [fakeReport],
    [], // history
    [], // reporterRecents
    [{ nickname: "rep-nick" }],
    [{ nickname: "rpd-nick" }],
  ];
  let idx = 0;
  mockDbSelect.mockImplementation(() => makeChain(terminals[idx++] ?? []));
}

function installNoReportSelects() {
  mockDbSelect.mockImplementation(() => makeChain([]));
}

function installUpdateSpy() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
  return { set, where };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Task #2552 — Co-Pilot AI triage con mock provider", () => {
  it("happy path: mock provider ritorna TriageOutput valido e viene persistito", async () => {
    installFullContextSelects();
    const { set } = installUpdateSpy();

    const { triageOutputSchema } = await import("../ai/moderation/types");
    const fakeTriageOutput = {
      categorySuggested: "harassment" as const,
      severitySuggested: "high" as const,
      isSpamProbability: 0.1,
      isRetaliatoryProbability: 0.2,
      similarReports: [],
      summary: "Caso harassment confermato.",
      suggestedAction: "warn" as const,
      suggestedBanDays: 0,
      reasoning: "Trust reporter alto, prima offesa.",
      confidence: 0.8,
    };
    // Contract check: l'output dichiarato dal test deve essere accettato dallo schema.
    expect(triageOutputSchema.safeParse(fakeTriageOutput).success).toBe(true);

    mockWithBudget.mockImplementation(async (_scope: string, fn: () => Promise<unknown>) => fn());
    // Bypassiamo pRetry+generateObject ritornando direttamente value+model.
    mockRunWithFallback.mockResolvedValue({
      value: { object: fakeTriageOutput, usage: { inputTokens: 100, outputTokens: 50 } },
      model: { id: "mock", providerName: "mock-provider", modelId: "mock-brain-1" },
    });

    const { runTriage } = await import("../ai/moderation/triage");
    const result = await runTriage({ reportId: "rep-1" });

    expect(result).toEqual(fakeTriageOutput);
    expect(mockRunWithFallback).toHaveBeenCalledTimes(1);
    expect(mockLogAiCall).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "triage", reportId: "rep-1" }),
    );
    expect(set).toHaveBeenCalled();
    const setArg = set.mock.calls[0][0] as {
      aiModel: string;
      aiAnalysis: { suggestedAction: string; categorySuggested: string; severitySuggested: string };
    };
    expect(setArg.aiModel).toBe("mock-brain-1");
    expect(setArg.aiAnalysis.suggestedAction).toBe("warn");
    expect(setArg.aiAnalysis.categorySuggested).toBe("harassment");
    expect(setArg.aiAnalysis.severitySuggested).toBe("high");
  });

  it("fallback rule-based quando il budget AI è esaurito", async () => {
    installFullContextSelects();
    const { set } = installUpdateSpy();

    mockWithBudget.mockImplementation(async () => {
      throw new Error("AI_BUDGET_EXCEEDED:triage:daily");
    });

    const { runTriage } = await import("../ai/moderation/triage");
    const result = await runTriage({ reportId: "rep-1" });

    expect(result).not.toBeNull();
    expect(mockRunWithFallback).not.toHaveBeenCalled();
    expect(result!.confidence).toBeLessThanOrEqual(0.5);
    expect(result!.reasoning).toMatch(/[Ff]allback|[Dd]eterministico/);
    expect(set).toHaveBeenCalled();
    expect((set.mock.calls[0][0] as { aiModel: string }).aiModel).toBe("rule-based");
    expect(mockLogAiCall).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "triage", reportId: "rep-1" }),
    );
  });

  it("ritorna null se il report non esiste (gatherContext fallisce)", async () => {
    installNoReportSelects();
    const { runTriage } = await import("../ai/moderation/triage");
    const result = await runTriage({ reportId: "missing" });
    expect(result).toBeNull();
    expect(mockRunWithFallback).not.toHaveBeenCalled();
    expect(mockWithBudget).not.toHaveBeenCalled();
  });
});
