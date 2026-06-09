// Task #2966 — AI Universal Cascade: verifica che runWithFallback percorra l'intera
// catena cloud (Groq→Gemini→OpenAI) e, con ollamaBackstop attivo, ricada
// su Ollama self-hosted come rete finale quando tutti i provider cloud falliscono.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import
// ---------------------------------------------------------------------------

// I provider cloud condividono createOpenAI (Groq riusa il client OpenAI con baseURL);
// distinguiamo i tier tramite m.providerName, non tramite il modello sentinella.
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
  storage: { getAppSetting: vi.fn().mockResolvedValue(null) },
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

describe("runWithFallback — AI Universal Cascade (Task #2966)", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.OPENAI_API_KEY = "test-openai";
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("primo provider (Groq) risponde → nessun fallback, Ollama non chiamato", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { value, model } = await runWithFallback(
      { role: "brain", preferredProvider: "auto", ollamaBackstop: true },
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

  it("tutti i cloud falliscono + ollamaBackstop → ricade su Ollama self-hosted", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { value, model } = await runWithFallback(
      { role: "brain", preferredProvider: "auto", ollamaBackstop: true },
      (m) => {
        calls.push(m.providerName);
        if (m.providerName === "ollama") return Promise.resolve("ollama-saved-the-day");
        return Promise.reject(new Error(`${m.providerName} esaurito (429)`));
      },
    );
    expect(value).toBe("ollama-saved-the-day");
    expect(model.providerName).toBe("ollama");
    // L'intera catena cloud è stata tentata prima del backstop.
    expect(calls).toEqual(["groq", "google", "openai", "ollama"]);
  });

  it("tutti i cloud falliscono SENZA ollamaBackstop → propaga l'errore (nessun Ollama)", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    await expect(
      runWithFallback(
        { role: "brain", preferredProvider: "auto", ollamaBackstop: false },
        (m) => {
          calls.push(m.providerName);
          return Promise.reject(new Error(`${m.providerName} esaurito`));
        },
      ),
    ).rejects.toThrow("esaurito");
    expect(calls).not.toContain("ollama");
    expect(calls).toEqual(["groq", "google", "openai"]);
  });

  it("preferredProvider mette il provider scelto in testa alla catena", async () => {
    const runWithFallback = await freshRunWithFallback();
    const calls: string[] = [];
    const { model } = await runWithFallback(
      { role: "brain", preferredProvider: "openai", ollamaBackstop: true },
      (m) => {
        calls.push(m.providerName);
        return Promise.resolve(`ok-${m.providerName}`);
      },
    );
    expect(model.providerName).toBe("openai");
    expect(calls[0]).toBe("openai");
  });
});
