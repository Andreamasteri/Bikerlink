// Regression tests for the streaming Groq branch in streamRouteText
// (waypoints.next.ts) with a focus on llama-guard isolation.
//
// Tests:
//   A. Streaming uses getGroqModel() (conversational), NOT getGroqParseModel()
//   B. Groq streaming with a llama model succeeds — streamText has no json_schema
//      restriction, so the no-schema guard from groqGenerateObject does NOT apply
//   C. Groq streaming invalid output → falls back to Gemini (validation gate)
//   D. Groq 429 during streaming → immediate skip to Gemini (no retry on same provider)
//   E. Groq-only chain (no Gemini) → valid output emitted; invalid → SSE error
//
// Companion to ai-groq-fallback.test.ts which covers the full Ollama→Groq→Gemini
// chain; this file focuses on the llama-model / json_schema guard isolation.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

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
vi.mock("../graphhopper-client", () => ({
  calculateRoute: vi.fn().mockResolvedValue(null),
  isSelfHosted: false,
}));

const aiMocks = vi.hoisted(() => ({ generateObject: vi.fn(), streamText: vi.fn() }));
vi.mock("ai", () => ({
  generateObject: aiMocks.generateObject,
  streamText: aiMocks.streamText,
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ __provider: "google" }))),
}));

// Ollama disabled — tests focus on the Groq streaming branch.
vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: false,
  getOllamaModel: vi.fn(() => ({ __provider: "ollama" })),
  isOllamaReachable: vi.fn().mockResolvedValue(false),
}));

// Groq enabled. Two distinct sentinel models (inline to avoid hoisting issues):
// getGroqModel → conversational model tagged with __role: "stream"
// getGroqParseModel → parse model tagged with __role: "parse"
vi.mock("../lib/groq-client", () => ({
  isGroqConfigured: true,
  getGroqModel: vi.fn(() => ({ __provider: "groq", __role: "stream" })),
  getGroqParseModel: vi.fn(() => ({ __provider: "groq", __role: "parse" })),
}));

vi.mock("../lib/openai-route-client", () => ({
  isOpenAiRouteConfigured: false,
  getOpenAiRouteModel: vi.fn(),
}));

vi.mock("../ai/route-provider-stats", () => ({ incrementProviderStat: vi.fn() }));

// Chain: Groq + Gemini (Ollama disabled above).
vi.mock("../ai/route-provider-config", () => ({
  getEffectiveRouteChain: vi.fn().mockResolvedValue(["groq", "gemini"]),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import plannedRoutesRouter from "../routes/planned-routes";
import {
  VALID_ROUTE,
  BROKEN_STREAM_SENTINEL,
  ROUTE_JSON_TRUNCATED_MID,
  ROUTE_JSON_TRUNCATED_SHORT,
} from "./helpers/route-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTH_USER_ID = "test-user-groq-stream-guard";

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
// Suite A — streaming path uses getGroqModel() (role:"stream"), not getGroqParseModel()
// ---------------------------------------------------------------------------

describe("streamRouteText — Groq streaming usa getGroqModel (role:stream), non getGroqParseModel", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-groq-guard"; // pragma: allowlist secret
    app = buildApp();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("bufferAndValidateStream riceve il modello da getGroqModel (role:stream), non da getGroqParseModel (role:parse)", async () => {
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string; __role?: string } }) => {
      // Only accept the stream-role model; reject the parse-role model.
      if (model?.__role === "parse") {
        throw new Error("getGroqParseModel non deve essere usato nello streaming");
      }
      return streamFrom(chunkify(valid));
    });

    const res = await request(app)
      .post("/api/planned-routes/ai-stream")
      .send({ prompt: "Giro sulle Alpi" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.error).toBeUndefined();
    // All streamText calls must use role:"stream", never role:"parse".
    const callRoles = aiMocks.streamText.mock.calls.map((c) => c[0].model?.__role);
    expect(callRoles.every((r) => r !== "parse")).toBe(true);
    expect(callRoles.some((r) => r === "stream")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite B — llama model in streaming: no json_schema guard needed (streamText
//            does not use structured outputs)
// ---------------------------------------------------------------------------

describe("streamRouteText — llama come modello Groq non blocca lo streaming", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-groq-llama-stream"; // pragma: allowlist secret
    app = buildApp();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("il chain Groq streaming funziona anche quando il modello è llama (nessun json_schema richiesto)", async () => {
    const { getGroqModel } = await import("../lib/groq-client");
    // Temporarily return a llama-tagged model for the next call only.
    vi.mocked(getGroqModel).mockReturnValueOnce(
      { __provider: "groq", __role: "stream", modelId: "llama-3.3-70b-versatile" } as never
    );

    const valid = JSON.stringify(VALID_ROUTE);
    // streamText should be called without any error — no json_schema guard applies to streamText.
    aiMocks.streamText.mockImplementation(() => streamFrom(chunkify(valid)));

    const res = await request(app)
      .post("/api/planned-routes/ai-stream")
      .send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.error).toBeUndefined();
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
    expect(aiMocks.streamText).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite C — Groq streaming invalid output → fallback to Gemini
// ---------------------------------------------------------------------------

describe("streamRouteText — Groq streaming JSON non valido → fallback Gemini", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-groq-invalid"; // pragma: allowlist secret
    app = buildApp();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("Groq produce JSON troncato → Gemini emette output valido, nessun frammento Groq nel client", async () => {
    const broken = ROUTE_JSON_TRUNCATED_MID;
    const valid = JSON.stringify(VALID_ROUTE);

    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string; __role?: string } }) => {
      if (model?.__role === "stream") return streamFrom(chunkify(broken));
      return streamFrom(chunkify(valid));
    });

    const res = await request(app)
      .post("/api/planned-routes/ai-stream")
      .send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
    const roles = aiMocks.streamText.mock.calls.map((c) => c[0].model?.__role ?? c[0].model?.__provider);
    expect(roles).toContain("stream");
    expect(roles).toContain("google");
  });

  it("Groq stream interrotto da errore → Gemini risponde correttamente", async () => {
    const valid = JSON.stringify(VALID_ROUTE);

    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string; __role?: string } }) => {
      if (model?.__role === "stream") {
        return {
          textStream: (async function* () {
            yield ROUTE_JSON_TRUNCATED_SHORT;
            throw new Error("ECONNRESET groq");
          })(),
        };
      }
      return streamFrom(chunkify(valid));
    });

    const res = await request(app)
      .post("/api/planned-routes/ai-stream")
      .send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
  });
});

// ---------------------------------------------------------------------------
// Suite D — Groq 429 during streaming → immediate skip to Gemini
// ---------------------------------------------------------------------------

describe("streamRouteText — Groq 429 → skip immediato a Gemini", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-groq-429"; // pragma: allowlist secret
    app = buildApp();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("Groq lancia errore 429 → Gemini selezionato senza attendere retry", async () => {
    const valid = JSON.stringify(VALID_ROUTE);
    const err429 = Object.assign(new Error("rate limit"), { status: 429 });

    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string; __role?: string } }) => {
      if (model?.__role === "stream") throw err429;
      return streamFrom(chunkify(valid));
    });

    const res = await request(app)
      .post("/api/planned-routes/ai-stream")
      .send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.error).toBeUndefined();
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
    const providers = aiMocks.streamText.mock.calls.map((c) => c[0].model?.__provider);
    expect(providers).toContain("google");
  });
});

// ---------------------------------------------------------------------------
// Suite E — Groq-only chain (no Gemini key)
// ---------------------------------------------------------------------------

describe("streamRouteText — Groq come provider finale (senza Gemini)", () => {
  let app: express.Application;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    app = buildApp();
    aiMocks.streamText.mockReset();
  });

  it("Groq valido → output emesso correttamente senza Gemini", async () => {
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __role?: string } }) => {
      if (model?.__role === "stream") return streamFrom(chunkify(valid));
      throw new Error("Gemini non configurato");
    });

    const res = await request(app)
      .post("/api/planned-routes/ai-stream")
      .send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.error).toBeUndefined();
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
  });

  it("Groq produce JSON non valido e nessun fallback → evento error SSE, nessun testo corrotto", async () => {
    const broken = ROUTE_JSON_TRUNCATED_SHORT;
    aiMocks.streamText.mockImplementation(({ model }: { model: { __role?: string } }) => {
      if (model?.__role === "stream") return streamFrom(chunkify(broken));
      throw new Error("Gemini non configurato");
    });

    const res = await request(app)
      .post("/api/planned-routes/ai-stream")
      .send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe("");
    expect(typeof sse.error).toBe("string");
    expect(sse.error!.length).toBeGreaterThan(0);
  });
});
