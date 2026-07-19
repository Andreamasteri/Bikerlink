/**
 * Task #864 — Schema + think:false enforcement in callOllamaChat.
 *
 * Verifica che il gating interno in ollama-client.ts non regredisca:
 *  (a) quando callOllamaChat riceve uno schema, generateObject viene chiamato con
 *      providerOptions.ollama.think === false, INDIPENDENTEMENTE dalla persona;
 *  (b) quando callOllamaChat viene chiamato con persona="horus", nessuno schema e
 *      stream:true, streamText viene chiamato SENZA la chiave think (lascia il
 *      default qwen3 a true).
 *
 * Questi test garantiscono che la logica interna di ollama-client.ts non possa
 * regredire silenziosamente (es. rimozione accidentale del conditional spread)
 * senza essere rilevata, dato che check-ai-direct-generateobject.sh copre solo
 * think:true esplicito nel codice chiamante, non la logica interna.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeModel = {};

/** Crea un AsyncIterable da un array di stringhe (simula textStream di streamText). */
async function* makeTextStream(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsThinkCentreOffline.mockResolvedValue(false);
  mockCreateOllama.mockReturnValue(() => fakeModel);
  // Default per i path non esercitati nel singolo test.
  mockGenerateObject.mockResolvedValue({ object: { label: "ok" } });
  mockGenerateText.mockResolvedValue({ text: "risposta testo" });
  mockStreamText.mockResolvedValue({ textStream: makeTextStream(["risposta streaming"]) });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Task #864 — providerOptions.ollama.think enforcement", () => {
  // ── (a) Schema presente → generateObject con think:false ──────────────────

  it("schema presente + persona bowie → generateObject riceve think:false", async () => {
    const schema = z.object({ label: z.string() });
    mockGenerateObject.mockResolvedValue({ object: { label: "ok" } });

    const { callOllamaChat } = await import("../lib/ollama-client");
    await callOllamaChat("prompt", schema, { persona: "bowie" });

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const [callArgs] = mockGenerateObject.mock.calls[0] as [Record<string, unknown>];
    const providerOptions = callArgs.providerOptions as { ollama?: { think?: boolean } };
    expect(providerOptions?.ollama?.think).toBe(false);
  });

  it("schema presente + persona horus → generateObject riceve think:false (non bypass)", async () => {
    // Verifica che la persona horus NON permetta a think di restare assente quando
    // uno schema è presente: il JSON verrebbe corrotto da un eventuale blocco <think>.
    const schema = z.object({ value: z.number() });
    mockGenerateObject.mockResolvedValue({ object: { value: 42 } });

    const { callOllamaChat } = await import("../lib/ollama-client");
    await callOllamaChat("prompt", schema, { persona: "horus" });

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const [callArgs] = mockGenerateObject.mock.calls[0] as [Record<string, unknown>];
    const providerOptions = callArgs.providerOptions as { ollama?: { think?: boolean } };
    expect(providerOptions?.ollama?.think).toBe(false);
  });

  // ── (b) Nessuno schema + persona horus + stream:true → think assente ──────

  it("nessuno schema + persona horus + stream:true → streamText NON riceve think:false", async () => {
    // Per horus senza schema il modello deve ragionare con think:true (default qwen3).
    // La chiave think non deve essere presente nell'oggetto ollama providerOptions.
    mockStreamText.mockResolvedValue({
      textStream: makeTextStream(["<think>ragionamento</think>", "Risposta."]),
    });

    const { callOllamaChat } = await import("../lib/ollama-client");
    await callOllamaChat("prompt", undefined, { persona: "horus", stream: true });

    expect(mockStreamText).toHaveBeenCalledTimes(1);
    const [callArgs] = mockStreamText.mock.calls[0] as [Record<string, unknown>];
    const providerOptions = callArgs.providerOptions as { ollama?: { think?: boolean } };
    // think deve essere assente (non impostato a false), lasciando il default qwen3 a true.
    expect(providerOptions?.ollama).not.toHaveProperty("think");
  });

  it("nessuno schema + persona horus + stream:true → strippa il think block nel testo", async () => {
    // Smoke-test complementare: il testo ritornato non deve includere il blocco <think>.
    mockStreamText.mockResolvedValue({
      textStream: makeTextStream(["<think>ragionamento interno</think>", "Risposta Horus."]),
    });

    const { callOllamaChat } = await import("../lib/ollama-client");
    const result = await callOllamaChat("prompt", undefined, { persona: "horus", stream: true });

    expect(result).toBe("Risposta Horus.");
  });
});
