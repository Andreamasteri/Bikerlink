// Task #3872 — AI Universal Cascade: ordine Ollama-first universale.
// Verifica che runWithFallback tenti Ollama per PRIMO (se configurato),
// poi Groq → Gemini → OpenAI; e che skipOllama: true preservi il comportamento
// cloud-only per i caller che lo richiedono (es. moderation chat con tool calling).
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import
// ---------------------------------------------------------------------------

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn(() => vi.fn(() => ({ __p: "openai" }))) }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ __p: "google" }))) }));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __p: "ollama" })),
}));

// Scheduler pass-through: niente Bottleneck nei test.
vi.mock("../lib/throttle", () => ({
  limiters: {
    openai: { schedule: (f: () => unknown) => f() },
    gemini: { schedule: (f: () => unknown) => f() },
    groq: { schedule: (f: () => unknown) => f() },
  },
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn().mockResolvedValue(null),
    upsertAppSetting: vi.fn().mockResolvedValue(null),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RunWithFallback = typeof import("../ai/moderation/provider").runWithFallback;

async function freshRunWithFallback(): Promise<RunWithFallback> {
  // resetModules → ogni test riparte con lo stato health/cap del provider pulito,
  // così i cooldown impostati da un test non contaminano il successivo.
  vi.resetModules();
  const mod = await import("../ai/moderation/provider");
  return mod.runWithFallback;
}

describe("runWithFallback — AI Universal Cascade (Task #3872, Ollama-first)", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.OPENAI_API_KEY = "test-openai";
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("Ollama configurato e funzionante → risponde per primo, cloud non chiamato", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { value, model } = await runWithFallback(
      { role: "brain" },
      (m) => {
        calls.push(m.providerName);
        return Promise.resolve(`ok-${m.providerName}`);
      },
    );
    expect(value).toBe("ok-ollama");
    expect(model.providerName).toBe("ollama");
    expect(calls).toEqual(["ollama"]);
    expect(calls).not.toContain("groq");
  });

  it("Ollama offline → scala a Groq (primo cloud), resto non chiamato", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { value, model } = await runWithFallback(
      { role: "brain" },
      (m) => {
        calls.push(m.providerName);
        if (m.providerName === "ollama") return Promise.reject(new Error("ollama timeout"));
        return Promise.resolve(`ok-${m.providerName}`);
      },
    );
    expect(value).toBe("ok-groq");
    expect(model.providerName).toBe("groq");
    expect(calls).toEqual(["ollama", "groq"]);
  });

  it("Ollama + Groq + Google offline → OpenAI risponde", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { value, model } = await runWithFallback(
      { role: "brain" },
      (m) => {
        calls.push(m.providerName);
        if (m.providerName !== "openai") return Promise.reject(new Error(`${m.providerName} down`));
        return Promise.resolve("openai-saved");
      },
    );
    expect(value).toBe("openai-saved");
    expect(model.providerName).toBe("openai");
    expect(calls).toEqual(["ollama", "groq", "google", "openai"]);
  });

  it("tutti i provider falliscono → propaga l'errore dell'ultimo", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    await expect(
      runWithFallback(
        { role: "brain" },
        (m) => {
          calls.push(m.providerName);
          return Promise.reject(new Error(`${m.providerName} esaurito`));
        },
      ),
    ).rejects.toThrow("esaurito");
    expect(calls).toEqual(["ollama", "groq", "google", "openai"]);
  });

  it("skipOllama: true → Groq per primo (cloud-only, es. tool calling)", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { value, model } = await runWithFallback(
      { role: "brain", skipOllama: true },
      (m) => {
        calls.push(m.providerName);
        return Promise.resolve(`ok-${m.providerName}`);
      },
    );
    expect(value).toBe("ok-groq");
    expect(model.providerName).toBe("groq");
    expect(calls).toEqual(["groq"]);
    expect(calls).not.toContain("ollama");
  });

  it("skipOllama: true + tutti cloud falliscono → propaga errore (nessun Ollama)", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    await expect(
      runWithFallback(
        { role: "brain", skipOllama: true },
        (m) => {
          calls.push(m.providerName);
          return Promise.reject(new Error(`${m.providerName} esaurito`));
        },
      ),
    ).rejects.toThrow("esaurito");
    expect(calls).not.toContain("ollama");
    expect(calls).toEqual(["groq", "google", "openai"]);
  });

  it("preferredProvider mette il provider cloud scelto in testa (dopo Ollama)", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { value, model } = await runWithFallback(
      { role: "brain", preferredProvider: "openai", skipOllama: true },
      (m) => {
        calls.push(m.providerName);
        return Promise.resolve(`ok-${m.providerName}`);
      },
    );
    expect(model.providerName).toBe("openai");
    expect(calls[0]).toBe("openai");
    expect(calls).not.toContain("ollama");
  });

  it("ollamaBackstop (legacy): ridondante con Ollama-first, ma non causa doppioni se Ollama già tentato", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { value, model } = await runWithFallback(
      { role: "brain", ollamaBackstop: true },
      (m) => {
        calls.push(m.providerName);
        return Promise.resolve(`ok-${m.providerName}`);
      },
    );
    // Ollama risponde per primo → valore corretto, nessun cloud chiamato.
    expect(value).toBe("ok-ollama");
    expect(model.providerName).toBe("ollama");
    // Ollama appare una sola volta (non doppiato dalla sezione backstop).
    expect(calls.filter((c) => c === "ollama")).toHaveLength(1);
  });
});
