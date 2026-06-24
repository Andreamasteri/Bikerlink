// Regression tests for groqGenerateObject — the no-schema wrapper added to
// waypoints.next.ts so that llama-3.x models on Groq are tolerant of AI SDK v6
// (which removed the `mode` parameter from generateObject).
//
// Tests:
//   A. llama model → generateObject with output:"no-schema", no schema property, Zod parse applied
//   B. strict-capable model → generateObject with schema property, no output:"no-schema"
//   C. llama model + Zod parse failure → error propagates (fallback chain catches it)

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Set env vars before module load so module-level constants pick them up.
// Each test module gets its own module registry in Vitest.
// ---------------------------------------------------------------------------

// Default: llama model (the real default when GROQ_PARSE_MODEL is unset).
// We leave the env at its default so the module-level regex fires.
// For the strict-model tests we use vi.resetModules + dynamic import.

const aiMocks = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock("ai", () => ({ generateObject: aiMocks.generateObject, streamText: vi.fn() }));

// ---------------------------------------------------------------------------
// Mocks that groq-client + waypoints.next.ts need
// ---------------------------------------------------------------------------

const groqParseModel = { __provider: "groq-parse", modelId: "llama-3.3-70b-versatile" };
const groqMocks = vi.hoisted(() => ({
  getGroqParseModel: vi.fn(() => groqParseModel),
  getGroqModel: vi.fn(() => groqParseModel),
}));

vi.mock("../lib/groq-client", () => ({
  isGroqConfigured: true,
  getGroqModel: groqMocks.getGroqModel,
  getGroqParseModel: groqMocks.getGroqParseModel,
}));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: false,
  getOllamaModel: vi.fn(),
  isOllamaReachable: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/openai-route-client", () => ({
  isOpenAiRouteConfigured: false,
  getOpenAiRouteModel: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ __provider: "google" }))),
}));

vi.mock("../ai/route-provider-config", () => ({
  getEffectiveRouteChain: vi.fn().mockResolvedValue(["groq"]),
}));

vi.mock("../ai/route-provider-stats", () => ({
  incrementProviderStat: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { generateRouteObject } from "../routes/planned-routes/waypoints.next";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tinySchema = z.object({ title: z.string(), style: z.string() });
type TinyResult = z.infer<typeof tinySchema>;

const validObject: TinyResult = { title: "Giro Alpi", style: "curvy" };

// ---------------------------------------------------------------------------
// Test Suite A — llama model uses output:"no-schema" + Zod parse
// ---------------------------------------------------------------------------

describe("groqGenerateObject — llama model → no-schema + Zod parse", () => {
  it("chiama generateObject con output:'no-schema' e senza schema nativo", async () => {
    aiMocks.generateObject.mockResolvedValue({ object: validObject, usage: {} });

    await generateRouteObject({
      schema: tinySchema,
      prompt: "Crea un percorso",
      system: "Sei un assistente moto.",
      apiKey: undefined,
    });

    expect(aiMocks.generateObject).toHaveBeenCalledTimes(1);
    const args = aiMocks.generateObject.mock.calls[0][0];
    // Must use no-schema mode for llama
    expect(args.output).toBe("no-schema");
    // Must NOT pass a schema (json_schema path)
    expect(args).not.toHaveProperty("schema");
    // Must NOT pass mode (removed in AI SDK v6)
    expect(args).not.toHaveProperty("mode");
    // Prompt must include the JSON Schema shape as hint
    expect(String(args.prompt)).toContain("JSON Schema");
  });

  it("ritorna l'oggetto dopo validazione Zod riuscita", async () => {
    aiMocks.generateObject.mockResolvedValue({ object: validObject, usage: {} });

    const { result } = await generateRouteObject({
      schema: tinySchema,
      prompt: "Percorso test",
      system: "s",
    });

    expect(result).toEqual(validObject);
  });

  it("propaga l'errore se l'oggetto no-schema non supera la validazione Zod", async () => {
    // Model returns an object that doesn't match the schema
    aiMocks.generateObject.mockResolvedValue({ object: { wrong: "field" }, usage: {} });

    await expect(
      generateRouteObject({ schema: tinySchema, prompt: "x", system: "s" })
    ).rejects.toThrow();
  });
});
