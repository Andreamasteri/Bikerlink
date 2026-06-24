import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before router import
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

// Scenario chiave (Task #2930): Ollama NON configurato + Groq configurato.
// Senza GEMINI_API_KEY le richieste devono comunque riuscire usando Groq —
// è esattamente il caso che la guardia di route deve consentire.
vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: false,
  getOllamaModel: vi.fn(() => { throw new Error("Ollama non configurato (mock)"); }),
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

// Catena deterministica: solo Groq (Ollama disabilitato, Gemini senza chiave).
vi.mock("../ai/route-provider-config", () => ({
  getEffectiveRouteChain: vi.fn().mockResolvedValue(["groq"]),
}));

vi.mock("../ai/route-provider-stats", () => ({ incrementProviderStat: vi.fn() }));

import plannedRoutesRouter from "../routes/planned-routes";
import { VALID_ROUTE } from "./helpers/route-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTH_USER_ID = "test-user-groq-only";

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
// Tests — Groq unico provider (no Ollama, no Gemini key)
// ---------------------------------------------------------------------------

describe("Groq unico provider configurato — niente Ollama né GEMINI_API_KEY (Task #2930)", () => {
  let app: express.Application;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    app = buildApp();
    aiMocks.generateObject.mockReset();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("/ai-parse: la guardia non blocca, l'oggetto viene generato da Groq", async () => {
    aiMocks.generateObject.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "groq") return Promise.resolve({ object: VALID_ROUTE });
      throw new Error("Solo Groq dovrebbe essere chiamato");
    });

    const res = await request(app).post("/api/planned-routes/ai-parse").send({ prompt: "Giro sulle Alpi" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Giro sulle Alpi");
    const providers = aiMocks.generateObject.mock.calls.map((c) => c[0].model.__provider);
    expect(providers).toEqual(["groq"]);
  });

  it("/ai-stream: la guardia non blocca, lo stream proviene da Groq", async () => {
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "groq") return streamFrom(chunkify(valid));
      throw new Error("Solo Groq dovrebbe essere chiamato");
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.error).toBeUndefined();
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi", style: "curvy" });
    const providers = aiMocks.streamText.mock.calls.map((c) => c[0].model.__provider);
    expect(providers).toEqual(["groq"]);
  });
});
