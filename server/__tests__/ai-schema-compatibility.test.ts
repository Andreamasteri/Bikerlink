// Tests for two silent bugs that only appeared in prod logs:
// 1. Groq json_schema rejection — when the resolved model has objectMode:"json",
//    generateObject must be called with mode:"json" (not json_schema).
// 2. OpenAI additionalProperties/propertyNames rejection — proposalSchema must
//    serialize to a JSON Schema that OpenAI's response_format accepts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import
// ---------------------------------------------------------------------------

const aiMocks = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock("ai", () => ({ generateObject: aiMocks.generateObject }));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: vi.fn(),
  estimateCostUsd: vi.fn().mockReturnValue(0),
}));

vi.mock("../ai/watchdog/kill-switch", () => ({
  isWatchdogEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../ai/watchdog/maps-kill-switch", () => ({
  isMapsFlagEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("../ai/moderation/budget", () => ({
  withBudget: vi.fn().mockImplementation(
    (_scope: string, fn: () => Promise<unknown>) => fn()
  ),
}));

vi.mock("../ai/moderation/log", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: vi.fn().mockResolvedValue("log-id-test"),
}));

vi.mock("../ai/console/tools", () => ({
  SCOPES: ["moderation", "watchdog", "ota", "db-integrity", "app-integrity"] as const,
  buildToolsForScopes: vi.fn().mockReturnValue([]),
}));

vi.mock("../cache/redis", () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock("../ai/coordinator/integrations/console", () => ({
  emitConsoleQuery: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports under test — after mocks
// ---------------------------------------------------------------------------

import { runProposer } from "../ai/watchdog/proposer";
import { runWithFallback } from "../ai/moderation/provider";
import { proposalSchema, weeklyReportSchema } from "../ai/watchdog/types";
import type { HealthSnapshot } from "../ai/watchdog/types";
import type { ResolvedModel } from "../ai/moderation/provider";
import { RouterDecisionSchema } from "../ai/console/router";
import { triageOutputSchema } from "../ai/moderation/types";
import { aiExplainSchema } from "../ai/db-integrity/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGroqModel: ResolvedModel = {
  id: "groq",
  providerName: "groq",
  modelId: "llama-3.3-70b-versatile",
  model: {} as never,
  objectMode: "json",
  scheduler: <T>(fn: () => Promise<T>) => fn(),
};

const criticalSnapshot: HealthSnapshot = {
  status: "red",
  score: 10,
  problems: [
    {
      id: "queue.matching.waiting_high",
      severity: "critical",
      source: "bullmq",
      title: "Matching queue bloccata",
      detail: "waiting > 1000",
    },
  ],
  metrics: { "queue.matching.waiting": 1000 },
  generatedAt: new Date().toISOString(),
};

const emptyProposalsResponse = {
  object: { proposals: [] },
  usage: { inputTokens: 100, outputTokens: 50 },
};

// ---------------------------------------------------------------------------
// Test Suite 1 — Groq objectMode:json → generateObject riceve mode:"json"
// ---------------------------------------------------------------------------

describe("Groq objectMode:json — generateObject deve ricevere mode:'json'", () => {
  beforeEach(() => {
    aiMocks.generateObject.mockReset();
    aiMocks.generateObject.mockResolvedValue(emptyProposalsResponse);

    vi.mocked(runWithFallback).mockImplementation(async (_opts, fn) => {
      const value = await fn(mockGroqModel);
      return { value, model: mockGroqModel };
    });
  });

  it("runProposer passa mode:'json' a generateObject quando il modello ha objectMode:'json'", async () => {
    await runProposer(criticalSnapshot);

    expect(aiMocks.generateObject).toHaveBeenCalledTimes(1);
    expect(aiMocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "json" })
    );
  });

  it("runProposer NON include mode quando il modello non ha objectMode", async () => {
    const geminiModel: ResolvedModel = {
      ...mockGroqModel,
      id: "google",
      providerName: "google",
      modelId: "gemini-2.5-flash",
      objectMode: undefined,
    };

    vi.mocked(runWithFallback).mockImplementation(async (_opts, fn) => {
      const value = await fn(geminiModel);
      return { value, model: geminiModel };
    });

    await runProposer(criticalSnapshot);

    expect(aiMocks.generateObject).toHaveBeenCalledTimes(1);
    const callArgs = aiMocks.generateObject.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty("mode");
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2 — proposalSchema compatibilità JSON Schema OpenAI
// ---------------------------------------------------------------------------

describe("proposalSchema — JSON Schema senza propertyNames né tipi unknown (compatibilità OpenAI)", () => {
  it("non contiene la keyword 'propertyNames' (rifiutata da OpenAI response_format)", () => {
    const schema = z.toJSONSchema(proposalSchema);
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain("propertyNames");
  });

  it("non contiene il tipo 'unknown' (rifiutato da OpenAI response_format)", () => {
    const schema = z.toJSONSchema(proposalSchema);
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toMatch(/"type"\s*:\s*"unknown"/);
  });

  it("il campo params è serializzato come additionalProperties senza propertyNames", () => {
    const actionSchema = proposalSchema.shape.action;
    const schema = z.toJSONSchema(actionSchema);
    const serialized = JSON.stringify(schema);
    expect(serialized).toContain("additionalProperties");
    expect(serialized).not.toContain("propertyNames");
  });

  it("proposalSchema è un oggetto Zod valido e il tipo inferito include params come Record", () => {
    const example = {
      title: "Riavvia worker",
      reasoning: "Il worker matching è bloccato da 30 minuti.",
      riskLevel: "medium" as const,
      action: {
        kind: "restart_worker" as const,
        target: "matching",
        params: { timeout: 30, force: true, label: "hotfix" },
      },
      affectedComponents: ["matching-worker"],
    };
    const result = proposalSchema.safeParse(example);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3 — Tutti gli altri schemi usati con generateObject
// Regressione preventiva: nessuno deve contenere propertyNames o unknown
// ---------------------------------------------------------------------------

describe("Schemi AI aggiuntivi — nessun propertyNames né unknown (compatibilità OpenAI)", () => {
  const schemasUnderTest = [
    { name: "triageOutputSchema", schema: triageOutputSchema },
    { name: "RouterDecisionSchema", schema: RouterDecisionSchema },
    { name: "weeklyReportSchema", schema: weeklyReportSchema },
    { name: "aiExplainSchema", schema: aiExplainSchema },
  ];

  for (const { name, schema } of schemasUnderTest) {
    it(`${name}: non contiene 'propertyNames' (rifiutato da OpenAI response_format)`, () => {
      const serialized = JSON.stringify(z.toJSONSchema(schema));
      expect(serialized).not.toContain("propertyNames");
    });

    it(`${name}: non contiene il tipo 'unknown' (rifiutato da OpenAI response_format)`, () => {
      const serialized = JSON.stringify(z.toJSONSchema(schema));
      expect(serialized).not.toMatch(/"type"\s*:\s*"unknown"/);
    });
  }
});

// ---------------------------------------------------------------------------
// Test Suite 4 — aiExplainSchema (db-integrity): sql deve essere nullable, non optional
// Regressione: .optional() rimuove il campo da "required" → rifiutato da OpenAI strict mode.
// ---------------------------------------------------------------------------

describe("aiExplainSchema (db-integrity) — sql nullable per OpenAI strict mode", () => {
  it("il campo sql è presente nella lista 'required' del JSON Schema serializzato", () => {
    const jsonSchema = z.toJSONSchema(aiExplainSchema) as { required?: string[] };
    expect(jsonSchema.required).toBeDefined();
    expect(jsonSchema.required).toContain("sql");
  });

  it("il campo sql accetta null (non è solo z.string())", () => {
    const result = aiExplainSchema.safeParse({
      rootCause: "test", blastRadius: "nessuno",
      proposedFix: "manual", sql: null,
      reasoning: "test", risk: "low",
    });
    expect(result.success).toBe(true);
  });

  it("il campo sql accetta una stringa SQL valida", () => {
    const result = aiExplainSchema.safeParse({
      rootCause: "test", blastRadius: "nessuno",
      proposedFix: "sql", sql: "DELETE FROM foo WHERE id = 1",
      reasoning: "test", risk: "low",
    });
    expect(result.success).toBe(true);
  });
});
