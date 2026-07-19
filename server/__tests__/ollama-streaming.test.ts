/**
 * Task #737 — Streaming Ollama path: chunk collection + stripThinkBlock.
 *
 * Verifica che il path `stream: true` in `callOllamaChat`:
 *  (a) collezioni tutti i chunk in ordine senza perderne nessuno,
 *  (b) applichi `stripThinkBlock` correttamente sul testo riassemblato
 *      (incluso il caso in cui il tag <think>…</think> è spezzato su chunk diversi),
 *  (c) produca lo stesso risultato logico del path non-streaming per horus.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Env vars — impostati prima dell'import del modulo (consts a module-scope) ─

process.env.BOWIE_OLLAMA_URL = "https://ollama.test.local";
process.env.BOWIE_OLLAMA_TOKEN = "test-token";
process.env.HORUS_OLLAMA_URL = "https://ollama.test.local";
process.env.HORUS_OLLAMA_TOKEN = "test-token";
process.env.BOWIE_OLLAMA_MODEL = "qwen3:1.7b";
process.env.HORUS_OLLAMA_MODEL = "qwen3:4b";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockStreamText, mockGenerateText, mockGenerateObject } = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockGenerateText: vi.fn(),
  mockGenerateObject: vi.fn(),
}));

const { mockIsThinkCentreOffline } = vi.hoisted(() => ({
  mockIsThinkCentreOffline: vi.fn().mockResolvedValue(false),
}));

const { mockCreateOllama } = vi.hoisted(() => ({
  mockCreateOllama: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("ai", () => ({
  streamText: mockStreamText,
  generateText: mockGenerateText,
  generateObject: mockGenerateObject,
}));

vi.mock("ollama-ai-provider-v2", () => ({
  createOllama: mockCreateOllama,
}));

vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: mockIsThinkCentreOffline,
}));

vi.mock("../lib/cf-access", () => ({
  cfAccessHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../lib/ai-logger", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/json-repair", () => ({
  repairJson: vi.fn().mockReturnValue({ ok: false }),
}));

vi.mock("../lib/agent-constants", () => ({
  KEEP_ALIVE_RESIDENT: -1,
  AGENT_MODEL_DEFAULTS: {
    bowie: "qwen3:1.7b",
    horus: "qwen3:4b",
    ares: "devstral",
  },
}));

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Crea un AsyncIterable da un array di stringhe (simula textStream di streamText). */
async function* makeTextStream(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const fakeModel = {};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsThinkCentreOffline.mockResolvedValue(false);
  // createOllama ritorna una factory; la factory ritorna fakeModel.
  mockCreateOllama.mockReturnValue(() => fakeModel);
  // Default non-streaming: non deve essere chiamato nei test streaming.
  mockGenerateText.mockResolvedValue({ text: "" });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Task #737 — callOllamaChat stream:true", () => {
  it("colleziona tutti i chunk e ritorna il testo riassemblato", async () => {
    const chunks = ["Hello", " world", "!"];
    mockStreamText.mockResolvedValue({ textStream: makeTextStream(chunks) });

    const { callOllamaChat } = await import("../lib/ollama-client");
    const result = await callOllamaChat("test prompt", undefined, {
      stream: true,
      persona: "bowie",
    });

    expect(result).toBe("Hello world!");
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    // Non deve usare il path non-streaming
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("strippa <think>…</think> completo riassemblato per persona horus", async () => {
    // Il tag <think>…</think> è spezzato su chunk diversi per simulare lo split reale
    const chunks = ["<thi", "nk>ragionamento interno</", "think>\nRisposta effettiva."];
    mockStreamText.mockResolvedValue({ textStream: makeTextStream(chunks) });

    const { callOllamaChat } = await import("../lib/ollama-client");
    const result = await callOllamaChat("test prompt", undefined, {
      stream: true,
      persona: "horus",
    });

    expect(result).toBe("Risposta effettiva.");
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it("NON strippa il think block per persona bowie (think:false → nessun blocco atteso)", async () => {
    // Bowie non ha think:true; se per qualche motivo arrivasse un blocco, non va strippato.
    const chunks = ["<think>reason</think>", "Risposta Bowie."];
    mockStreamText.mockResolvedValue({ textStream: makeTextStream(chunks) });

    const { callOllamaChat } = await import("../lib/ollama-client");
    const result = await callOllamaChat("test prompt", undefined, {
      stream: true,
      persona: "bowie",
    });

    // Bowie non chiama stripThinkBlock → testo grezzo
    expect(result).toBe("<think>reason</think>Risposta Bowie.");
  });

  it("produce lo stesso risultato logico del path non-streaming per horus", async () => {
    const fullText = "<think>ragionamento</think>\nRisposta finale.";
    const expected = "Risposta finale.";

    // Streaming: chunk che riassemblati danno fullText
    const chunks = ["<think>ragio", "namento</think>\n", "Risposta finale."];
    mockStreamText.mockResolvedValue({ textStream: makeTextStream(chunks) });
    mockGenerateText.mockResolvedValue({ text: fullText });

    const { callOllamaChat } = await import("../lib/ollama-client");

    const streamResult = await callOllamaChat("test", undefined, {
      stream: true,
      persona: "horus",
    });
    const nonStreamResult = await callOllamaChat("test", undefined, {
      stream: false,
      persona: "horus",
    });

    expect(streamResult).toBe(expected);
    expect(nonStreamResult).toBe(expected);
  });

  it("strippa tag </think> orfano (blocco di apertura già consumato da chunk precedenti)", async () => {
    // Caso: il modello emette </think> senza <think> visibile nel testo corrente
    const chunks = ["</thi", "nk>", "Risposta dopo tag orfano."];
    mockStreamText.mockResolvedValue({ textStream: makeTextStream(chunks) });

    const { callOllamaChat } = await import("../lib/ollama-client");
    const result = await callOllamaChat("test prompt", undefined, {
      stream: true,
      persona: "horus",
    });

    expect(result).toBe("Risposta dopo tag orfano.");
  });

  it("gestisce un textStream con chunk singolo senza tag think", async () => {
    const chunks = ["Risposta diretta senza think block."];
    mockStreamText.mockResolvedValue({ textStream: makeTextStream(chunks) });

    const { callOllamaChat } = await import("../lib/ollama-client");
    const result = await callOllamaChat("test prompt", undefined, {
      stream: true,
      persona: "horus",
    });

    expect(result).toBe("Risposta diretta senza think block.");
  });

  it("passa stream:false al path generateText senza schema (regression guard)", async () => {
    const text = "Risposta non-streaming.";
    mockGenerateText.mockResolvedValue({ text });

    const { callOllamaChat } = await import("../lib/ollama-client");
    const result = await callOllamaChat("test prompt", undefined, {
      stream: false,
      persona: "bowie",
    });

    expect(result).toBe(text);
    expect(mockStreamText).not.toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});
