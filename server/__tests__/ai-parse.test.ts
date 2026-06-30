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

vi.mock("../geo", () => ({
  haversineKm: vi.fn().mockReturnValue(0),
}));

vi.mock("../graphhopper-client", () => ({
  calculateRoute: vi.fn().mockResolvedValue(null),
  isSelfHosted: false,
}));

// Create stable mock references via vi.hoisted so they exist when vi.mock factory runs
const aiMocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: aiMocks.generateObject,
  streamText: aiMocks.streamText,
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ provider: "google", modelId: "gemini-2.5-flash" }))),
}));

// Questi test coprono il flusso Gemini-only (provider cloud). Forziamo Ollama come
// NON configurato così il comportamento è deterministico anche quando BOWIE_OLLAMA_URL è
// presente nell'ambiente (vedi ai-stream-robustness.test.ts per il flusso Ollama).
vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: false,
  getOllamaModel: vi.fn(() => { throw new Error("Ollama non configurato (mock)"); }),
}));

// Groq disabilitato in questi test: il flusso resta Gemini-only e deterministico.
vi.mock("../lib/groq-client", () => ({
  isGroqConfigured: false,
  getGroqModel: vi.fn(() => { throw new Error("Groq non configurato (mock)"); }),
}));

// ---------------------------------------------------------------------------
// Import router and the exported utility after mocks are in place
// ---------------------------------------------------------------------------

import plannedRoutesRouter from "../routes/planned-routes";
import { fallbackAiParse } from "../routes/planned-routes";

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

const AUTH_USER_ID = "test-user-42";

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

// ---------------------------------------------------------------------------
// 1. Unit tests — fallbackAiParse
// ---------------------------------------------------------------------------

describe("fallbackAiParse — field detection from natural language", () => {
  it("returns all required fields for any input", () => {
    const result = fallbackAiParse("Giro veloce in autostrada");
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("startLocation");
    expect(result).toHaveProperty("endLocation");
    expect(result).toHaveProperty("waypoints");
    expect(result).toHaveProperty("style");
    expect(result).toHaveProperty("isRoundTrip");
    expect(result).toHaveProperty("isMultiDay");
    expect(result).toHaveProperty("daysEstimate");
    expect(result).toHaveProperty("maxHoursPerDay");
    expect(result).toHaveProperty("avoidHighways");
    expect(result).toHaveProperty("notes");
  });

  it('detects style="fast" when prompt contains "veloce"', () => {
    expect(fallbackAiParse("Voglio un giro veloce").style).toBe("fast");
  });

  it('detects style="fast" when prompt contains "autostrada"', () => {
    expect(fallbackAiParse("Giro in autostrada").style).toBe("fast");
  });

  it('detects style="curvy" when prompt contains "curve"', () => {
    expect(fallbackAiParse("Voglio strade con molte curve").style).toBe("curvy");
  });

  it('detects style="curvy" when prompt contains "curvy"', () => {
    expect(fallbackAiParse("Percorso curvy panoramico").style).toBe("curvy");
  });

  it('detects style="curvy" when prompt contains "panoramic"', () => {
    expect(fallbackAiParse("Giro panoramic in montagna").style).toBe("curvy");
  });

  it('defaults style to "balanced" for generic prompts', () => {
    expect(fallbackAiParse("Giro tranquillo in campagna").style).toBe("balanced");
  });

  it("detects isRoundTrip when prompt contains \"ritorno\"", () => {
    expect(fallbackAiParse("Giro con ritorno a casa").isRoundTrip).toBe(true);
  });

  it("detects isRoundTrip when prompt contains \"andata e ritorno\"", () => {
    expect(fallbackAiParse("Andata e ritorno da Milano").isRoundTrip).toBe(true);
  });

  it("isRoundTrip is false for one-way prompts", () => {
    expect(fallbackAiParse("Da Roma a Napoli").isRoundTrip).toBe(false);
  });

  it("detects isMultiDay when prompt contains \"giorni\"", () => {
    expect(fallbackAiParse("Giro di 3 giorni").isMultiDay).toBe(true);
  });

  it("detects isMultiDay when prompt contains \"weekend\"", () => {
    expect(fallbackAiParse("Giro del weekend").isMultiDay).toBe(true);
  });

  it("detects isMultiDay when prompt contains \"settimana\"", () => {
    expect(fallbackAiParse("Una settimana in Toscana").isMultiDay).toBe(true);
  });

  it("isMultiDay is false for single-day prompts", () => {
    expect(fallbackAiParse("Giro veloce di mattina").isMultiDay).toBe(false);
  });

  it("daysEstimate is 7 when prompt contains \"settimana\"", () => {
    expect(fallbackAiParse("Una settimana in Sardegna").daysEstimate).toBe(7);
  });

  it("daysEstimate is 2 when prompt contains \"weekend\"", () => {
    expect(fallbackAiParse("Weekend in Dolomiti").daysEstimate).toBe(2);
  });

  it("daysEstimate is 1 for single-day prompts", () => {
    expect(fallbackAiParse("Giro di oggi").daysEstimate).toBe(1);
  });

  it("maxHoursPerDay is always 6", () => {
    expect(fallbackAiParse("Qualsiasi testo").maxHoursPerDay).toBe(6);
  });

  it("detects avoidHighways when prompt contains \"senza autostrada\"", () => {
    expect(fallbackAiParse("Giro senza autostrada").avoidHighways).toBe(true);
  });

  it("detects avoidHighways when prompt contains \"evit\"", () => {
    expect(fallbackAiParse("Evitare le autostrade").avoidHighways).toBe(true);
  });

  it("avoidHighways is false when not mentioned", () => {
    expect(fallbackAiParse("Giro tranquillo").avoidHighways).toBe(false);
  });

  it("notes field contains the original prompt", () => {
    const prompt = "Giro speciale da qualche parte";
    expect(fallbackAiParse(prompt).notes).toBe(prompt);
  });

  it("waypoints is an empty array", () => {
    expect(Array.isArray(fallbackAiParse("test").waypoints)).toBe(true);
    expect(fallbackAiParse("test").waypoints).toHaveLength(0);
  });

  it("startLocation and endLocation are empty strings", () => {
    const result = fallbackAiParse("Qualunque testo");
    expect(result.startLocation).toBe("");
    expect(result.endLocation).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 2. Unit tests — generateObject response (via mocked Vercel AI SDK)
// ---------------------------------------------------------------------------

describe("POST /api/planned-routes/ai-parse — structured object from AI", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-unit";
    app = buildApp();
    aiMocks.generateObject.mockReset();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  function mockAiOk(object: Record<string, unknown>) {
    aiMocks.generateObject.mockResolvedValue({ object });
  }

  it("returns structured object with title, startLocation, and style", async () => {
    const payload = {
      title: "Giro sulle Alpi",
      startLocation: "Milano",
      endLocation: "Torino",
      waypoints: ["Como"],
      style: "curvy",
      isRoundTrip: false,
      isMultiDay: false,
      daysEstimate: 1,
      maxHoursPerDay: 6,
      avoidHighways: false,
      notes: "",
    };
    mockAiOk(payload);

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Giro sulle Alpi" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Giro sulle Alpi");
    expect(res.body.startLocation).toBe("Milano");
    expect(res.body.style).toBe("curvy");
  });

  it("returns object with isRoundTrip and endLocation", async () => {
    const payload = {
      title: "Dolomiti",
      startLocation: "Bolzano",
      endLocation: "Trento",
      waypoints: [],
      style: "balanced",
      isRoundTrip: true,
      isMultiDay: false,
      daysEstimate: 1,
      maxHoursPerDay: 6,
      avoidHighways: false,
      notes: "",
    };
    mockAiOk(payload);

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Dolomiti" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Dolomiti");
    expect(res.body.isRoundTrip).toBe(true);
  });

  it("returns object with avoidHighways flag", async () => {
    const payload = {
      title: "Toscana",
      startLocation: "Firenze",
      endLocation: "Siena",
      waypoints: [],
      style: "fast",
      isRoundTrip: false,
      isMultiDay: false,
      daysEstimate: 1,
      maxHoursPerDay: 6,
      avoidHighways: true,
      notes: "",
    };
    mockAiOk(payload);

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Toscana veloce" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Toscana");
    expect(res.body.avoidHighways).toBe(true);
  });

  it("returns object with isMultiDay and daysEstimate fields", async () => {
    const payload = {
      title: "Sicilia",
      startLocation: "Palermo",
      endLocation: "Catania",
      waypoints: ["Agrigento"],
      style: "balanced",
      isRoundTrip: false,
      isMultiDay: true,
      daysEstimate: 3,
      maxHoursPerDay: 6,
      avoidHighways: false,
      notes: "",
    };
    mockAiOk(payload);

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Sicilia multi-day" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Sicilia");
    expect(res.body.isMultiDay).toBe(true);
    expect(res.body.daysEstimate).toBe(3);
  });

  it("returns 503 when generateObject throws an unexpected error", async () => {
    aiMocks.generateObject.mockRejectedValue(new Error("Schema validation failed"));

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "testo ambiguo" });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("message");
  });
});

// ---------------------------------------------------------------------------
// 3. Integration tests — AI errors → HTTP error codes
// ---------------------------------------------------------------------------

describe("POST /api/planned-routes/ai-parse — AI HTTP error handling", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-integration";
    app = buildApp();
    aiMocks.generateObject.mockReset();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("returns 503 with message body when AI responds with HTTP 500", async () => {
    aiMocks.generateObject.mockRejectedValue(new Error("Gemini 500"));

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Qualsiasi giro" });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("returns 429 with rate-limit message when AI responds with HTTP 429", async () => {
    const err = new Error("Gemini 429 quota exceeded");
    aiMocks.generateObject.mockRejectedValue(err);

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Giro in moto" });

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toMatch(/limit|quota|richieste/i);
  });

  it("returns 503 with message body when AI responds with HTTP 503", async () => {
    aiMocks.generateObject.mockRejectedValue(new Error("Gemini 503"));

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Giro domenicale" });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("message");
  });

  it("returns 504 with message body when SDK throws AbortError", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    aiMocks.generateObject.mockRejectedValue(abortErr);

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Giro lento" });

    expect(res.status).toBe(504);
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toMatch(/troppo tempo/i);
  });

  it("returns 503 with message body when SDK throws a generic network error", async () => {
    aiMocks.generateObject.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Giro in moto" });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("message");
  });
});

// ---------------------------------------------------------------------------
// 4. Input validation tests
// ---------------------------------------------------------------------------

describe("POST /api/planned-routes/ai-parse — input validation", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-validation";
    app = buildApp();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("returns 400 when prompt is missing from request body", async () => {
    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("returns 503 when GEMINI_API_KEY env var is not set", async () => {
    delete process.env.GEMINI_API_KEY;

    const res = await request(app)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Giro di prova" });

    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/GEMINI_API_KEY/i);
  });

  it("returns 401 when user is not authenticated", async () => {
    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, { session: {} });
      next();
    });
    unauthApp.use("/api/planned-routes", plannedRoutesRouter);

    const res = await request(unauthApp)
      .post("/api/planned-routes/ai-parse")
      .send({ prompt: "Giro non autenticato" });

    expect(res.status).toBe(401);
  });
});
