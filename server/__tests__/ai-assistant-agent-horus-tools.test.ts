import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — stable refs created before vi.mock() factories run
// ---------------------------------------------------------------------------

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  isStepCount: vi.fn(() => "step-count-is-3-sentinel"),
}));

const providerMocks = vi.hoisted(() => ({
  runWithFallback: vi.fn(),
  estimateCostUsd: vi.fn(() => 0),
}));

// Spy execute functions for HORUS_TOOLS entries
const getWeatherExecute = vi.hoisted(() => vi.fn());
const getThinkCentreStatusExecute = vi.hoisted(() => vi.fn());
const getNearbyEventsExecute = vi.hoisted(() => vi.fn());

// Per-turn tool builder spies
const buildRememberNoteToolSpy = vi.hoisted(() =>
  vi.fn(() => ({ remember_note: { description: "note", inputSchema: {}, execute: vi.fn() } })),
);
const buildSearchManualToolSpy = vi.hoisted(() =>
  vi.fn(() => ({ search_manual: { description: "search", inputSchema: {}, execute: vi.fn() } })),
);
const buildReviewTaskPlanToolSpy = vi.hoisted(() =>
  vi.fn(() => ({ review_task_plan: { description: "review", inputSchema: {}, execute: vi.fn() } })),
);

// Hub-tool builder spies — Horus-specific (Task #233)
const buildHubFileToolsSpy = vi.hoisted(() =>
  vi.fn(() => ({
    read_file: { description: "leggi file hub", inputSchema: {}, execute: vi.fn() },
    list_files: { description: "elenca file hub", inputSchema: {}, execute: vi.fn() },
    save_file: { description: "salva file hub", inputSchema: {}, execute: vi.fn() },
  })),
);
const buildCheckVramToolSpy = vi.hoisted(() =>
  vi.fn(() => ({
    check_vram_usage: { description: "VRAM GPU ThinkCentre", inputSchema: {}, execute: vi.fn() },
  })),
);

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  streamText: aiMocks.streamText,
  isStepCount: aiMocks.isStepCount,
}));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: providerMocks.runWithFallback,
  estimateCostUsd: providerMocks.estimateCostUsd,
}));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __provider: "ollama", modelId: "qwen3:4b" })),
  isOllamaReachable: vi.fn().mockResolvedValue(true),
  warmOllama: vi.fn(),
}));

// Mock HORUS_TOOLS with spy execute functions so we can verify they are selected.
// OLLAMA_TOOLS is empty (Horus path must NOT use it).
vi.mock("../ai/assistant/tools", () => ({
  HORUS_TOOLS: {
    getWeather: {
      description: "Meteo corrente",
      inputSchema: {},
      execute: getWeatherExecute,
    },
    getThinkCentreStatus: {
      description: "Stato ThinkCentre",
      inputSchema: {},
      execute: getThinkCentreStatusExecute,
    },
    getNearbyEvents: {
      description: "Eventi vicini",
      inputSchema: {},
      execute: getNearbyEventsExecute,
    },
  },
  OLLAMA_TOOLS: {}, // must stay empty so any use of OLLAMA_TOOLS in the Horus path is visible
  buildBowieInterAgentTools: vi.fn(() => ({})),
  buildRememberNoteTool: buildRememberNoteToolSpy,
  buildReviewTaskPlanTool: buildReviewTaskPlanToolSpy,
  buildSearchManualTool: buildSearchManualToolSpy,
}));

vi.mock("../ai/assistant/knowledge", () => ({
  buildSystemPrompt: vi.fn(() => "system: assistente moto"),
  buildAdminSystemPrompt: vi.fn(() => "system: admin"),
  buildHorusSystemPrompt: vi.fn(() => "system: horus specialista percorsi"),
  buildAresSystemPrompt: vi.fn(() => "system: ares diagnostica"),
  buildQuebrachoSystemPrompt: vi.fn(() => "system: quebracho"),
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
  aiToolEvents: { toolName: "t", roster: "r", eventType: "e" },
}));

vi.mock("drizzle-orm", () => {
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: strings, values }));
  (sql as unknown as { raw: unknown }).raw = vi.fn((s: string) => ({ __rawSql: s }));
  return {
    eq: vi.fn((a: unknown, b: unknown) => `eq(${String(a)},${String(b)})`),
    desc: vi.fn((a: unknown) => `desc(${String(a)})`),
    and: vi.fn((...args: unknown[]) => `and(${args.join(",")})`),
    gte: vi.fn((a: unknown, b: unknown) => `gte(${String(a)},${String(b)})`),
    sql,
  };
});

vi.mock("../ai/assistant/memory-pruner", () => ({
  pruneUserMemory: vi.fn().mockResolvedValue(undefined),
  MEMORY_TURNS_LIMIT: 10,
}));

vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: vi.fn().mockResolvedValue(false),
}));

// Horus-specific mocks
vi.mock("../ai/assistant/horus-memory", () => ({
  loadHorusMemory: vi.fn().mockResolvedValue(null),
}));

vi.mock("../ai/assistant/horus-analyzer", () => ({
  loadShareableAnalysisKnowledge: vi.fn().mockResolvedValue([]),
}));

vi.mock("../ai/assistant/user-context", () => ({
  fetchUserLiveContext: vi.fn().mockResolvedValue(null),
}));

vi.mock("../ai/assistant/tc-hub-tools", () => ({
  buildHubFileTools: buildHubFileToolsSpy,
  buildCheckVramTool: buildCheckVramToolSpy,
}));

vi.mock("../ai/assistant/hub-file-injection", () => ({
  buildHubFileCapabilitiesBlock: vi.fn(() => ""),
  buildHubFileContextForPrompt: vi.fn().mockResolvedValue(""),
  createSaveDirectiveStreamFilter: vi.fn(() => ({
    push: vi.fn(),
    flush: vi.fn(() => ""),
  })),
  executeHubFileSaves: vi.fn().mockResolvedValue([]),
}));

// Tool-calling: return all available tool names so the full HORUS_TOOLS set is
// attached to streamText (no contextual filtering in these tests).
// createOllamaOutputGate must forward every delta to defaultSink immediately
// (no buffering) and report mode="normal" on flush so the happy path runs.
vi.mock("../ai/assistant/tool-calling", () => ({
  selectToolNamesForMessage: vi.fn((names: string[]) => names),
  buildMissingToolInstruction: vi.fn(() => ""),
  createOllamaOutputGate: vi.fn(() => ({
    push: vi.fn((delta: string, sink: (d: string) => void) => sink(delta)),
    flush: vi.fn(() => ({ mode: "normal" })),
  })),
}));

vi.mock("../ai/assistant/web-search", () => ({
  isWebSearchConfigured: vi.fn(() => false),
}));

vi.mock("../ai/assistant/horus-scanner", () => ({
  detectHorusScanRequest: vi.fn(() => null),
  startHorusScan: vi.fn(),
}));

vi.mock("../ai/assistant/knowledge-gaps", () => ({
  recordKnowledgeGap: vi.fn(),
}));

vi.mock("../ai/assistant/ares-learning", () => ({
  buildAresLearningContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("../ai/assistant/ares-question", () => ({
  composeAresQuestion: vi.fn().mockResolvedValue("domanda per Ares"),
}));

vi.mock("../ai/assistant/quebracho-question", () => ({
  composeQuebrachoQuestion: vi.fn().mockResolvedValue("domanda per Quebracho"),
}));

vi.mock("../ai/assistant/task-review", () => ({
  detectPlanReviewRequest: vi.fn(() => null),
  reviewTaskPlan: vi.fn(),
}));

vi.mock("../ai/ares-jobs", () => ({
  startAresJob: vi.fn(),
  withAresInteractivePriority: vi.fn((_f: () => unknown) => _f()),
}));

vi.mock("../lib/ares-client", () => ({
  isAresConfigured: false,
  getAresModelId: vi.fn(() => "devstral"),
  streamAresChat: vi.fn(),
}));

vi.mock("../lib/vram-arbiter", () => ({
  withAresVramPriority: vi.fn((_f: () => unknown) => _f()),
}));

vi.mock("../lib/quebracho-client", () => ({
  isQuebrachoConfigured: false,
  getQuebrachoModelId: vi.fn(() => "qwen3:14b"),
  streamQuebrachoChat: vi.fn(),
}));

vi.mock("../ai/nadir", () => ({
  searchNadir: vi.fn().mockResolvedValue({ fragments: [], model: "local" }),
  SEARCH_MANUAL_RE: /manuale|dizionario|documentazione/i,
}));

vi.mock("../ai/assistant/roster", () => ({
  AI_ROSTER: {
    bowie: { name: "Bowie" },
    horus: { name: "Horus" },
    ares: { name: "Ares" },
    quebracho: { name: "Quebracho" },
  },
  detectAresJobRequest: vi.fn(() => null),
  createHandoffMarkerFilter: vi.fn(() => ({
    push: (delta: string, emit: (d: string) => void) => emit(delta),
    flush: (emit: (d: string) => void) => emit(""),
  })),
  stripHandoffMarker: vi.fn((t: string) => ({ text: t, farewell: false })),
}));

vi.mock("@shared/bowie-greeting", () => ({
  BOWIE_INTRO_POEM: "Ciao, sono Bowie.",
  HORUS_INTRO_POEM: "Sono Horus, specialista percorsi.",
  ARES_INTRO_POEM: "Sono Ares, diagnostica tecnica.",
  QUEBRACHO_INTRO_POEM: "Sono Quebracho.",
}));

vi.mock("@shared/languages", () => ({
  SOURCE_APP_LANGUAGE: "it",
}));

// ---------------------------------------------------------------------------
// Import under test — after all mocks
// ---------------------------------------------------------------------------

import { runAssistantAgent } from "../ai/assistant/agent";
import { buildRememberNoteTool, buildSearchManualTool } from "../ai/assistant/tools";
import { loadHorusMemory } from "../ai/assistant/horus-memory";

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

// Horus è accessibile come persona admin — usiamo platform="admin" e persona="horus".
const BASE_OPTS = {
  message: "Che meteo fa a Milano questo weekend?",
  platform: "admin" as const,
  allowedActions: [],
  userId: "admin-user-001",
  persona: "horus" as const,
};

// ---------------------------------------------------------------------------
// Suite: Horus persona tool calling
// ---------------------------------------------------------------------------

describe("runAssistantAgent — Horus persona tool calling (Ollama provider)", () => {
  beforeEach(() => {
    // I provider cloud falliscono sempre in questi test → l'agente ricade su Ollama
    providerMocks.runWithFallback.mockRejectedValue(
      new Error("tutti i provider cloud offline (mock)"),
    );
    aiMocks.streamText.mockReset();
    aiMocks.isStepCount.mockClear();
    getWeatherExecute.mockReset();
    getThinkCentreStatusExecute.mockReset();
    getNearbyEventsExecute.mockReset();
    buildRememberNoteToolSpy.mockClear();
    buildSearchManualToolSpy.mockClear();
    buildReviewTaskPlanToolSpy.mockClear();
    buildHubFileToolsSpy.mockClear();
    buildCheckVramToolSpy.mockClear();
  });

  // -------------------------------------------------------------------------
  // (a) streamText deve ricevere HORUS_TOOLS e stopWhen(3) per Horus.
  //     Verifica ANCHE che i tool Bowie-only (getBikerStats, getUserPlannedRoutes)
  //     NON siano presenti — il set è HORUS_TOOLS, non OLLAMA_TOOLS.
  // -------------------------------------------------------------------------

  it("(a) chiama streamText con HORUS_TOOLS e stopWhen(3) per la persona Horus", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Il tempo a Milano è soleggiato."]));

    await runAssistantAgent(BASE_OPTS);

    expect(aiMocks.streamText).toHaveBeenCalledTimes(1);
    const callArgs = aiMocks.streamText.mock.calls[0][0] as {
      tools?: ToolSet;
      stopWhen?: unknown;
    };

    // tools deve contenere le chiavi di HORUS_TOOLS
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools).toHaveProperty("getWeather");
    expect(callArgs.tools).toHaveProperty("getThinkCentreStatus");
    expect(callArgs.tools).toHaveProperty("getNearbyEvents");

    // tool Bowie-only NON devono essere presenti
    expect(callArgs.tools).not.toHaveProperty("getBikerStats");
    expect(callArgs.tools).not.toHaveProperty("getUserPlannedRoutes");

    // stopWhen deve essere settato — limita a 3 step di tool calling
    expect(callArgs.stopWhen).toBeDefined();
    expect(aiMocks.isStepCount).toHaveBeenCalledWith(3);
  });

  // -------------------------------------------------------------------------
  // (b) buildRememberNoteTool deve essere invocato durante l'assemblaggio dei
  //     tool per il turno Horus (è un tool per-turno, non fa parte di HORUS_TOOLS).
  // -------------------------------------------------------------------------

  it("(b) buildRememberNoteTool è invocato durante l'assemblaggio dei tool Horus", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Ricordo la nota."]));

    await runAssistantAgent(BASE_OPTS);

    // buildRememberNoteTool deve essere stato chiamato una volta con isAdmin=true
    expect(buildRememberNoteTool).toHaveBeenCalledTimes(1);
    expect(buildRememberNoteTool).toHaveBeenCalledWith(true); // isAdmin
  });

  // -------------------------------------------------------------------------
  // (c) buildSearchManualTool deve essere invocato durante l'assemblaggio dei
  //     tool per il turno Horus (identico a Bowie, ma per la persona Horus).
  // -------------------------------------------------------------------------

  it("(c) buildSearchManualTool è invocato durante l'assemblaggio dei tool Horus", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Rispondo."]));

    await runAssistantAgent(BASE_OPTS);

    // buildSearchManualTool deve essere stato chiamato una volta
    expect(buildSearchManualTool).toHaveBeenCalledTimes(1);
    // Deve ricevere il contesto corretto: requesterId, includeAllUsers=true (admin), language
    const [opts] = (buildSearchManualTool as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toMatchObject({
      requesterId: "admin-user-001",
      includeAllUsers: true,
    });
  });

  // -------------------------------------------------------------------------
  // (d) getWeather viene invocato e il risultato compare nella risposta.
  // -------------------------------------------------------------------------

  it("(d) getWeather viene invocato e il risultato è nella risposta finale", async () => {
    const weatherResult = {
      temperature_c: 22,
      wind_speed_kmh: 15,
      precipitation_mm: 0,
      description: "sereno",
    };
    getWeatherExecute.mockResolvedValue(weatherResult);

    aiMocks.streamText.mockImplementation((args: { tools?: ToolSet }) => {
      const tool = args.tools?.getWeather;
      if (tool) {
        tool.execute({ lat: 45.46, lon: 9.19 });
      }
      return makeStream([
        "A Milano questo weekend il tempo sarà sereno con 22°C e vento a 15 km/h.",
      ]);
    });

    const result = await runAssistantAgent(BASE_OPTS);

    expect(getWeatherExecute).toHaveBeenCalledTimes(1);
    expect(getWeatherExecute).toHaveBeenCalledWith({ lat: 45.46, lon: 9.19 });
    expect(result.text).toContain("22°C");
    expect(result.provider).toBe("ollama");
    expect(result.degraded).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (e) Il modello salta i tool e risponde direttamente — nessun crash.
  // -------------------------------------------------------------------------

  it("(e) Horus risponde senza invocare tool — testo diretto, nessun crash", async () => {
    aiMocks.streamText.mockReturnValue(
      makeStream(["Non ho dati meteo in questo momento, ma posso aiutarti con la pianificazione del percorso."]),
    );

    const result = await runAssistantAgent(BASE_OPTS);

    // Nessun tool deve essere stato invocato
    expect(getWeatherExecute).not.toHaveBeenCalled();
    expect(getThinkCentreStatusExecute).not.toHaveBeenCalled();
    expect(getNearbyEventsExecute).not.toHaveBeenCalled();

    expect(result.text).toContain("percorso");
    expect(result.degraded).toBe(false);
    expect(result.provider).toBe("ollama");
  });

  // -------------------------------------------------------------------------
  // (f) Ollama crasha durante il turno Horus → degraded=true, messaggio ⚠️.
  // -------------------------------------------------------------------------

  it("(f) Ollama crasha durante il turno Horus → degraded=true, messaggio di errore", async () => {
    aiMocks.streamText.mockReturnValue(
      makeStreamThatThrows(new Error("connessione Ollama interrotta")),
    );

    const result = await runAssistantAgent(BASE_OPTS);

    expect(result.degraded).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).toContain("⚠️");
  });

  // -------------------------------------------------------------------------
  // (g) La persona effettiva nel risultato è "horus" con nome corretto.
  // -------------------------------------------------------------------------

  it("(g) il risultato riporta persona=horus con nome e tutti i campi attesi", async () => {
    aiMocks.streamText.mockReturnValue(
      makeStream(["Posso aiutarti con il percorso."], { inputTokens: 60, outputTokens: 30 }),
    );

    const result = await runAssistantAgent(BASE_OPTS);

    expect(result.persona.id).toBe("horus");
    expect(result.persona.name).toBe("Horus");
    expect(typeof result.text).toBe("string");
    expect(typeof result.provider).toBe("string");
    expect(typeof result.model).toBe("string");
    expect(result.model.length).toBeGreaterThan(0);
    expect(typeof result.degraded).toBe("boolean");
    expect(typeof result.costUsd).toBe("number");
    expect(typeof result.tokensIn).toBe("number");
    expect(typeof result.tokensOut).toBe("number");
    expect(result.provider).toBe("ollama");
  });

  // -------------------------------------------------------------------------
  // (h) OLLAMA_TOOLS non compare mai nelle chiamate a streamText per Horus —
  //     verifica d'isolamento: un futuro refactor che scambiasse i set non
  //     passerebbe.
  // -------------------------------------------------------------------------

  it("(h) OLLAMA_TOOLS-only keys assenti per tutta la durata del turno Horus", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Risposta Horus."]));

    await runAssistantAgent(BASE_OPTS);

    // Tutte le chiamate a streamText (anche eventuali retry) devono escludere i
    // tool Bowie-only
    for (const call of aiMocks.streamText.mock.calls) {
      const tools = (call[0] as { tools?: ToolSet }).tools ?? {};
      expect(tools).not.toHaveProperty("getBikerStats");
      expect(tools).not.toHaveProperty("getUserPlannedRoutes");
    }
  });

  // -------------------------------------------------------------------------
  // (i) buildHubFileTools deve essere invocato con { includeWrite: true }
  //     durante il turno Horus, e le chiavi che restituisce (read_file,
  //     list_files, save_file) devono comparire nei tool passati a streamText.
  //     Un refactor che rimuova la chiamata o cambi includeWrite a false
  //     farebbe fallire questo test.
  // -------------------------------------------------------------------------

  it("(i) buildHubFileTools è chiamato con { includeWrite: true } e le sue chiavi raggiungono streamText", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["Ho letto il file condiviso."]));

    await runAssistantAgent(BASE_OPTS);

    // buildHubFileTools deve essere stato chiamato esattamente una volta
    expect(buildHubFileToolsSpy).toHaveBeenCalledTimes(1);
    // Horus ha permesso di scrittura → includeWrite DEVE essere true
    expect(buildHubFileToolsSpy).toHaveBeenCalledWith({ includeWrite: true });

    // Le chiavi restituite dal builder (mock) devono essere nel set passato a streamText
    const callArgs = aiMocks.streamText.mock.calls[0][0] as { tools?: ToolSet };
    expect(callArgs.tools).toHaveProperty("read_file");
    expect(callArgs.tools).toHaveProperty("list_files");
    expect(callArgs.tools).toHaveProperty("save_file");
  });

  // -------------------------------------------------------------------------
  // (j) buildCheckVramTool deve essere invocato durante il turno Horus, e la
  //     chiave check_vram_usage che restituisce deve comparire nei tool passati
  //     a streamText. Un refactor che rimuova la chiamata non passerebbe.
  // -------------------------------------------------------------------------

  it("(j) buildCheckVramTool è chiamato una volta e check_vram_usage raggiunge streamText", async () => {
    aiMocks.streamText.mockReturnValue(makeStream(["La VRAM GPU è al 40%."]));

    await runAssistantAgent(BASE_OPTS);

    // buildCheckVramTool deve essere stato chiamato esattamente una volta
    expect(buildCheckVramToolSpy).toHaveBeenCalledTimes(1);

    // La chiave restituita dal builder (mock) deve essere nel set passato a streamText
    const callArgs = aiMocks.streamText.mock.calls[0][0] as { tools?: ToolSet };
    expect(callArgs.tools).toHaveProperty("check_vram_usage");
  });

  // -------------------------------------------------------------------------
  // (k) Le note di memoria di Horus vengono iniettate nel system prompt.
  //     Quando loadHorusMemory restituisce contenuto, il blocco "MEMORIA
  //     PERSISTENTE DI HORUS" deve comparire PRIMA del prompt base nel campo
  //     `system` passato a streamText. Un refactor che rimuovesse o spostasse
  //     il blocco di concatenazione (agent.ts righe 482-488) farebbe fallire
  //     questo test, rendendo il fallimento rumoroso invece che silenzioso.
  // -------------------------------------------------------------------------

  it("(k) le note di memoria di Horus sono iniettate nel system prompt quando loadHorusMemory restituisce contenuto", async () => {
    const MEMORY_NOTE = "Ricorda: l'utente preferisce percorsi panoramici evitando autostrade.";

    // Sovrascriviamo il mock per questo test: memoria non vuota.
    vi.mocked(loadHorusMemory).mockResolvedValueOnce(MEMORY_NOTE);

    aiMocks.streamText.mockReturnValue(makeStream(["Percorso panoramico trovato."]));

    await runAssistantAgent(BASE_OPTS);

    expect(aiMocks.streamText).toHaveBeenCalledTimes(1);
    const callArgs = aiMocks.streamText.mock.calls[0][0] as { system?: string };

    // Il system prompt deve contenere il blocco memoria e la nota salvata.
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system).toContain("MEMORIA PERSISTENTE DI HORUS");
    expect(callArgs.system).toContain(MEMORY_NOTE);

    // Il blocco memoria deve precedere il prompt base di Horus (prefisso, non suffisso).
    const systemStr = callArgs.system ?? "";
    const memoryIdx = systemStr.indexOf("MEMORIA PERSISTENTE DI HORUS");
    const basePromptIdx = systemStr.indexOf("system: horus specialista percorsi");
    expect(memoryIdx).toBeGreaterThanOrEqual(0);
    expect(basePromptIdx).toBeGreaterThan(memoryIdx);
  });
});
