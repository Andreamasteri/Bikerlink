import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import
// ---------------------------------------------------------------------------

const ollamaModel = { _provider: "ollama", modelId: "llama3" } as const;
const geminiModel = { _provider: "google", modelId: "gemini-1.5-flash" } as const;

const aiMocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: aiMocks.generateObject,
  streamText: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(
    () =>
      vi.fn(() => geminiModel)
  ),
}));

// Questo file testa il percorso con Ollama CONFIGURATO.
// isOllamaConfigured=true fa sì che generateRouteObject tenti prima Ollama.
const ollamaMocks = vi.hoisted(() => ({
  getOllamaModel: vi.fn(() => ollamaModel),
}));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: ollamaMocks.getOllamaModel,
  // Probe di raggiungibilità aggiunta a waypoints.next: in test Ollama è "online".
  isOllamaReachable: vi.fn().mockResolvedValue(true),
}));

// Groq disabilitato qui: la catena è Ollama → Gemini (vedi ai-groq-fallback.test.ts
// per i test con Groq abilitato come tier intermedio).
vi.mock("../lib/groq-client", () => ({
  isGroqConfigured: false,
  getGroqModel: vi.fn(() => { throw new Error("Groq non configurato (mock)"); }),
}));

// OpenAI disabilitato: "openai" fa parte della DEFAULT_ROUTE_CHAIN ma qui la
// catena testata è Ollama → Gemini, quindi lo neutralizziamo (altrimenti, con
// OPENAI_API_KEY presente nell'env, verrebbe tentato come tier finale).
vi.mock("../lib/openai-route-client", () => ({
  isOpenAiRouteConfigured: false,
  getOpenAiRouteModel: vi.fn(() => { throw new Error("OpenAI non configurato (mock)"); }),
}));

// ---------------------------------------------------------------------------
// Import under test — after mocks
// ---------------------------------------------------------------------------

import { generateRouteObject } from "../routes/planned-routes/waypoints.next";

// ---------------------------------------------------------------------------
// Schema minimo per i test
// ---------------------------------------------------------------------------

const simpleSchema = z.object({
  title: z.string(),
  style: z.string(),
});

type SimpleRoute = z.infer<typeof simpleSchema>;

const baseOpts = {
  prompt: "Giro in moto",
  system: "Sei un assistente moto.",
  schema: simpleSchema,
} as const;

// ---------------------------------------------------------------------------
// Suite: generateRouteObject — Ollama configurato
// ---------------------------------------------------------------------------

describe("generateRouteObject — Ollama configurato come provider primario", () => {
  beforeEach(() => {
    aiMocks.generateObject.mockReset();
    ollamaMocks.getOllamaModel.mockReset();
    ollamaMocks.getOllamaModel.mockReturnValue(ollamaModel);
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  // -------------------------------------------------------------------------
  // (a) Ollama risponde correttamente → deve essere usato, Gemini non chiamato
  // -------------------------------------------------------------------------

  it("(a) restituisce l'oggetto Ollama quando valido, senza chiamare Gemini", async () => {
    const ollamaPayload: SimpleRoute = { title: "Giro Ollama", style: "curvy" };
    aiMocks.generateObject.mockResolvedValueOnce({ object: ollamaPayload });
    process.env.GEMINI_API_KEY = "test-gemini-key";

    const { result, provider_used } = await generateRouteObject<SimpleRoute>({
      ...baseOpts,
      apiKey: process.env.GEMINI_API_KEY,
    });

    expect(result).toEqual(ollamaPayload);
    expect(provider_used).toBe("ollama");

    // generateObject deve essere stato chiamato UNA SOLA volta (con il modello Ollama)
    expect(aiMocks.generateObject).toHaveBeenCalledTimes(1);
    const [firstCallArgs] = aiMocks.generateObject.mock.calls;
    expect(firstCallArgs[0].model).toEqual(ollamaModel);
  });

  it("(a) Ollama valido funziona anche senza GEMINI_API_KEY", async () => {
    const ollamaPayload: SimpleRoute = { title: "Ollama standalone", style: "balanced" };
    aiMocks.generateObject.mockResolvedValueOnce({ object: ollamaPayload });

    const { result, provider_used } = await generateRouteObject<SimpleRoute>({
      ...baseOpts,
      apiKey: undefined,
    });

    expect(result).toEqual(ollamaPayload);
    expect(provider_used).toBe("ollama");
    expect(aiMocks.generateObject).toHaveBeenCalledTimes(1);
    expect(aiMocks.generateObject.mock.calls[0][0].model).toEqual(ollamaModel);
  });

  // -------------------------------------------------------------------------
  // (b) Ollama lancia errore → fallback su Gemini
  // -------------------------------------------------------------------------

  it("(b) ricade su Gemini quando Ollama lancia un errore di connessione", async () => {
    aiMocks.generateObject.mockRejectedValueOnce(new Error("ECONNREFUSED ollama"));
    const geminiPayload: SimpleRoute = { title: "Giro Gemini fallback", style: "fast" };
    aiMocks.generateObject.mockResolvedValueOnce({ object: geminiPayload });
    process.env.GEMINI_API_KEY = "test-gemini-key";

    const { result, provider_used } = await generateRouteObject<SimpleRoute>({
      ...baseOpts,
      apiKey: process.env.GEMINI_API_KEY,
    });

    expect(result).toEqual(geminiPayload);
    expect(provider_used).toBe("gemini");

    // generateObject chiamato due volte: prima Ollama (fallisce), poi Gemini
    expect(aiMocks.generateObject).toHaveBeenCalledTimes(2);
    expect(aiMocks.generateObject.mock.calls[0][0].model).toEqual(ollamaModel);
    expect(aiMocks.generateObject.mock.calls[1][0].model).toEqual(geminiModel);
  });

  it("(b) ricade su Gemini quando Ollama lancia un errore di schema/parsing", async () => {
    aiMocks.generateObject.mockRejectedValueOnce(new Error("JSON parse error: unexpected token"));
    const geminiPayload: SimpleRoute = { title: "Gemini rescue", style: "balanced" };
    aiMocks.generateObject.mockResolvedValueOnce({ object: geminiPayload });
    process.env.GEMINI_API_KEY = "test-gemini-key";

    const { result, provider_used } = await generateRouteObject<SimpleRoute>({
      ...baseOpts,
      apiKey: process.env.GEMINI_API_KEY,
    });

    expect(result).toEqual(geminiPayload);
    expect(provider_used).toBe("gemini");
    expect(aiMocks.generateObject).toHaveBeenCalledTimes(2);
    expect(aiMocks.generateObject.mock.calls[1][0].model).toEqual(geminiModel);
  });

  it("(b) il risultato Gemini fallback ha i campi attesi", async () => {
    aiMocks.generateObject.mockRejectedValueOnce(new Error("Ollama timeout"));
    const geminiPayload: SimpleRoute = { title: "Toscana via Gemini", style: "curvy" };
    aiMocks.generateObject.mockResolvedValueOnce({ object: geminiPayload });
    process.env.GEMINI_API_KEY = "test-gemini-key";

    const { result, provider_used } = await generateRouteObject<SimpleRoute>({
      ...baseOpts,
      apiKey: process.env.GEMINI_API_KEY,
    });

    expect(result.title).toBe("Toscana via Gemini");
    expect(result.style).toBe("curvy");
    expect(provider_used).toBe("gemini");
  });

  // -------------------------------------------------------------------------
  // (c) Ollama lancia + GEMINI_API_KEY mancante → errore propagato
  // -------------------------------------------------------------------------

  it("(c) propaga l'errore Ollama quando GEMINI_API_KEY non è presente", async () => {
    const ollamaError = new Error("Ollama irraggiungibile");
    aiMocks.generateObject.mockRejectedValueOnce(ollamaError);

    await expect(
      generateRouteObject<SimpleRoute>({
        ...baseOpts,
        apiKey: undefined,
      })
    ).rejects.toThrow("Ollama irraggiungibile");

    // Gemini non deve essere mai stato tentato
    expect(aiMocks.generateObject).toHaveBeenCalledTimes(1);
    expect(aiMocks.generateObject.mock.calls[0][0].model).toEqual(ollamaModel);
  });

  it("(c) l'errore propagato è quello originale di Ollama, non un wrapper generico", async () => {
    const ollamaError = new Error("Connection refused to ollama:11434");
    aiMocks.generateObject.mockRejectedValueOnce(ollamaError);

    await expect(
      generateRouteObject<SimpleRoute>({
        ...baseOpts,
        apiKey: undefined,
      })
    ).rejects.toMatchObject({ message: "Connection refused to ollama:11434" });
  });
});
