// Task #78 — Nadir citato dagli agenti su richiamo semantico (end-to-end turno).
//
// Task #75 ha cablato il tool `search_manual` (Nadir) per Bowie/Horus,
// gated su SEARCH_MANUAL_RE. I test unitari coprono il gating e la ricerca,
// ma NESSUN test esercitava un intero turno d'agente: utente → cue → Nadir
// consultato → frammenti nella risposta.
//
// Qui guidiamo `runAssistantAgent` per Bowie e Horus:
//   • con un messaggio che contiene un cue di richiamo semantico verifichiamo che
//     Nadir sia consultato e che i frammenti (con origine + similarità) emergano
//     nella risposta (tool);
//   • con un messaggio generico verifichiamo che Nadir NON venga MAI attaccato/consultato.
// (Task #591: Quebracho removed — unified into Horus)
//
// Così un futuro refactoring della logica di attach dei tool non può spegnere Nadir
// in silenzio.
//
// Nota (memoria drizzle-sql-mock-agent-import): importare l'agente tira dentro
// db-integrity → counters.ts che usa il tagged-template `sql` a module-scope, quindi
// il mock di drizzle-orm DEVE esportare `sql`.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — riferimenti stabili creati prima delle factory vi.mock()
// ---------------------------------------------------------------------------

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  isStepCount: vi.fn(() => "step-count-is-3-sentinel"),
}));

const providerMocks = vi.hoisted(() => ({
  runWithFallback: vi.fn(),
  estimateCostUsd: vi.fn(() => 0),
}));

// Spy centrale di Nadir: unica fonte per verificare "Nadir è stato consultato?".
const searchNadirMock = vi.hoisted(() => vi.fn());

// streamQuebrachoChatMock removed (Task #591 — Quebracho unified into Horus)

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  streamText: aiMocks.streamText,
  isStepCount: aiMocks.isStepCount,
  tool: vi.fn((definition) => definition),
}));

vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: providerMocks.runWithFallback,
  estimateCostUsd: providerMocks.estimateCostUsd,
}));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __provider: "ollama", modelId: "qwen3:1.7b" })),
  warmOllama: vi.fn(),
}));

// ThinkCentre sempre "online" → Ollama è il provider primario (deterministico).
vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: vi.fn().mockResolvedValue(false),
}));

// Nadir: `searchNadir` è uno spy; `SEARCH_MANUAL_RE` resta il regex REALE
// (importato dai constants puri) così testiamo il gating vero, non una copia.
vi.mock("../ai/nadir", async () => {
  const constants = await vi.importActual<typeof import("../ai/nadir/constants")>(
    "../ai/nadir/constants",
  );
  return {
    ...constants,
    searchNadir: searchNadirMock,
  };
});

// quebracho-client and quebracho-question removed (Task #591 — Quebracho unified into Horus)

// Tool set per persona. `buildSearchManualTool` rispecchia il tool reale:
// la sua `execute` delega a `searchNadir` (lo spy). Gli altri builder sono
// inerti — qui interessa SOLO l'attach/consulto di Nadir.
vi.mock("../ai/assistant/tools", () => ({
  OLLAMA_TOOLS: {
    getWeather: { description: "meteo", inputSchema: {}, execute: vi.fn() },
  },
  HORUS_TOOLS: {
    getWeather: { description: "meteo", inputSchema: {}, execute: vi.fn() },
  },
  buildRunSecurityScanTool: vi.fn(() => ({})),
  buildBowieInterAgentTools: vi.fn(() => ({})),
  buildRememberNoteTool: vi.fn(() => ({})),
  buildReviewTaskPlanTool: vi.fn(() => ({})),
  buildSearchManualTool: vi.fn(
    (opts: { requesterId?: string | null; includeAllUsers?: boolean } = {}) => ({
      search_manual: {
        description: "Cerca per significato nella knowledge base Nadir.",
        inputSchema: {},
        execute: async (input: { query: string; limit?: number | null }) => {
          const result = await searchNadirMock(input.query, input.limit ?? 5, {
            requesterId: opts.requesterId ?? null,
            includeAllUsers: opts.includeAllUsers ?? false,
          });
          return {
            ok: true,
            model: result.model,
            fragments: result.fragments.map(
              (f: { origin: string; similarity: number; text: string }) => ({
                origin: f.origin,
                similarity: Number(f.similarity.toFixed(4)),
                text: f.text,
              }),
            ),
          };
        },
      },
    }),
  ),
}));

vi.mock("../ai/assistant/knowledge", () => ({
  buildSystemPrompt: vi.fn(() => "system: assistente moto"),
  buildAdminSystemPrompt: vi.fn(() => "system: admin"),
  buildHorusSystemPrompt: vi.fn(() => "system: horus"),
  buildAresSystemPrompt: vi.fn(() => "system: ares"),
  // buildQuebrachoSystemPrompt removed (Task #591)
}));

vi.mock("../ai/assistant/rag", () => ({
  retrieveContext: vi.fn(() => []),
  formatRagContext: vi.fn(() => ""),
  indexKnowledge: vi.fn(),
}));

// Memoria persistente di Horus: assente (nessuna sezione iniettata).
vi.mock("../ai/assistant/horus-memory", () => ({
  loadHorusMemory: vi.fn().mockResolvedValue(null),
}));

// Contesto utente live: vuoto e deterministico.
vi.mock("../ai/assistant/user-context", () => ({
  fetchUserLiveContext: vi.fn().mockResolvedValue(""),
}));

// Lacune di conoscenza: no-op (fire-and-forget di fine turno).
vi.mock("../ai/assistant/knowledge-gaps", () => ({
  recordKnowledgeGap: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/ai-logger", () => ({
  logAiCall: vi.fn(),
}));

// Drizzle chain: select().from().where().orderBy().limit() → []
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

vi.mock("drizzle-orm", () => {
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: strings, values }));
  (sql as unknown as { raw: unknown }).raw = vi.fn((s: string) => ({ __rawSql: s }));
  return {
    eq: vi.fn((a: unknown, b: unknown) => `eq(${String(a)},${String(b)})`),
    desc: vi.fn((a: unknown) => `desc(${String(a)})`),
    sql,
  };
});

vi.mock("../ai/assistant/memory-pruner", () => ({
  pruneUserMemory: vi.fn().mockResolvedValue(undefined),
  MEMORY_TURNS_LIMIT: 10,
}));

// ---------------------------------------------------------------------------
// Import under test — dopo tutti i mock
// ---------------------------------------------------------------------------

import { runAssistantAgent } from "../ai/assistant/agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolExec = { execute: (a: Record<string, unknown>) => Promise<unknown> };
type ToolSet = Record<string, ToolExec | undefined>;

// Frammenti finti restituiti da Nadir: testo UNICO e riconoscibile per poterlo
// ritrovare senza ambiguità nel risultato o nel system prompt.
const FRAG_CONVERSATION = "NADIRFRAG_CONV_991: ti avevo detto che preferisci le curve";
const FRAG_MANUAL = "NADIRFRAG_MAN_772: sezione del manuale sulle preferenze";

function nadirResult() {
  return {
    model: "local:test-embed",
    fragments: [
      { origin: "conversation", text: FRAG_CONVERSATION, similarity: 0.871, entityId: "c1" },
      { origin: "manual", text: FRAG_MANUAL, similarity: 0.723, entityId: "m1" },
    ],
  };
}

/**
 * Mock di streamText: se il turno allega `search_manual`, ESEGUE il tool (come
 * farebbe il Vercel AI SDK) e riversa i frammenti nel testo finale. Altrimenti
 * produce prosa generica. Copre così sia il caso cue sia quello generico.
 */
function installStreamTextMock() {
  aiMocks.streamText.mockImplementation((args: { tools?: ToolSet }) => {
    const tools = args.tools;
    return {
      textStream: (async function* () {
        if (tools?.search_manual) {
          const out = (await tools.search_manual.execute({
            query: "richiamo semantico",
            limit: 5,
          })) as { fragments: Array<{ origin: string; text: string }> };
          yield "Ecco cosa ho ritrovato nella knowledge base: ";
          for (const f of out.fragments) yield `[${f.origin}] ${f.text} `;
        } else {
          yield "Ciao! Va tutto bene, come posso aiutarti?";
        }
      })(),
      usage: Promise.resolve({ inputTokens: 20, outputTokens: 30 }),
    };
  });
}

// History non vuota → nessuna poesia di intro (mantiene il testo pulito).
const HISTORY = [
  { role: "user" as const, content: "ciao" },
  { role: "assistant" as const, content: "ciao, come posso aiutarti?" },
];

const lastStreamTextCall = () =>
  aiMocks.streamText.mock.calls[aiMocks.streamText.mock.calls.length - 1][0] as { tools?: ToolSet };

// lastQuebrachoSystem removed (Task #591 — Quebracho unified into Horus)

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Task #78 — Nadir citato su richiamo semantico (turno d'agente e2e)", () => {
  beforeEach(() => {
    aiMocks.streamText.mockReset();
    aiMocks.isStepCount.mockClear();
    searchNadirMock.mockReset();
    searchNadirMock.mockResolvedValue(nadirResult());
    // streamQuebrachoChatMock.mockReset() removed (Task #591 — Quebracho unified into Horus)
    providerMocks.runWithFallback.mockRejectedValue(new Error("cloud offline (mock)"));
    installStreamTextMock();
  });

  // ── Bowie: cue → tool search_manual attaccato ed eseguito ────────────────────
  it("Bowie: un cue di richiamo attacca ed esegue Nadir, i frammenti finiscono nella risposta", async () => {
    const result = await runAssistantAgent({
      message: "cosa ti avevo detto la volta scorsa?",
      platform: "android",
      allowedActions: [],
      userId: "user-bowie-1",
      persona: "bowie",
      history: HISTORY,
    });

    // Nadir consultato con lo scoping dell'utente (non admin → includeAllUsers false).
    expect(searchNadirMock).toHaveBeenCalledTimes(1);
    expect(searchNadirMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.objectContaining({ requesterId: "user-bowie-1", includeAllUsers: false }),
    );

    // Il tool è stato davvero allegato al turno.
    expect(lastStreamTextCall().tools).toHaveProperty("search_manual");

    // I frammenti (con origine) emergono nella risposta.
    expect(result.text).toContain(FRAG_CONVERSATION);
    expect(result.text).toContain(FRAG_MANUAL);
    expect(result.text).toContain("[conversation]");
    expect(result.persona.id).toBe("bowie");
    expect(result.degraded).toBe(false);
    expect(result.provider).toBe("ollama");
  });

  // ── Horus: cue → tool search_manual attaccato ed eseguito ────────────────────
  it("Horus: un cue di richiamo attacca ed esegue Nadir, i frammenti finiscono nella risposta", async () => {
    const result = await runAssistantAgent({
      message: "ne avevamo già parlato di questo?",
      platform: "android",
      allowedActions: [],
      userId: "user-horus-1",
      persona: "horus",
      history: HISTORY,
    });

    expect(searchNadirMock).toHaveBeenCalledTimes(1);
    expect(lastStreamTextCall().tools).toHaveProperty("search_manual");
    expect(result.text).toContain(FRAG_CONVERSATION);
    expect(result.text).toContain(FRAG_MANUAL);
    expect(result.persona.id).toBe("horus");
    expect(result.degraded).toBe(false);
    expect(result.provider).toBe("ollama");
  });

  // (Task #591: Quebracho pre-composition injection tests removed — Quebracho unified into Horus)

  // ── Messaggio generico (tool path Bowie): Nadir NON attaccato/consultato ─────
  it("Bowie: un messaggio generico NON attacca né consulta Nadir", async () => {
    const result = await runAssistantAgent({
      message: "ciao, come va oggi?",
      platform: "android",
      allowedActions: [],
      userId: "user-bowie-2",
      persona: "bowie",
      history: HISTORY,
    });

    expect(searchNadirMock).not.toHaveBeenCalled();
    // Nessun tool allegato per un turno puramente conversazionale.
    expect(lastStreamTextCall().tools).toBeUndefined();
    expect(result.text).not.toContain(FRAG_CONVERSATION);
    expect(result.degraded).toBe(false);
  });

  // (Task #591: Quebracho generic message test removed — Quebracho unified into Horus)
});
