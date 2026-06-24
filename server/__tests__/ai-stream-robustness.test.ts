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

// Stable refs created before vi.mock factory runs.
const aiMocks = vi.hoisted(() => ({ generateObject: vi.fn(), streamText: vi.fn() }));

vi.mock("ai", () => ({ generateObject: aiMocks.generateObject, streamText: aiMocks.streamText }));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ __provider: "google" }))),
}));

// Ollama enabled as primary provider; getOllamaModel returns a tagged sentinel
// so the streamText mock can tell Ollama and Gemini apart.
vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __provider: "ollama" })),
  isOllamaReachable: vi.fn().mockResolvedValue(true),
}));

// Groq disabilitato in questi test: la catena è Ollama → Gemini (vedi
// ai-groq-fallback.test.ts per il tier Groq abilitato).
vi.mock("../lib/groq-client", () => ({
  isGroqConfigured: false,
  getGroqModel: vi.fn(() => ({ __provider: "groq" })),
}));

import plannedRoutesRouter from "../routes/planned-routes";
import {
  VALID_ROUTE,
  BROKEN_STREAM_SENTINEL,
  ROUTE_JSON_TRUNCATED_MID,
  ROUTE_JSON_TRUNCATED_SHORT,
  ROUTE_JSON_UNKNOWN_FIELDS,
} from "./helpers/route-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTH_USER_ID = "test-user-stream";

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

/** Costruisce un risultato streamText finto a partire da una lista di chunk. */
function streamFrom(chunks: string[]) {
  return {
    textStream: (async function* () {
      for (const c of chunks) yield c;
    })(),
  };
}

/** Come sopra ma lancia un errore dopo aver emesso `chunks` (stream interrotto). */
function streamThatThrows(chunks: string[], err: Error) {
  return {
    textStream: (async function* () {
      for (const c of chunks) yield c;
      throw err;
    })(),
  };
}

/** Spezza una stringa JSON in più chunk per simulare lo streaming token-per-token. */
function chunkify(text: string, parts = 4): string[] {
  const size = Math.ceil(text.length / parts);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** Estrae il testo concatenato dai data-event SSE e l'eventuale payload done/error. */
function parseSse(body: string): { text: string; done?: unknown; error?: string } {
  const result: { text: string; done?: unknown; error?: string } = { text: "" };
  const blocks = body.split("\n\n");
  for (const block of blocks) {
    const lines = block.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event:"));
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    const data = dataLine.slice("data:".length).trim();
    const eventName = eventLine?.slice("event:".length).trim();
    if (eventName === "done") {
      result.done = JSON.parse(data).parsed;
    } else if (eventName === "error") {
      result.error = JSON.parse(data).message;
    } else {
      result.text += JSON.parse(data).text ?? "";
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/planned-routes/ai-stream — resilienza JSON Ollama (Task #2853)", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-stream";
    app = buildApp();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("emette l'output Ollama quando il JSON è valido (nessun fallback Gemini)", async () => {
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(valid));
      throw new Error("Gemini non dovrebbe essere chiamato quando Ollama è valido");
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro sulle Alpi" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    // Il testo concatenato è il JSON valido di Ollama.
    expect(sse.text).toBe(valid);
    // done.parsed contiene l'oggetto validato.
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi", style: "curvy" });
    // Gemini non è stato invocato.
    const providersCalled = aiMocks.streamText.mock.calls.map((c) => c[0].model.__provider);
    expect(providersCalled).not.toContain("google");
  });

  it("scarta il JSON corrotto di Ollama a metà stream e ricade su Gemini senza output corrotto", async () => {
    const broken = ROUTE_JSON_TRUNCATED_MID;
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(broken));
      return streamFrom(chunkify(valid));
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro sulle Alpi" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    // Nessun frammento corrotto di Ollama raggiunge il client.
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    // Il client riceve il JSON valido di Gemini.
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
    const providersCalled = aiMocks.streamText.mock.calls.map((c) => c[0].model.__provider);
    expect(providersCalled).toContain("ollama");
    expect(providersCalled).toContain("google");
  });

  it("stream Ollama interrotto da errore di connessione → fallback Gemini pulito", async () => {
    const valid = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") {
        return streamThatThrows([ROUTE_JSON_TRUNCATED_SHORT], new Error("ECONNRESET"));
      }
      return streamFrom(chunkify(valid));
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe(valid);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
  });

  it("JSON Ollama corrotto e nessuna GEMINI_API_KEY → evento error, niente output corrotto", async () => {
    delete process.env.GEMINI_API_KEY;
    app = buildApp();
    const broken = ROUTE_JSON_TRUNCATED_SHORT;
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(broken));
      throw new Error("Gemini non disponibile");
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200); // headers già inviati: l'errore arriva come evento SSE
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe("");
    expect(typeof sse.error).toBe("string");
    expect(sse.error!.length).toBeGreaterThan(0);
  });

  it("tollera JSON Ollama valido avvolto in testo extra / fence markdown", async () => {
    const wrapped = "Ecco il percorso:\n```json\n" + JSON.stringify(VALID_ROUTE) + "\n```\nBuon viaggio!";
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(wrapped));
      throw new Error("Gemini non dovrebbe essere chiamato: il JSON è estraibile");
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi", style: "curvy" });
    const providersCalled = aiMocks.streamText.mock.calls.map((c) => c[0].model.__provider);
    expect(providersCalled).not.toContain("google");
  });

  it("estrae il JSON anche con graffe extra nel testo di contorno (brace matching bilanciato)", async () => {
    // Testo che contiene graffe sia prima (es. pseudo-template) sia dopo il JSON valido:
    // un'estrazione greedy indexOf('{')/lastIndexOf('}') fallirebbe, quella bilanciata no.
    const noisy =
      "Nota: usa {placeholder} per i valori.\n" +
      JSON.stringify(VALID_ROUTE) +
      "\nGrazie :) {fine}";
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(noisy));
      throw new Error("Gemini non dovrebbe essere chiamato: il JSON è estraibile");
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi", style: "curvy" });
    const providersCalled = aiMocks.streamText.mock.calls.map((c) => c[0].model.__provider);
    expect(providersCalled).not.toContain("google");
  });
});

describe("POST /api/planned-routes/ai-stream — resilienza JSON Gemini (Task #2862)", () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-gemini";
    app = buildApp();
    aiMocks.streamText.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("JSON Gemini corrotto → evento error SSE, nessun output corrotto emesso", async () => {
    const brokenGemini = ROUTE_JSON_TRUNCATED_MID;
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(ROUTE_JSON_UNKNOWN_FIELDS));
      // Gemini restituisce JSON malformato
      return streamFrom(chunkify(brokenGemini));
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200); // headers già inviati: errore come evento SSE
    // Nessun frammento corrotto raggiunge il client
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe("");
    // Deve esserci un evento error con messaggio non vuoto
    expect(typeof sse.error).toBe("string");
    expect(sse.error!.length).toBeGreaterThan(0);
    // Entrambi i provider sono stati tentati
    const providersCalled = aiMocks.streamText.mock.calls.map((c) => c[0].model.__provider);
    expect(providersCalled).toContain("ollama");
    expect(providersCalled).toContain("google");
  });

  it("Ollama non disponibile + Gemini corrotto → evento error SSE, nessun output corrotto", async () => {
    const brokenGemini = ROUTE_JSON_TRUNCATED_SHORT;
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") throw new Error("ECONNREFUSED");
      return streamFrom(chunkify(brokenGemini));
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.text).not.toContain(BROKEN_STREAM_SENTINEL);
    expect(sse.text).toBe("");
    expect(typeof sse.error).toBe("string");
    expect(sse.error!.length).toBeGreaterThan(0);
  });

  it("Gemini valido dopo fallback Ollama → output pulito, nessun evento error", async () => {
    const brokenOllama = ROUTE_JSON_TRUNCATED_SHORT;
    const validGemini = JSON.stringify(VALID_ROUTE);
    aiMocks.streamText.mockImplementation(({ model }: { model: { __provider?: string } }) => {
      if (model?.__provider === "ollama") return streamFrom(chunkify(brokenOllama));
      return streamFrom(chunkify(validGemini));
    });

    const res = await request(app).post("/api/planned-routes/ai-stream").send({ prompt: "Giro" });
    const sse = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(sse.error).toBeUndefined();
    expect(sse.text).toBe(validGemini);
    expect(sse.done).toMatchObject({ title: "Giro sulle Alpi" });
  });
});
