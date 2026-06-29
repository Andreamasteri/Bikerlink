import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — stable refs created before vi.mock() factories run
// ---------------------------------------------------------------------------

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn(() => "step-count-is-3-sentinel"),
}));

const providerMocks = vi.hoisted(() => ({
  runWithFallback: vi.fn(),
  estimateCostUsd: vi.fn(() => 0),
}));

const getBikerStatsExecute = vi.hoisted(() => vi.fn());
const getUserPlannedRoutesExecute = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  streamText: aiMocks.streamText,
  stepCountIs: aiMocks.stepCountIs,
}));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: providerMocks.runWithFallback,
  estimateCostUsd: providerMocks.estimateCostUsd,
}));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __provider: "ollama", modelId: "mistral-nemo:latest" })),
  isOllamaReachable: vi.fn().mockResolvedValue(true),
}));

// Mock OLLAMA_TOOLS: sostituiamo le execute con spy per verificare le invocazioni.
vi.mock("../ai/assistant/tools", () => ({
  OLLAMA_TOOLS: {
    getBikerStats: {
      description: "Statistiche aggregate del biker",
      inputSchema: {},
      execute: getBikerStatsExecute,
    },
    getUserPlannedRoutes: {
      description: "Percorsi moto pianificati dell'utente",
      inputSchema: {},
      execute: getUserPlannedRoutesExecute,
    },
  },
}));

vi.mock("../ai/assistant/knowledge", () => ({
  buildSystemPrompt: vi.fn(() => "system: assistente moto"),
  buildAdminSystemPrompt: vi.fn(() => "system: admin"),
}));

vi.mock("../ai/assistant/rag", () => ({
  retrieveContext: vi.fn(() => []),
  formatRagContext: vi.fn(() => ""),
  indexKnowledge: vi.fn(),
}));

vi.mock("../lib/ai-logger", () => ({
  logAiCall: vi.fn(),
}));

// Drizzle-orm chain: select().from().where().orderBy().limit() → []
vi.mock("../db", () => {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "from", "where", "orderBy", "insert"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain["limit"] = vi.fn().mockResolvedValue([]);
  chain["values"] = vi.fn().mockResolvedValue(undefined);
  return { db: chain };
});

vi.mock("@shared/db", () => ({
  aiConversationTurns: { _: "mocked-table" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => `eq(${String(a)},${String(b)})`),
  desc: vi.fn((a: unknown) => `desc(${String(a)})`),
}));

vi.mock("../ai/assistant/memory-pruner", () => ({
  pruneUserMemory: vi.fn().mockResolvedValue(undefined),
  MEMORY_TURNS_LIMIT: 10,
}));

// ---------------------------------------------------------------------------
// Import under test — after all mocks
// ---------------------------------------------------------------------------

import { runAssistantAgent } from "../ai/assistant/agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolArgs = Record<string, unknown>;
type ToolSet = Record<string, { execute: (a: ToolArgs) => Promise<unknown> } | undefined>;

/** Crea un risultato streamText finto con una lista di chunk testuali. */
function makeStream(
  chunks: string[],
  usage: { inputTokens: number; outputTokens: number } = { inputTokens: 50, outputTokens: 100 },
) {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    usage: Promise.resolve(usage),
  };
}

/** Crea uno stream che lancia un errore dopo aver emesso i chunk. */
function makeStreamThatThrows(err: Error) {
  return {
    textStream: (async function* () {
      throw err;
    })(),
    usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  };
}

const BASE_OPTS = {
  message: "Quante strade ho percorso?",
  platform: "android" as const,
  allowedActions: [],
  userId: "user-test-123",
};

// ---------------------------------------------------------------------------
// Suite: Mistral Nemo tool calling via Ollama
// ---------------------------------------------------------------------------

describe("runAssistantAgent — Mistral Nemo tool calling (Ollama provider)", () => {
  beforeEach(() => {
    // I provider cloud falliscono sempre in questi test → l'agente ricade su Ollama
    providerMocks.runWithFallback.mockRejectedValue(
      new Error("tutti i provider cloud offline (mock)"),
    );
    aiMocks.streamText.mockReset();
    aiMocks.stepCountIs.mockClear();
    getBikerStatsExecute.mockReset();
    getUserPlannedRoutesExecute.mockReset();
  });

  // -------------------------------------------------------------------------
  // (a) streamText deve ricevere OLLAMA_TOOLS e stopWhen(3) quando Ollama è il
  //     provider attivo — prerequisito fondamentale per il tool calling.
  // -------------------------------------------------------------------------

  it("(a) chiama streamText con OLLAMA_TOOLS e stopWhen(3) per il provider Ollama", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Hai percorso molte strade."]));

    await runAssistantAgent(BASE_OPTS);

    expect(aiMocks.streamText).toHaveBeenCalledTimes(1);
    const callArgs = aiMocks.streamText.mock.calls[0][0] as {
      tools?: ToolSet;
      stopWhen?: unknown;
    };

    // tools deve contenere i tool Ollama (inclusi getBikerStats e getUserPlannedRoutes)
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools).toHaveProperty("getBikerStats");
    expect(callArgs.tools).toHaveProperty("getUserPlannedRoutes");

    // stopWhen deve essere settato — è il parametro che limita a 3 step di tool calling
    expect(callArgs.stopWhen).toBeDefined();
    expect(aiMocks.stepCountIs).toHaveBeenCalledWith(3);
  });

  // -------------------------------------------------------------------------
  // (b) Tool call Mistral Nemo ben formato: il tool viene invocato e il
  //     risultato compare nel testo finale.
  // -------------------------------------------------------------------------

  it("(b) getBikerStats viene invocato e il risultato è nella risposta finale", async () => {
    const statsResult = {
      totalRoutes: 12,
      totalKm: 876.5,
      avgKm: 73.0,
      lastRouteAt: "2026-06-01",
    };
    getBikerStatsExecute.mockResolvedValue(statsResult);

    // Simula Mistral Nemo che chiama getBikerStats prima di rispondere:
    // il mock di streamText esegue il tool (come farebbe il Vercel AI SDK internamente)
    // e poi restituisce il testo finale che riflette i dati del tool.
    aiMocks.streamText.mockImplementation((args: { tools?: ToolSet }) => {
      const tool = args.tools?.getBikerStats;
      if (tool) {
        tool.execute({ userId: "user-test-123" });
      }
      return makeStream([
        "Ecco le tue statistiche: hai completato ",
        "12 giri per un totale di 876,5 km.",
      ]);
    });

    const result = await runAssistantAgent(BASE_OPTS);

    // Il tool deve essere stato invocato con l'userId corretto
    expect(getBikerStatsExecute).toHaveBeenCalledTimes(1);
    expect(getBikerStatsExecute).toHaveBeenCalledWith({ userId: "user-test-123" });

    // Il testo finale deve includere i dati provenienti dal tool
    expect(result.text).toContain("12 giri");
    expect(result.text).toContain("876,5 km");

    // L'agente non deve essere in stato degraded
    expect(result.provider).toBe("ollama");
    expect(result.degraded).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (c) Tool call con argomenti malformati (formato Mistral Nemo divergente da
  //     llama3.1:8b) — il tool execute lancia, l'agente non crasha.
  // -------------------------------------------------------------------------

  it("(c) graceful degradation quando il tool riceve argomenti malformati e lancia errore", async () => {
    // Simula Mistral Nemo che produce JSON incompleto per il tool call (userId mancante)
    getBikerStatsExecute.mockRejectedValue(new Error("userId mancante o non valido"));

    aiMocks.streamText.mockImplementation((args: { tools?: ToolSet }) => {
      const tool = args.tools?.getBikerStats;
      if (tool) {
        // Invocazione con args malformati — il modello ha prodotto JSON parziale
        tool.execute({ userId: undefined as unknown as string }).catch(() => {
          // atteso: Mistral Nemo ha prodotto tool args invalidi
        });
      }
      // Il modello cade su risposta testuale di fallback (come farebbe con un tool error)
      return makeStream(["Non riesco a recuperare le tue statistiche in questo momento."]);
    });

    const result = await runAssistantAgent(BASE_OPTS);

    // L'agente NON deve crashare
    expect(result.text).toContain("Non riesco");
    expect(result.text.length).toBeGreaterThan(0);

    // Il provider è ancora ollama (la risposta è arrivata dal textStream)
    expect(result.provider).toBe("ollama");
    expect(result.degraded).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (d) Mistral Nemo ignora completamente i tool (formato diverso da llama3.1:8b,
  //     nessuna chiamata prodotta) — risposta testuale diretta, nessun crash.
  // -------------------------------------------------------------------------

  it("(d) il modello salta i tool e risponde direttamente — nessun crash, testo presente", async () => {
    // Mistral Nemo non chiama alcun tool e risponde con testo puro
    aiMocks.streamText.mockReturnValue(
      makeStream([
        "Non ho accesso diretto alle tue statistiche in questa sessione, ",
        "ma puoi controllare nella sezione Statistiche dell'app.",
      ]),
    );

    const result = await runAssistantAgent(BASE_OPTS);

    // Nessun tool deve essere stato invocato
    expect(getBikerStatsExecute).not.toHaveBeenCalled();
    expect(getUserPlannedRoutesExecute).not.toHaveBeenCalled();

    // La risposta deve essere valida e non vuota
    expect(result.text).toContain("statistiche");
    expect(result.degraded).toBe(false);
    expect(result.provider).toBe("ollama");
  });

  // -------------------------------------------------------------------------
  // (e) Ollama crasha durante il tool calling (connessione interrotta) —
  //     l'agente segna degraded=true e include il messaggio ⚠️ standard.
  // -------------------------------------------------------------------------

  it("(e) Ollama crasha durante il tool calling → degraded=true, messaggio di errore", async () => {
    aiMocks.streamText.mockReturnValue(
      makeStreamThatThrows(new Error("connessione interrotta durante tool calling")),
    );

    const result = await runAssistantAgent(BASE_OPTS);

    expect(result.degraded).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    // Il messaggio deve essere user-friendly con il prefisso ⚠️
    expect(result.text).toContain("⚠️");
  });

  // -------------------------------------------------------------------------
  // (f) getUserPlannedRoutes — verifica che il secondo tool sia ugualmente
  //     raggiungibile e che il formato Mistral Nemo funzioni per entrambi.
  // -------------------------------------------------------------------------

  it("(f) getUserPlannedRoutes viene invocato e il risultato compare nella risposta", async () => {
    const routesResult = {
      routes: [
        { id: 1, title: "Giro Dolomiti", distanceKm: 320, style: "curvy" },
        { id: 2, title: "Costa Amalfitana", distanceKm: 150, style: "scenic" },
      ],
      total: 2,
    };
    getUserPlannedRoutesExecute.mockResolvedValue(routesResult);

    aiMocks.streamText.mockImplementation((args: { tools?: ToolSet }) => {
      const tool = args.tools?.getUserPlannedRoutes;
      if (tool) {
        tool.execute({ userId: "user-test-123", limit: 5 });
      }
      return makeStream([
        "Hai 2 percorsi pianificati: Giro Dolomiti (320 km) e Costa Amalfitana (150 km).",
      ]);
    });

    const result = await runAssistantAgent(BASE_OPTS);

    expect(getUserPlannedRoutesExecute).toHaveBeenCalledWith({
      userId: "user-test-123",
      limit: 5,
    });
    expect(result.text).toContain("2 percorsi pianificati");
    expect(result.degraded).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (g) Risposta strutturata: i campi del risultato sono tutti presenti
  //     e tipizzati correttamente anche con tool calling attivo.
  // -------------------------------------------------------------------------

  it("(g) il risultato ha tutti i campi attesi (text, provider, model, degraded, costUsd)", async () => {
    getBikerStatsExecute.mockResolvedValue({ totalRoutes: 3, totalKm: 120, avgKm: 40 });

    aiMocks.streamText.mockImplementation((args: { tools?: ToolSet }) => {
      args.tools?.getBikerStats?.execute({ userId: "user-test-123" });
      return makeStream(["Hai percorso 120 km in 3 giri."], { inputTokens: 80, outputTokens: 40 });
    });

    const result = await runAssistantAgent(BASE_OPTS);

    expect(typeof result.text).toBe("string");
    expect(typeof result.provider).toBe("string");
    expect(typeof result.model).toBe("string");
    expect(typeof result.degraded).toBe("boolean");
    expect(typeof result.costUsd).toBe("number");
    expect(typeof result.tokensIn).toBe("number");
    expect(typeof result.tokensOut).toBe("number");
    expect(result.provider).toBe("ollama");
    // Il model è determinato da OLLAMA_MODEL env var (runtime) — verifichiamo solo che sia una stringa non vuota
    expect(typeof result.model).toBe("string");
    expect(result.model.length).toBeGreaterThan(0);
  });
});
