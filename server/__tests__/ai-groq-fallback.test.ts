import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import
// ---------------------------------------------------------------------------

vi.mock("../storage", () => ({
  storage: {
    getPlannedRoutes: vi.fn().mockResolvedValue([]),
    getPlannedRoute: vi.fn().mockResolvedValue(null),
    createPlannedRoute: vi.fn().mockResolvedValue(null),
    updatePlannedRoute: vi.fn().mockResolvedValue(null),
    deletePlannedRoute: vi.fn().mockResolvedValue(null),
    getAppSetting: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../geo", () => ({ haversineKm: vi.fn().mockReturnValue(0) }));
vi.mock("../graphhopper-client", () => ({ calculateRoute: vi.fn().mockResolvedValue(null), isSelfHosted: false }));

const aiMocks = vi.hoisted(() => ({ generateObject: vi.fn(), streamText: vi.fn() }));
vi.mock("ai", () => ({ generateObject: aiMocks.generateObject, streamText: aiMocks.streamText }));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ __provider: "google" }))),
}));

// Catena completa abilitata: Ollama → Groq → Gemini. Ogni provider restituisce
// un modello-sentinella taggato così i mock di generateObject/streamText sanno
// quale tier è stato chiamato.
vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __provider: "ollama" })),
  isOllamaReachable: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/groq-client", () => ({
  isGroqConfigured: true,
  getGroqModel: vi.fn(() => ({ __provider: "groq" })),
  getGroqParseModel: vi.fn(() => ({ __provider: "groq" })),
}));

vi.mock("../lib/openai-route-client", () => ({
  isOpenAiRouteConfigured: false,
  getOpenAiRouteModel: vi.fn(),
}));

// Catena deterministica: Ollama → Groq → Gemini (no openai, no env surprises).
vi.mock("../ai/route-provider-config", () => ({
  getEffectiveRouteChain: vi.fn().mockResolvedValue(["ollama", "groq", "gemini"]),
}));

vi.mock("../ai/route-provider-stats", () => ({ incrementProviderStat: vi.fn() }));

// ---------------------------------------------------------------------------
// Imports under test — after mocks
// ---------------------------------------------------------------------------

import plannedRoutesRouter from "../routes/planned-routes";
import { generateRouteObject } from "../routes/planned-routes/waypoints.next";
import {
  VALID_ROUTE,
  BROKEN_STREAM_SENTINEL,
  ROUTE_JSON_TRUNCATED_MID,
  ROUTE_JSON_TRUNCATED_SHORT,
} from "./helpers/route-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTH_USER_ID = "test-user-groq";

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: AUTH_USER_ID } });
    next();
  });
  app.use("/api/planned-routes", plannedRoutesRouter);
  return app;
}

function streamFrom(chunks: string[]) {
  return {
    textStream: (async function* () {
      for (const c of chunks) yield c;
    })(),
  };
}

function chunkify(text: string, parts = 4): string[] {
  const size = Math.ceil(text.length / parts);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function parseSse(body: string): { text: string; done?: unknown; error?: string } {
  const result: { text: string; done?: unknown; error?: string } = { text: "" };
  for (const block of body.split("\n\n")) {
    const lines = block.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event:"));
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    const data = dataLine.slice("data:".length).trim();
    const eventName = eventLine?.slice("event:".length).trim();
    if (eventName === "done") result.done = JSON.parse(data).parsed;
    else if (eventName === "error") result.error = JSON.parse(data).message;
    else result.text += JSON.parse(data).text ?? "";
  }
  return result;
}

// ---------------------------------------------------------------------------
// generateRouteObject — Groq come tier intermedio (/ai-parse)
// ---------------------------------------------------------------------------

const simpleSchema = z.object({ title: z.string(), style: z.string() });
type SimpleRoute = z.infer<typeof simpleSchema>;

const baseOpts = {
  prompt: "Giro in moto",
  system: "Sei un assistente moto.",
  schema: simpleSchema,
} as const;

describe("generateRouteObject — Groq fallback (Task #2930)", () => {
  beforeEach(() => {
    aiMocks.generateObject.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("Ollama fallisce → usa Groq, senza chiamare Gemini", async () => {
    aiMocks.generateObject.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") throw new Error("ECONNREFUSED ollama");
      if (model?.__provider === "groq") return Promise.resolve({ object: { title: "Via Groq", style: "fast" } });
      throw new Error("Gemini non dovrebbe essere chiamato quando Groq risponde");
    });
    process.env.GEMINI_API_KEY = "test-gemini-key";

    const { result, provider_used } = await generateRouteObject<SimpleRoute>({ ...baseOpts, apiKey: process.env.GEMINI_API_KEY });

    expect(result).toEqual({ title: "Via Groq", style: "fast" });
    expect(provider_used).toBe("groq");
    const providers = aiMocks.generateObject.mock.calls.map((c) => c[0].model.__provider);
    expect(providers).toEqual(["ollama", "groq"]);
    expect(providers).not.toContain("google");
  });

  it("Ollama fallisce + Groq fallisce → ricade su Gemini", async () => {
    aiMocks.generateObject.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") throw new Error("ollama down");
      if (model?.__provider === "groq") throw new Error("groq 429");
      return Promise.resolve({ object: { title: "Via Gemini", style: "balanced" } });
    });
    process.env.GEMINI_API_KEY = "test-gemini-key";

    const { result, provider_used } = await generateRouteObject<SimpleRoute>({ ...baseOpts, apiKey: process.env.GEMINI_API_KEY });

    expect(result).toEqual({ title: "Via Gemini", style: "balanced" });
    expect(provider_used).toBe("gemini");
    const providers = aiMocks.generateObject.mock.calls.map((c) => c[0].model.__provider);
    expect(providers).toEqual(["ollama", "groq", "google"]);
  });

  it("Ollama fallisce + Groq funziona senza GEMINI_API_KEY", async () => {
    aiMocks.generateObject.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") throw new Error("ollama down");
      if (model?.__provider === "groq") return Promise.resolve({ object: { title: "Groq standalone", style: "curvy" } });
      throw new Error("Gemini non disponibile");
    });

    const { result, provider_used } = await generateRouteObject<SimpleRoute>({ ...baseOpts, apiKey: undefined });

    expect(result).toEqual({ title: "Groq standalone", style: "curvy" });
    expect(provider_used).toBe("groq");
    const providers = aiMocks.generateObject.mock.calls.map((c) => c[0].model.__provider);
    expect(providers).toEqual(["ollama", "groq"]);
  });

  it("Ollama fallisce + Groq fallisce + nessuna GEMINI_API_KEY → propaga l'errore Groq", async () => {
    aiMocks.generateObject.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") throw new Error("ollama down");
      throw new Error("Groq irraggiungibile");
    });

    await expect(
      generateRouteObject<SimpleRoute>({ ...baseOpts, apiKey: undefined })
    ).rejects.toThrow("Groq irraggiungibile");
    const providers = aiMocks.generateObject.mock.calls.map((c) => c[0].model.__provider);
    expect(providers).toEqual(["ollama", "groq"]);
  });
});

// ---------------------------------------------------------------------------
// /ai-stream — Groq come tier intermedio con buffering + validazione
// ---------------------------------------------------------------------------

describe("POST /api/planned-routes/ai-stream — Groq fallback (Task #2930)", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-groq-stream";
    app = buildApp();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("JSON Ollama corrotto → Groq valido viene emesso, nessun output Gemini", async () => {
    const broken = ROUTE_JSON_TRUNCATED_MID;
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(broken));
      if (model?.__provider === "groq") return streamFrom(chunkify(valid));
      throw new Error("Gemini non dovrebbe essere chiamato quando Groq è valido");
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi", style: "curvy" });
    const providers = aiMocks.streamText.mock.calls.map((c) => c[0].model.__provider);
    expect(providers).toContain("ollama");
    expect(providers).toContain("groq");
    expect(providers).not.toContain("google");
  });

  it("Ollama corrotto + Groq corrotto → ricade su Gemini valido", async () => {
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(ROUTE_JSON_TRUNCATED_SHORT));
      if (model?.__provider === "groq") return streamFrom(chunkify(ROUTE_JSON_TRUNCATED_SHORT));
      return streamFrom(chunkify(valid));
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe(valid);
    const providers = aiMocks.streamText.mock.calls.map((c) => c[0].model.__provider);
    expect(providers).toEqual(["ollama", "groq", "google"]);
  });

  it("Ollama down + Groq valido (nessuna GEMINI_API_KEY) → Groq emesso pulito", async () => {
    delete process.env.GEMINI_API_KEY;
    app = buildApp();
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") throw new Error("ECONNREFUSED");
      if (model?.__provider === "groq") return streamFrom(chunkify(valid));
      throw new Error("Gemini non configurato");
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.error).toBeUndefined();
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
  });
});
